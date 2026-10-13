import type { Basket } from '../engine/bills/basket';
import { findingsOf, type BillItem, type BillsItemId } from '../engine/bills/finding';
import type { Detail } from '../calculator/ports';
import type {
  CompletedElectricityReview,
  ElectricityEvents,
  Step as ElectricityStep,
  YearEvents,
} from '../bills/electricity/ports';
import type {
  CompletedTelecomReview,
  TelecomEvents,
  Step as TelecomStep,
} from '../bills/telecom/ports';
import {
  BILLS_STATUSES,
  attemptBucket,
  basketSizeBucket,
  differenceBucket,
  reviewSecondsBucket,
  type BillsTrackedItemId,
  type Props,
  type Track,
} from './events';
import { sectionAnalytics } from './section';

type TelecomCompleted = Props<'telecom_review_completed'>;
type PointResult = TelecomCompleted['commitment'];

// A line neither matching, shown for information, left out by its own answers nor waiting on
// something the review cannot see.
const QUIET = new Set<string>([
  'matches',
  'within_limit',
  'not_applicable',
  'information',
  'not_on_bill',
  'not_checkable',
  'pending_official_data',
]);

// The kinds of line where some reading does not match, each once.
const findingIds = (items: readonly BillItem[]): BillsTrackedItemId[] => [
  ...new Set(
    items
      .flatMap(findingsOf)
      .flatMap((f) => (QUIET.has(f.status) ? [] : [f.id]))
      .filter((id): id is BillsTrackedItemId => id !== 'social_bonus'),
  ),
];

export function electricityBillProps({
  review,
  input,
}: CompletedElectricityReview): Props<'electricity_bill_reviewed'> {
  const findings = review.items.flatMap(findingsOf);
  return {
    market: input.market,
    retailer: input.retailer,
    findings: findingIds(review.items),
    undercharged: review.totals.under > 0,
    conditional: findings.some((f) => f.pendingOn.length > 0 || f.dependsOn.length > 0),
    recurring: review.recurring,
  };
}

// The status that weighs most among the lines of some kinds; one whose readings disagree counts as
// `readings`; none when the review did not reach them.
function pointStatus(items: readonly BillItem[], ids: readonly BillsItemId[]): PointResult {
  const statuses = items
    .filter((item) => findingsOf(item).some((f) => ids.includes(f.id)))
    .map((item) => {
      const own = new Set(findingsOf(item).map((f) => f.status));
      const [only] = own;
      return own.size === 1 && only !== undefined ? only : 'readings';
    });
  return BILLS_STATUSES.find((s) => statuses.includes(s)) ?? 'none';
}

export const telecomReviewProps = ({ review }: CompletedTelecomReview): TelecomCompleted => ({
  commitment: pointStatus(review.items, ['commitment_length', 'commitment_penalty']),
  change_exit: pointStatus(review.items, ['change_exit']),
  after_exit: pointStatus(review.items, ['charge_after_exit']),
});

export const basketProps = (data: {
  basket: Basket;
  attempt: number;
  seconds: number;
  detail: Detail;
}): Props<'basket_completed'> => ({
  size: basketSizeBucket(data.basket.bills.length),
  difference: differenceBucket(data.basket.totals.counted),
  offered: data.basket.offerPass,
  detail: data.detail,
  attempt: attemptBucket(data.attempt),
  seconds: reviewSecondsBucket(data.seconds),
});

// Only a household with the social bonus is asked its category, its amount and its consumption,
// so none of that is measured: a view or an error there alone would tell it has the bonus.
const BONUS_ONLY_STEP = 'bono-social-consumo';
const BONUS_ONLY_FIELDS: ReadonlySet<string> = new Set([
  'bonusCategory',
  'bonusAmount',
  'bonusKwhSoFar',
  'bonusDiscountedKwh',
]);

// The electricity review's events as catalogue events: steps, field names, codes and buckets
// only; never a supply code or its fingerprint, an amount, a date, a retailer or a concept as
// written. `detail` tells whether a pass shows the report. The pass, not the measurement, hears
// when a review is cleared.
export function electricityAnalytics(
  track: Track,
  now: () => number,
  detail: () => Detail,
): Omit<ElectricityEvents, 'reviewCleared'> & YearEvents {
  const { events } = sectionAnalytics<ElectricityStep>(track, now);
  let start: number | null = null;
  let years = 0;
  return {
    ...events,
    stepShown(step) {
      start ??= now();
      if (step !== BONUS_ONLY_STEP) events.stepShown(step);
    },
    stepCompleted(step) {
      if (step !== BONUS_ONLY_STEP) events.stepCompleted(step);
    },
    wentBack(from, to) {
      if (from !== BONUS_ONLY_STEP && to !== BONUS_ONLY_STEP) events.wentBack(from, to);
    },
    fieldRejected(step, field) {
      if (step !== BONUS_ONLY_STEP && !BONUS_ONLY_FIELDS.has(field))
        events.fieldRejected(step, field);
    },
    outOfScope(reason) {
      track('bills_out_of_scope', { reason });
    },
    reviewCompleted(r) {
      track('electricity_bill_reviewed', electricityBillProps(r));
    },
    basketCompleted(basket) {
      years += 1;
      const seconds = start === null ? 0 : (now() - start) / 1000;
      track('basket_completed', basketProps({ basket, attempt: years, seconds, detail: detail() }));
    },
  };
}

// Likewise for the telecom review: never a date, an amount or an operator.
export function telecomAnalytics(
  track: Track,
  now: () => number,
): Omit<TelecomEvents, 'reviewCleared'> {
  const { events } = sectionAnalytics<TelecomStep>(track, now);
  return {
    ...events,
    outOfScope(reason) {
      track('bills_out_of_scope', { reason });
    },
    reviewCompleted(r) {
      track('telecom_review_completed', telecomReviewProps(r));
    },
  };
}
