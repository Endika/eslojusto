import type { CivilDate } from '../date';
import { round2 } from '../money';
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
import {
  COUNTED,
  countedAmount,
  findingsOf,
  type BillFinding,
  type BillItem,
  type BillsItemId,
} from './finding';
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

export interface ElectricityTotals {
  // What the person pays over in every reading: the lowest.
  readonly counted: number;
  // The most any reading gives, for «y hasta … si …».
  readonly upTo: number;
  // Charged short, in every reading: shown as plainly and never set against what is paid over.
  readonly under: number;
}

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

// The total repeats its lines, and tolls and charges are a breakdown within the power and energy
// terms: neither is money charged short of its own.
const NOT_UNDER: ReadonlySet<BillsItemId> = new Set([
  'total',
  'tolls_and_charges_power',
  'tolls_and_charges_energy',
]);

const overAmount = (f: BillFinding): number =>
  COUNTED.has(f.status) && f.direction === 'over' && f.pendingOn.length === 0 ? (f.amount ?? 0) : 0;

const underAmount = (f: BillFinding): number =>
  f.direction === 'under' && !NOT_UNDER.has(f.id) && f.pendingOn.length === 0 ? (f.amount ?? 0) : 0;

function totalsOf(items: readonly BillItem[]): ElectricityTotals {
  let counted = 0;
  let upTo = 0;
  let under = 0;
  for (const item of items) {
    const findings = findingsOf(item);
    counted += countedAmount(item);
    upTo += Math.max(...findings.map(overAmount));
    under += Math.min(...findings.map(underAmount));
  }
  return { counted: round2(counted), upTo: round2(upTo), under: round2(under) };
}

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
