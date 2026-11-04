import { addDays, fromOrdinal, ordinal, parseDate, toIso } from '../date';
import { round2 } from '../money';
import { pvpcMeansBetween, type OfficialDeps } from './electricity-official';
import type { BillsNormId } from './norms';
import { recalculate, regulatedOn } from './renewal';
import type { RenewalDeps, RenewalInput } from './renewal-types';
import { valueOn, type TableRow, type VatRate } from './tables';

const WINDOW_DAYS = 365;
const DECLARED_TOLERANCE = 1;

export type PvpcComparison =
  | {
      readonly kind: 'ok';
      // First and last day of the PVPC prices averaged.
      readonly from: string;
      readonly to: string;
      // Yearly cost without taxes at the PVPC, and at the letter's new prices.
      readonly annual: number;
      readonly next: number;
      // What the letter's prices cost beyond the PVPC; negative when they cost less.
      readonly difference: number;
    }
  | { readonly kind: 'no_data' }
  | { readonly kind: 'no_consumption' }
  | { readonly kind: 'needs_period_use' };

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
  const first = Object.keys(deps.pvpc.days).sort()[0];
  if (first === undefined) return { kind: 'no_data' };
  const last = parseDate(deps.pvpc.coveredUntil);
  const from = fromOrdinal(Math.max(ordinal(parseDate(first)) - 1, ordinal(last) - WINDOW_DAYS));
  const means = pvpcMeansBetween(from, last, deps);
  const regulated = regulatedOn(input.renewalDate, deps);
  const margin = valueOn(deps.tables.pvpcMargin, input.renewalDate, deps.norms);
  if (means === null || means.all === null || regulated.kind !== 'ok' || margin.kind !== 'ok') {
    return { kind: 'no_data' };
  }
  const { power } = regulated.prices;
  const annual = round2(
    input.powerKw.p1 * (power.p1 + margin.row.value) +
      input.powerKw.p2 * power.p2 +
      annualKwh * means.all,
  );
  return {
    kind: 'ok',
    from: toIso(addDays(from, 1)),
    to: deps.pvpc.coveredUntil,
    annual,
    next: letter.next,
    difference: round2(letter.next - annual),
  };
}

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
      readonly options: readonly {
        readonly norms: readonly BillsNormId[];
        readonly withTax: number;
      }[];
    }
  | { readonly kind: 'missing' };

const restsOn = (row: TableRow<unknown>): readonly BillsNormId[] => [
  row.norm,
  ...(row.alsoRestsOn ?? []),
  ...(row.unless ?? []),
];

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
  const taxRows = tax.kind === 'ok' ? [tax.row] : tax.rows;
  const vatRows = vat.kind === 'ok' ? [vat.row] : vat.rows;
  // Both taxes turn on the same month's figure: the reduced rate of one goes with the reduced
  // rate of the other, not with the general one.
  const together = (t: TableRow<unknown>, v: TableRow<unknown>) =>
    tax.kind === 'ok' || vat.kind === 'ok' || (t.unless === undefined) === (v.unless === undefined);
  const deciding = new Set([
    ...(tax.kind === 'conditional' ? tax.norms : []),
    ...(vat.kind === 'conditional' ? vat.norms : []),
  ]);
  return {
    kind: 'conditional',
    options: taxRows.flatMap((t) =>
      vatRows
        .filter((v) => together(t, v))
        .map((v) => ({
          norms: [...new Set([...restsOn(t), ...restsOn(v)])].filter((id) => deciding.has(id)),
          withTax: withTax(t.value.percent, vatPercent(v.value, input.powerKw.p1)),
        })),
    ),
  };
}
