import type { CivilDate } from '../date';
import { round2 } from '../money';
import { checkCharges } from './charges';
import { checkDepositReturn } from './deposit-return';
import { checkFees } from './fees';
import { checkAdvance, checkGuarantees } from './guarantees';
import { informationBlocks, type InformationBlock } from './information';
import { itemAmount, type ItemReading, type ItemResult } from './item';
import { countedAmount, highestAmount, type Outcome } from './outcome';
import {
  checkRentUpdates,
  rentUpdateAmount,
  type RentUpdateReading,
  type RentUpdateResult,
} from './rent-update';
import { scope, type Scope } from './scope';
import type { ItemStatus, RentalInput, ReviewDeps } from './types';
import { validateRental, type RentalInputError } from './validate';

export type RentUpdateItem = RentUpdateResult & { readonly kind: 'rent_update' };

export type RentalItemResult = ItemResult | RentUpdateItem;

// What the review never looks at, always listed at the end.
export type UncheckedCode =
  'initial_rent_cap' | 'regional_rules' | 'extensions' | 'damage' | 'later_agreements';

export const UNCHECKED: readonly UncheckedCode[] = [
  'initial_rent_cap',
  'regional_rules',
  'extensions',
  'damage',
  'later_agreements',
];

export interface Total {
  // What holds in every reading: never a repealed window, never the higher reading of a doubt.
  readonly counted: number;
  // The most any reading gives, for «y hasta … si …».
  readonly upTo: number;
}

export interface RentalTotals {
  readonly paidOver: Total;
  readonly owed: Total;
  readonly overCap: Total;
}

export interface RentalReview {
  readonly scope: Scope;
  readonly items: readonly RentalItemResult[];
  readonly information: readonly InformationBlock[];
  readonly totals: RentalTotals;
  // Some item is paid over or owed in every reading.
  readonly offerPass: boolean;
  readonly unchecked: readonly UncheckedCode[];
}

export type RentalReviewResult =
  | { readonly ok: true; readonly review: RentalReview }
  | { readonly ok: false; readonly errors: readonly RentalInputError[] };

function amountsAs(
  item: RentalItemResult,
  status: ItemStatus,
): { readonly counted: number; readonly upTo: number } {
  const of = <T extends { readonly status: ItemStatus }>(
    outcome: Outcome<T>,
    amount: (r: T) => number,
  ) => {
    const as = (r: T) => (r.status === status ? amount(r) : 0);
    return { counted: countedAmount(outcome, as), upTo: highestAmount(outcome, as) };
  };
  return item.kind === 'rent_update'
    ? of<RentUpdateReading>(item.outcome, rentUpdateAmount)
    : of<ItemReading>(item.outcome, itemAmount);
}

function totalOf(items: readonly RentalItemResult[], status: ItemStatus): Total {
  let counted = 0;
  let upTo = 0;
  for (const item of items) {
    const a = amountsAs(item, status);
    counted += a.counted;
    upTo += a.upTo;
  }
  return { counted: round2(counted), upTo: round2(upTo) };
}

const NOTHING: Total = { counted: 0, upTo: 0 };

// Reviews a rental contract item by item. The tables come in as arguments, so a change of norm
// status or a new index figure needs no change here.
export function reviewRental(
  input: RentalInput,
  today: CivilDate,
  deps: ReviewDeps,
): RentalReviewResult {
  const errors = validateRental(input, today);
  if (errors.length > 0) return { ok: false, errors };
  const gate = scope(input, deps.norms);
  if (!gate.inScope)
    return {
      ok: true,
      review: {
        scope: gate,
        items: [],
        information: [],
        totals: { paidOver: NOTHING, owed: NOTHING, overCap: NOTHING },
        offerPass: false,
        unchecked: UNCHECKED,
      },
    };

  const items: RentalItemResult[] = [
    ...checkFees(input, deps.norms),
    ...checkGuarantees(input, deps.norms),
    checkAdvance(input, deps.norms),
    ...checkRentUpdates(input, today, deps).map((r) => ({ ...r, kind: 'rent_update' as const })),
    ...checkCharges(input, deps),
    ...checkDepositReturn(input, today, deps),
  ];
  const totals: RentalTotals = {
    paidOver: totalOf(items, 'paid_over'),
    owed: totalOf(items, 'owed'),
    overCap: totalOf(items, 'over_cap'),
  };
  return {
    ok: true,
    review: {
      scope: gate,
      items,
      information: informationBlocks(input, deps.norms),
      totals,
      offerPass: totals.paidOver.counted > 0 || totals.owed.counted > 0,
      unchecked: UNCHECKED,
    },
  };
}
