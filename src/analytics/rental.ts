import { toIso } from '../engine/date';
import type { RentalItemResult, RentalReview } from '../engine/rental/review';
import type { ItemStatus, RentalInput } from '../engine/rental/types';
import type { Detail, RentalEvents } from '../rental/ports';
import {
  DOUBT_REASONS,
  ITEM_STATUSES,
  attemptBucket,
  differenceBucket,
  reviewSecondsBucket,
  sectionSecondsBucket,
  type Props,
  type Section,
  type Track,
} from './events';

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
}): Props<'rental_review_completed'> {
  const { review, input } = data;
  const reasons = new Set(
    review.items.flatMap((i) => (i.outcome.kind === 'depends' ? i.outcome.reasons : [])),
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
    charges: familyStatus(review.items, 'charges'),
    deposit_return: familyStatus(review.items, 'deposit_return'),
    depends: DOUBT_REASONS.filter((r) => reasons.has(r)),
    difference: differenceBucket(review.totals.paidOver.counted + review.totals.owed.counted),
    offered: review.offerPass,
    detail: data.detail,
    attempt: attemptBucket(data.attempt),
    seconds: reviewSecondsBucket(data.seconds),
  };
}

// The rental review's events as catalogue events: steps, field names, codes and buckets only.
// Kept for this page view: when each step and the whole run started, and how many reviews.
export function rentalAnalytics(track: Track, now: () => number): RentalEvents {
  let viewedSection: Section | null = null;
  let sectionEnteredAt = 0;
  let start: number | null = null;
  let attempts = 0;
  const secondsSince = (t: number) => (now() - t) / 1000;

  return {
    stepShown(step) {
      if (step === viewedSection) return;
      viewedSection = step;
      sectionEnteredAt = now();
      start ??= sectionEnteredAt;
      track('section_viewed', { section: step });
    },
    stepCompleted(step) {
      track('section_completed', {
        section: step,
        seconds: sectionSecondsBucket(secondsSince(sectionEnteredAt)),
      });
    },
    wentBack(from, to) {
      track('went_back', { from, to });
    },
    fieldRejected(step, field) {
      track('validation_error', {
        section: step,
        field: field as Props<'validation_error'>['field'],
      });
    },
    outOfScope(reason) {
      track('rental_out_of_scope', { reason });
    },
    reviewCompleted({ review, input, detail }) {
      attempts += 1;
      track(
        'rental_review_completed',
        rentalReviewProps({
          review,
          input,
          attempt: attempts,
          seconds: secondsSince(start ?? sectionEnteredAt),
          detail,
        }),
      );
    },
    helpOpened(topic) {
      track('help_opened', { topic: topic as Props<'help_opened'>['topic'] });
    },
    detailOpened(item) {
      track('detail_opened', { item });
    },
    startedOver() {
      track('started_over', {});
    },
  };
}
