import { toIso } from '../engine/date';
import type { RentalItemResult, RentalReview } from '../engine/rental/review';
import type { ItemStatus, RentalInput } from '../engine/rental/types';
import type { PassMode } from '../documents/ports';
import type { CompletedRentalReview, Detail, RentalEvents, Step } from '../rental/ports';
import {
  DOUBT_REASONS,
  ITEM_STATUSES,
  RENT_UNCHECKED,
  attemptBucket,
  differenceBucket,
  reviewSecondsBucket,
  type Props,
  type Track,
} from './events';
import { sectionAnalytics } from './section';

type Family = 'fees' | 'guarantees' | 'rent_update' | 'charges' | 'deposit_return';

const FAMILY: Record<RentalItemResult['kind'], Family> = {
  fee: 'fees',
  guarantees: 'guarantees',
  guarantee: 'guarantees',
  advance: 'guarantees',
  rent_update: 'rent_update',
  charge: 'charges',
  deposit_return: 'deposit_return',
  deposit_interest: 'deposit_return',
};

// The status an item holds in every reading: its only one, or the lowest of a doubtful item, the
// one the totals count.
const certainStatus = (item: RentalItemResult): ItemStatus =>
  item.outcome.kind === 'single' ? item.outcome.value.status : item.outcome.low.status;

// Of several cards, the status that weighs most: ITEM_STATUSES runs from the most to the least.
function familyStatus(items: readonly RentalItemResult[], family: Family): ItemStatus | 'none' {
  const statuses = items.filter((i) => FAMILY[i.kind] === family).map(certainStatus);
  return ITEM_STATUSES.find((s) => statuses.includes(s)) ?? 'none';
}

// The norms that changed who pays the agency: RDL 7/2019, Ley 12/2023 and RDL 29/2026. A lease
// before the first stops at the door, so it never gets here.
function signedPeriod(input: RentalInput): Props<'rental_review_completed'>['signed_period'] {
  const day = toIso(input.signedOn);
  if (day < '2023-05-26') return '2019-2023';
  return day < '2026-10-08' ? '2023-2026' : '2026+';
}

export function rentalReviewProps(data: {
  review: RentalReview;
  input: RentalInput;
  attempt: number;
  seconds: number;
  detail: Detail;
  pass: PassMode;
}): Props<'rental_review_completed'> {
  const { review, input } = data;
  const unchecked = new Set(
    review.items.flatMap((i) => {
      // Stryker disable next-line ConditionalExpression,ArrayDeclaration: rent_unchecked keeps only the codes RENT_UNCHECKED lists, so what another kind of item added would never leave
      if (i.kind !== 'rent_update') return [];
      const readings =
        i.outcome.kind === 'single' ? [i.outcome.value] : i.outcome.readings.map((r) => r.value);
      // Stryker disable next-line ConditionalExpression,ArrayDeclaration: the same list keeps out a null or a stray code
      return readings.flatMap((r) => (r.unchecked === null ? [] : [r.unchecked]));
    }),
  );
  const n = input.updates.length;
  return {
    signed_period: signedPeriod(input),
    landlord: input.landlordType,
    large_landlord: input.largeLandlord === null ? 'unknown' : input.largeLandlord ? 'yes' : 'no',
    clause: input.updateClause,
    updates: n <= 0 ? '0' : n === 1 ? '1' : n === 2 ? '2' : '3+',
    fees: familyStatus(review.items, 'fees'),
    guarantees: familyStatus(review.items, 'guarantees'),
    rent_update: familyStatus(review.items, 'rent_update'),
    rent_unchecked: RENT_UNCHECKED.filter((r) => unchecked.has(r)),
    charges: familyStatus(review.items, 'charges'),
    deposit_return: familyStatus(review.items, 'deposit_return'),
    depends: DOUBT_REASONS.filter((r) =>
      review.items.some((i) => i.outcome.kind === 'depends' && i.outcome.reasons.includes(r)),
    ),
    difference: differenceBucket(review.totals.paidOver.counted + review.totals.owed.counted),
    offered: review.offerPass,
    detail: data.detail,
    pass: data.pass,
    attempt: attemptBucket(data.attempt),
    seconds: reviewSecondsBucket(data.seconds),
  };
}

// The rental review's events as catalogue events: steps, field names, codes and buckets only.
// Kept for this page view: when each step and the whole run started, and how many reviews. `pass`
// tells how the pass shows under a review.
export function rentalAnalytics(
  track: Track,
  now: () => number,
  pass: (r: CompletedRentalReview) => PassMode,
): RentalEvents {
  const { events, reviewed } = sectionAnalytics<Step>(track, now);
  return {
    ...events,
    outOfScope(reason) {
      track('rental_out_of_scope', { reason });
    },
    reviewCompleted(completed) {
      const { review, input, detail } = completed;
      track(
        'rental_review_completed',
        rentalReviewProps({ review, input, ...reviewed(), detail, pass: pass(completed) }),
      );
    },
    detailOpened(item) {
      track('detail_opened', { item });
    },
  };
}
