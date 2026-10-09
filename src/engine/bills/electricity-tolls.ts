import { round2 } from '../money';
import { billsPhrase, type BillsPhrase } from './calculation';
import {
  acrossOfficial,
  billFinding,
  compare,
  directionOf,
  LINE_TOLERANCE,
  pendingOfficial,
  single,
  type BillItem,
  type BillsItemId,
} from './finding';
import type { BillsNormId, NormTable } from './norms';
import {
  addOfficial,
  proratedOver,
  rowsCited,
  spanOf,
  wholePeriod,
  type BillingPeriod,
  type Official,
  type RowCitation,
} from './period';
import type { BillsRuleId } from './rules';
import type { BillsTables, PowerEnergyPrices } from './tables';
import type { ElectricityBillInput, EnergyPeriod, PowerPeriod } from './types';

export interface TollsDeps {
  readonly norms: NormTable;
  readonly tables: Pick<BillsTables, 'tolls' | 'charges'>;
}

const RULES: readonly BillsRuleId[] = ['tolls', 'charges'];

export const periodOf = (input: ElectricityBillInput): BillingPeriod => ({
  from: input.readingFrom,
  to: input.readingTo,
});

// The kWh of each energy period, adding up the bill's lines.
export function kwhByPeriod(input: ElectricityBillInput): Readonly<Record<EnergyPeriod, number>> {
  const of = (period: EnergyPeriod) =>
    input.energy.filter((l) => l.period === period).reduce((s, l) => s + l.kwh, 0);
  return { p1: of('p1'), p2: of('p2'), p3: of('p3') };
}

// € a year for the contracted power of the given periods at these prices.
export const powerPerYear =
  (input: ElectricityBillInput, periods: readonly PowerPeriod[]) =>
  (prices: PowerEnergyPrices): number =>
    periods.reduce((s, p) => s + input.contractedPower[p] * prices.power[p], 0);

// Tolls and charges for the contracted power of `periods`, by day.
export const accessPower = (
  input: ElectricityBillInput,
  periods: readonly PowerPeriod[],
  { norms, tables }: TollsDeps,
): Official =>
  addOfficial(
    proratedOver(tables.tolls, periodOf(input), norms, powerPerYear(input, periods)),
    proratedOver(tables.charges, periodOf(input), norms, powerPerYear(input, periods)),
  );

// The figure the bill itemises against the official one: equal within a cent, or the difference
// either way, which is shown and never counted. In the free market a price below tolls and
// charges is not flagged: only the figures the bill itemises are compared.
function againstOfficial(
  id: BillsItemId,
  billed: number | null,
  official: Official,
  calculation: (expected: number) => readonly BillsPhrase[],
  norms: NormTable,
): BillItem {
  if (official.kind === 'missing') return pendingOfficial(id, official.day, RULES, norms);
  if (billed === null)
    return single(
      billFinding(id, 'not_on_bill', [billsPhrase('tolls.not_on_bill')], RULES, norms, {
        rows: official.rows,
      }),
    );
  return acrossOfficial(official, (expected) => {
    const phrases = [
      ...calculation(expected[0] ?? 0),
      billsPhrase('arithmetic.billed', { euros: { euros: billed } }),
    ];
    const { matches, difference } = compare(billed, expected, LINE_TOLERANCE);
    if (matches) return billFinding(id, 'matches', phrases, RULES, norms);
    return billFinding(id, 'differs_from_official', phrases, RULES, norms, {
      amount: Math.abs(difference),
      direction: directionOf(difference),
    });
  });
}

// The kWh of each day are not on the bill: a price changing within the period leaves the energy
// term without a figure.
function accessEnergy(
  input: ElectricityBillInput,
  { norms, tables }: TollsDeps,
): Official | 'price_change' {
  const kwh = kwhByPeriod(input);
  const perPeriod = (prices: PowerEnergyPrices) =>
    kwh.p1 * prices.energy.p1 + kwh.p2 * prices.energy.p2 + kwh.p3 * prices.energy.p3;
  let low = 0;
  let high = 0;
  const rows: RowCitation[] = [];
  const deciding = new Set<BillsNormId>();
  for (const table of [tables.tolls, tables.charges]) {
    const span = spanOf(table, periodOf(input), norms);
    if (span.kind === 'missing') return span;
    const value = wholePeriod(span.stretches, perPeriod);
    if (value === null) return 'price_change';
    low += value.low;
    high += value.high;
    rows.push(...rowsCited(span.stretches, norms));
    for (const id of span.deciding) deciding.add(id);
  }
  const range = { low, high };
  return { kind: 'ok', byBase: [range, range], rows, deciding: [...deciding] };
}

// What the bill says its tolls and charges come to, against the 2026 tolls of the CNMC and the
// charges of the ministry for the 2.0TD tariff.
export function checkTollsAndCharges(
  input: ElectricityBillInput,
  deps: TollsDeps,
): readonly BillItem[] {
  const { norms } = deps;
  const freeMarket: readonly BillsPhrase[] =
    input.market === 'free' ? [billsPhrase('tolls.free_market_price')] : [];

  const power = againstOfficial(
    'tolls_and_charges_power',
    input.tollsAndCharges?.power ?? null,
    accessPower(input, ['p1', 'p2'], deps),
    (expected) => [
      billsPhrase('tolls.power', {
        p1: { kw: input.contractedPower.p1 },
        p2: { kw: input.contractedPower.p2 },
        euros: { euros: round2(expected) },
      }),
      ...freeMarket,
    ],
    norms,
  );

  const official = accessEnergy(input, deps);
  const energy =
    official === 'price_change'
      ? single(
          billFinding(
            'tolls_and_charges_energy',
            'not_checkable',
            [billsPhrase('tolls.energy_price_change')],
            RULES,
            norms,
          ),
        )
      : againstOfficial(
          'tolls_and_charges_energy',
          input.tollsAndCharges?.energy ?? null,
          official,
          (expected) => [
            billsPhrase('tolls.energy', { euros: { euros: round2(expected) } }),
            ...freeMarket,
          ],
          norms,
        );
  return [power, energy];
}
