import { findingsOf, type CreditItem, type FindingId } from '../engine/credit/finding';
import type { CreditReview } from '../engine/credit/review';
import type { CreditInput } from '../engine/credit/types';
import type { CreditEvents, Step } from '../credit/ports';
import { attemptBucket, reviewSecondsBucket, type Props, type Track } from './events';
import { sectionAnalytics } from './section';

type Completed = Props<'credit_review_completed'>;
type PointResult = Completed['apr'];

// A point's status: the one every reading gives, `readings` when a «No lo sé» splits them, or
// none when the review did not reach it.
function pointStatus(items: readonly CreditItem[], id: FindingId): PointResult {
  const item = items.find((i) => findingsOf(i)[0]?.id === id);
  if (item === undefined) return 'none';
  const statuses = new Set(findingsOf(item).map((f) => f.status));
  const [only] = statuses;
  return statuses.size === 1 && only !== undefined ? only : 'readings';
}

// A card concluded before the 2011 law gets only the indicator; the rest go by blocks of years.
function period(review: CreditReview, { agreedOn: { y } }: CreditInput): Completed['period'] {
  if (review.scope.inScope && review.scope.indicatorOnly) return 'before_2011';
  return y <= 2015 ? '2011-2015' : y <= 2020 ? '2016-2020' : '2021+';
}

export function creditReviewProps(data: {
  review: CreditReview;
  input: CreditInput;
  attempt: number;
  seconds: number;
}): Completed {
  const { review, input } = data;
  const { items, indicator } = review;
  return {
    product: input.product,
    period: period(review, input),
    apr: pointStatus(items, 'apr'),
    early_repayment: pointStatus(items, 'early_repayment'),
    dealer_discount: pointStatus(items, 'dealer_discount'),
    withdrawal: pointStatus(items, 'withdrawal'),
    indicator: indicator?.status ?? 'none',
    compared_apr: indicator?.aprOrigin ?? 'none',
    attempt: attemptBucket(data.attempt),
    seconds: reviewSecondsBucket(data.seconds),
  };
}

// The credit review's events as catalogue events: steps, field names, codes and buckets only;
// never an amount, a rate, a date or a lender.
// The pass, not the measurement, hears when a review is cleared.
export function creditAnalytics(
  track: Track,
  now: () => number,
): Omit<CreditEvents, 'reviewCleared'> {
  const { events, reviewed } = sectionAnalytics<Step>(track, now);
  return {
    ...events,
    outOfScope(reason) {
      track('credit_out_of_scope', { reason });
    },
    reviewCompleted({ review, input }) {
      track('credit_review_completed', creditReviewProps({ review, input, ...reviewed() }));
    },
  };
}
