import type { InsuranceReview } from '../engine/insurance/review';
import type { Finding, FindingId, InsuranceInput } from '../engine/insurance/types';
import type { PassMode } from '../documents/ports';
import type { CompletedInsuranceReview, InsuranceEvents, Step } from '../insurance/ports';
import { attemptBucket, reviewSecondsBucket, type Props, type Track } from './events';
import { sectionAnalytics } from './section';

type Completed = Props<'insurance_review_completed'>;
type Status = Completed['renewal'];

const WITHDRAWAL: readonly FindingId[] = [
  'distance_withdrawal',
  'distance_withdrawal_compulsory',
  'distance_withdrawal_voluntary',
];

const statusOf = (findings: readonly Finding[], ids: readonly FindingId[]): Status =>
  // The last one: a motor policy's voluntary covers speak after its compulsory cover.
  findings.filter((f) => ids.includes(f.id)).at(-1)?.status ?? 'none';

const answer = (v: boolean | null): Completed['distance'] =>
  v === null ? 'unknown' : v ? 'yes' : 'no';

export function insuranceReviewProps(data: {
  review: InsuranceReview;
  input: InsuranceInput;
  attempt: number;
  seconds: number;
  pass: PassMode;
}): Completed {
  const { findings } = data.review;
  const { line } = data.input;
  return {
    // Only home and motor policies reach a review; any other stops at the door.
    line: line === 'car' ? 'car' : 'home',
    distance: answer(data.input.distance),
    renewal: statusOf(findings, ['non_renewal']),
    notice: statusOf(findings, ['change_notice']),
    premium: statusOf(findings, ['premium']),
    withdrawal: statusOf(findings, WITHDRAWAL),
    pass: data.pass,
    attempt: attemptBucket(data.attempt),
    seconds: reviewSecondsBucket(data.seconds),
  };
}

// The insurance review's events as catalogue events: steps, field names, codes and buckets only;
// never a date, a premium or an insurer. `pass` tells how the pass shows under a review.
// The letter, not the measurement, hears when a review is cleared.
export function insuranceAnalytics(
  track: Track,
  now: () => number,
  pass: (r: CompletedInsuranceReview) => PassMode,
): Omit<InsuranceEvents, 'reviewCleared'> {
  const { events, reviewed } = sectionAnalytics<Step>(track, now);
  return {
    ...events,
    outOfScope(reason) {
      track('insurance_out_of_scope', { reason });
    },
    reviewCompleted(completed) {
      const { review, input } = completed;
      track(
        'insurance_review_completed',
        insuranceReviewProps({ review, input, ...reviewed(), pass: pass(completed) }),
      );
    },
  };
}
