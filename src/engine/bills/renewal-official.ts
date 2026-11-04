import { addDays, fromOrdinal, ordinal, parseDate, toIso, type CivilDate } from '../date';
import { round2 } from '../money';
import { pvpcMeanAllBetween, type OfficialDeps } from './electricity-official';
import { normStanding, type BillsNormId } from './norms';
import { recalculate, regulatedOn } from './renewal';
import type { RenewalDeps, RenewalInput } from './renewal-types';
import { valueOn, type RowDoubt, type TableRow, type VatRate } from './tables';

const WINDOW_DAYS = 365;
const DECLARED_TOLERANCE = 1;

export type PvpcComparison =
  | {
      readonly kind: 'ok';
      // First and last day of the PVPC prices averaged.
      readonly from: string;
      readonly to: string;
      // Whole months the prices cover when they are fewer than the year asked for; null for a year.
      readonly months: number | null;
      // Yearly cost without taxes at the PVPC, and at the letter's new prices.
      readonly annual: number;
      readonly next: number;
      // What the letter's prices cost beyond the PVPC; negative when they cost less.
      readonly difference: number;
      // Set when the PVPC margin rests on a row the sources leave in doubt.
      readonly doubt: RowDoubt | null;
    }
  // No PVPC hours to average.
  | { readonly kind: 'no_data' }
  // Tolls, charges or the PVPC margin of the renewal day are not loaded, or rest on open norms.
  | { readonly kind: 'missing_table'; readonly day: string }
  | { readonly kind: 'conditional'; readonly norms: readonly BillsNormId[] }
  | { readonly kind: 'no_consumption' }
  | { readonly kind: 'needs_period_use' };

// Whole months from `first` to `last`, both included.
function wholeMonths(first: CivilDate, last: CivilDate): number {
  const end = addDays(last, 1);
  return (end.y - first.y) * 12 + (end.m - first.m) - (end.d < first.d ? 1 : 0);
}

// The PVPC priced as the letter's consumption would have paid it over the last year of prices
// published: tolls, charges and the fixed margin on the power, the plain mean of every hour on
// the energy.
export function compareWithPvpc(
  input: RenewalInput,
  deps: RenewalDeps & OfficialDeps,
): PvpcComparison {
  const letter = recalculate(input);
  if (letter.kind !== 'ok') return letter;
  const { annualKwh } = input;
  if (annualKwh === null) return { kind: 'no_consumption' };
  const regulated = regulatedOn(input.renewalDate, deps);
  const margin = valueOn(deps.tables.pvpcMargin, input.renewalDate, deps.norms);
  if (regulated.kind === 'missing_table' || margin.kind === 'missing')
    return { kind: 'missing_table', day: input.renewalDate };
  if (regulated.kind === 'conditional' || margin.kind === 'conditional') {
    const deciding = [regulated, margin].flatMap((f) => (f.kind === 'conditional' ? f.norms : []));
    return { kind: 'conditional', norms: [...new Set(deciding)] };
  }
  const first = Object.keys(deps.pvpc.days).sort()[0];
  if (first === undefined) return { kind: 'no_data' };
  const last = parseDate(deps.pvpc.coveredUntil);
  const from = fromOrdinal(Math.max(ordinal(parseDate(first)) - 1, ordinal(last) - WINDOW_DAYS));
  const mean = pvpcMeanAllBetween(from, last, deps.pvpc);
  if (mean === null) return { kind: 'no_data' };
  const { power } = regulated.prices;
  const annual = round2(
    input.powerKw.p1 * (power.p1 + margin.row.value) +
      input.powerKw.p2 * power.p2 +
      annualKwh * mean,
  );
  return {
    kind: 'ok',
    from: toIso(addDays(from, 1)),
    to: deps.pvpc.coveredUntil,
    months:
      ordinal(last) - ordinal(from) < WINDOW_DAYS ? wholeMonths(addDays(from, 1), last) : null,
    annual,
    next: letter.next,
    difference: round2(letter.next - annual),
    doubt: margin.row.doubt ?? null,
  };
}

// One way the open norms may go: those met and those not.
export interface Outcome {
  readonly met: readonly BillsNormId[];
  readonly notMet: readonly BillsNormId[];
}

// The rates left by every outcome in `when`.
export interface ConditionalOption {
  readonly when: readonly Outcome[];
  readonly electricityTaxPercent: number;
  readonly vatPercent: number;
  readonly withTax: number;
}

type MutableOption = Omit<ConditionalOption, 'when'> & { when: Outcome[] };

export type RenewalTaxes =
  | {
      readonly kind: 'ok';
      readonly electricityTaxPercent: number;
      readonly vatPercent: number;
      readonly withTax: number;
      // Whether the letter's cost with taxes is within 1 € of ours; null when it gives none.
      readonly declaredMatches: boolean | null;
    }
  // A tax rate on the renewal day depends on a norm not yet settled: each way it may go.
  | {
      readonly kind: 'conditional';
      readonly options: readonly ConditionalOption[];
      // Outcomes in which a table has no row to apply.
      readonly unknown: readonly Outcome[];
    }
  | { readonly kind: 'missing' };

function vatPercent(rate: VatRate, powerKw: number): number {
  if (rate.kind === 'general') return rate.percent;
  const within = rate.powerLimitIncluded
    ? powerKw <= rate.powerLimitKw
    : powerKw < rate.powerLimitKw;
  return within ? rate.percent : rate.generalPercent;
}

// The electricity tax and VAT of the renewal day over the cost without taxes, in the order the
// bill applies them: the tax on the base, VAT on both.
export function renewalTaxes(
  input: RenewalInput,
  nextWithoutTax: number,
  { tables, norms }: RenewalDeps,
): RenewalTaxes {
  const tax = valueOn(tables.electricityTax, input.renewalDate, norms);
  const vat = valueOn(tables.vat, input.renewalDate, norms);
  if (tax.kind === 'missing' || vat.kind === 'missing') return { kind: 'missing' };
  const withTax = (taxPercent: number, vatRate: number) =>
    round2(nextWithoutTax * (1 + taxPercent / 100) * (1 + vatRate / 100));
  if (tax.kind === 'ok' && vat.kind === 'ok') {
    const [taxPercent, vatRate] = [
      tax.row.value.percent,
      vatPercent(vat.row.value, input.powerKw.p1),
    ];
    const ours = withTax(taxPercent, vatRate);
    const declared = input.declared.withTax;
    return {
      kind: 'ok',
      electricityTaxPercent: taxPercent,
      vatPercent: vatRate,
      withTax: ours,
      declaredMatches: declared === null ? null : Math.abs(declared - ours) <= DECLARED_TOLERANCE,
    };
  }
  const deciding = [
    ...new Set([
      ...(tax.kind === 'conditional' ? tax.norms : []),
      ...(vat.kind === 'conditional' ? vat.norms : []),
    ]),
  ];
  const taxRows = tax.kind === 'ok' ? [tax.row] : tax.rows;
  const vatRows = vat.kind === 'ok' ? [vat.row] : vat.rows;
  const options = new Map<string, MutableOption>();
  const unknown: Outcome[] = [];
  // Every way the open norms may go; each table then holds the row valueOn would pick.
  for (let mask = 0; mask < 2 ** deciding.length; mask++) {
    const met = deciding.filter((_, i) => (mask >> i) & 1);
    const holds = (id: BillsNormId) =>
      deciding.includes(id)
        ? met.includes(id)
        : normStanding(norms[id], input.renewalDate) === 'in_force';
    const pick = <V>(rows: readonly TableRow<V>[]) =>
      rows.find(
        (row) =>
          [row.norm, ...(row.alsoRestsOn ?? [])].every(
            (id) => !deciding.includes(id) || holds(id),
          ) && !(row.unless !== undefined && row.unless.every(holds)),
      );
    const [t, v] = [pick(taxRows), pick(vatRows)];
    const outcome = { met, notMet: deciding.filter((id) => !met.includes(id)) };
    if (t === undefined || v === undefined) {
      unknown.push(outcome);
      continue;
    }
    const vatRate = vatPercent(v.value, input.powerKw.p1);
    const key = `${t.value.percent}/${vatRate}`;
    const found = options.get(key);
    if (found !== undefined) {
      found.when.push(outcome);
      continue;
    }
    options.set(key, {
      when: [outcome],
      electricityTaxPercent: t.value.percent,
      vatPercent: vatRate,
      withTax: withTax(t.value.percent, vatRate),
    });
  }
  return {
    kind: 'conditional',
    options: [...options.values()].sort((a, b) => a.withTax - b.withTax),
    unknown,
  };
}
