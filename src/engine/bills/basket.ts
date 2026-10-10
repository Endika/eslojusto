import { ordinal, toIso } from '../date';
import { round2 } from '../money';
import type { ElectricityReview } from './electricity-review';
import {
  countedAmount,
  findingsOf,
  type BillItem,
  type BillsItemId,
  type BillTotals,
} from './finding';
import type { ElectricityBillInput } from './types';

export interface BasketBill {
  readonly input: Pick<ElectricityBillInput, 'readingFrom' | 'readingTo' | 'supplyFingerprint'>;
  readonly review: ElectricityReview;
}

export type BasketSkip = 'duplicate' | 'out_of_scope';

export interface Basket {
  // Positions of the bills that count, in the order given.
  readonly bills: readonly number[];
  readonly skipped: readonly { readonly bill: number; readonly reason: BasketSkip }[];
  readonly totals: BillTotals;
  // Days the counted bills cover between them.
  readonly days: number;
  // Items with a counted difference in two bills or more.
  readonly recurring: readonly BillsItemId[];
  // Those recurring differences over a year at the pace of the bills reviewed: an estimate, never
  // part of any total. Null when nothing recurs.
  readonly yearlyEstimate: number | null;
  // The pass is worth offering only when what is counted reaches its price or comes back bill
  // after bill.
  readonly offerPass: boolean;
}

export interface BasketDeps {
  readonly passPrice: number;
}

// Two copies of one bill share the supply and the period. Only two fingerprints that differ tell
// bills of one period apart; without one on either, they are taken as the same bill: counting it
// twice would be the error that costs.
const sameBill = (a: BasketBill['input'], b: BasketBill['input']): boolean =>
  (a.supplyFingerprint === null ||
    b.supplyFingerprint === null ||
    a.supplyFingerprint === b.supplyFingerprint) &&
  toIso(a.readingFrom) === toIso(b.readingFrom) &&
  toIso(a.readingTo) === toIso(b.readingTo);

const daysOf = (input: BasketBill['input']): number =>
  ordinal(input.readingTo) - ordinal(input.readingFrom);

const idsOf = (item: BillItem): readonly BillsItemId[] => findingsOf(item).map((f) => f.id);

// Several bills reviewed one by one, added up as «tu año».
export function reviewBasket(bills: readonly BasketBill[], deps: BasketDeps): Basket {
  const counted: number[] = [];
  const reviews: BasketBill[] = [];
  const skipped: { bill: number; reason: BasketSkip }[] = [];
  bills.forEach((bill, i) => {
    if (!bill.review.scope.inScope) skipped.push({ bill: i, reason: 'out_of_scope' });
    else if (reviews.some((earlier) => sameBill(earlier.input, bill.input)))
      skipped.push({ bill: i, reason: 'duplicate' });
    else {
      counted.push(i);
      reviews.push(bill);
    }
  });

  const billsWith = new Map<BillsItemId, number>();
  for (const { review } of reviews) {
    const ids = new Set(review.items.filter((item) => countedAmount(item) > 0).flatMap(idsOf));
    for (const id of ids) billsWith.set(id, (billsWith.get(id) ?? 0) + 1);
  }
  const recurring = [...billsWith].filter(([, n]) => n >= 2).map(([id]) => id);

  const sum = (pick: (r: ElectricityReview) => number) =>
    round2(reviews.reduce((total, { review }) => total + pick(review), 0));
  const totals: BillTotals = {
    counted: sum((r) => r.totals.counted),
    upTo: sum((r) => r.totals.upTo),
    under: sum((r) => r.totals.under),
  };
  const days = reviews.reduce((total, { input }) => total + daysOf(input), 0);
  const recurringAmount = sum((r) =>
    r.items
      .filter((item) => idsOf(item).some((id) => recurring.includes(id)))
      .reduce((total, item) => total + countedAmount(item), 0),
  );
  return {
    bills: counted,
    skipped,
    totals,
    days,
    recurring,
    yearlyEstimate:
      recurring.length === 0 || days === 0 ? null : round2((recurringAmount * 365) / days),
    offerPass: totals.counted >= deps.passPrice || recurring.length > 0,
  };
}
