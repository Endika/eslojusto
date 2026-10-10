import type { CivilDate } from '../date';
import { checkArithmetic } from './electricity-arithmetic';
import { checkExcessPower, checkServices } from './electricity-disallowed';
import { checkExitPenalty } from './electricity-exit-penalty';
import { checkMeter } from './electricity-meter';
import { powerUsed } from './electricity-power';
import { checkPvpc } from './electricity-pvpc';
import { checkSocialBonus } from './electricity-social-bonus';
import { checkElectricityTax } from './electricity-tax';
import { checkTollsAndCharges } from './electricity-tolls';
import { checkVat } from './electricity-vat';
import { countedAmount, findingsOf, totalsOf, type BillItem, type BillTotals } from './finding';
import type { NormTable } from './norms';
import { electricityScope } from './scope';
import type { BillsTables } from './tables';
import type { ElectricityBillInput, ElectricityScope } from './types';
import { validateElectricity, type ElectricityField, type ValidationError } from './validate';

// What the review never looks at, always listed at the end.
export type UncheckedCode =
  | 'agreed_price'
  | 'price_notice'
  | 'pvpc_hourly_energy'
  | 'other_tariff'
  | 'regional_rules'
  | 'earlier_regularizations';

export const UNCHECKED: readonly UncheckedCode[] = [
  'agreed_price',
  'price_notice',
  'pvpc_hourly_energy',
  'other_tariff',
  'regional_rules',
  'earlier_regularizations',
];

export interface ElectricityDeps {
  readonly norms: NormTable;
  readonly tables: BillsTables;
}

export type ElectricityTotals = BillTotals;

export interface ElectricityReview {
  readonly scope: ElectricityScope;
  readonly items: readonly BillItem[];
  readonly totals: ElectricityTotals;
  // A counted difference that comes back in every bill while nothing changes.
  readonly recurring: boolean;
  readonly unchecked: readonly UncheckedCode[];
}

export type ElectricityResult =
  | { readonly ok: false; readonly errors: readonly ValidationError<ElectricityField>[] }
  | { readonly ok: true; readonly review: ElectricityReview };

const present = (item: BillItem | null): readonly BillItem[] => (item === null ? [] : [item]);

// The whole review of a household electricity bill. `today` and the tables come in from the
// composition root, so settling a condition or loading a new year needs no change here.
export function reviewElectricityBill(
  input: ElectricityBillInput,
  today: CivilDate,
  deps: ElectricityDeps,
): ElectricityResult {
  const reach = electricityScope(input);
  if (!reach.inScope)
    return {
      ok: true,
      review: {
        scope: reach,
        items: [],
        totals: { counted: 0, upTo: 0, under: 0 },
        recurring: false,
        unchecked: UNCHECKED,
      },
    };
  const errors = validateElectricity(input, today);
  if (errors.length > 0) return { ok: false, errors };
  const { norms } = deps;
  const items = [
    ...checkArithmetic(input, norms),
    ...checkTollsAndCharges(input, deps),
    ...checkPvpc(input, deps),
    ...present(checkMeter(input, deps)),
    ...present(checkSocialBonus(input, deps)),
    checkElectricityTax(input, deps),
    checkVat(input, deps),
    ...present(checkExcessPower(input, norms)),
    ...checkServices(input, norms),
    ...present(checkExitPenalty(input, norms)),
    powerUsed(input, norms),
  ];
  return {
    ok: true,
    review: {
      scope: reach,
      items,
      totals: totalsOf(items),
      recurring: items.some(
        (item) => countedAmount(item) > 0 && findingsOf(item).every((f) => f.recurring),
      ),
      unchecked: UNCHECKED,
    },
  };
}
