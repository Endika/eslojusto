import type { Assessed, Finding, HouseholdInput } from '../engine/household/types';
import { countedAmount, type HouseholdReview } from '../engine/household/review';
import type { HouseholdEvents, Step } from '../household/ports';
import {
  HOUSEHOLD_STATUSES,
  attemptBucket,
  differenceBucket,
  reviewSecondsBucket,
  type Props,
  type Track,
} from './events';
import { sectionAnalytics } from './section';

type Completed = Props<'household_review_completed'>;
type Family = 'pay' | 'working_time' | 'holidays' | 'termination' | 'severance' | 'notice';
type PointResult = Completed['pay'];

const findingsOf = (a: Assessed): readonly Finding[] =>
  a.kind === 'single' ? [a.finding] : a.readings.map((r) => r.finding);

// The family of a point: its item; the paid-for leave and the unemployment information have none.
const FAMILY: Readonly<Partial<Record<Finding['item'], Family>>> = {
  minimum_wage: 'pay',
  working_time: 'working_time',
  holidays: 'holidays',
  termination: 'termination',
  severance: 'severance',
  notice: 'notice',
};

// A point's status, or `readings` when its verdict changes with a «No lo sé».
const pointStatus = (a: Assessed): PointResult =>
  a.kind === 'single' ? a.finding.status : 'readings';

// Of several points, the status that weighs most: HOUSEHOLD_STATUSES runs from the most to the least.
function familyStatus(points: readonly Assessed[], family: Family): PointResult {
  const statuses = points
    .filter((a) => {
      const first = findingsOf(a)[0];
      // Stryker disable next-line ConditionalExpression,BooleanLiteral: a point always holds a finding, so the guard only narrows the type
      if (first === undefined) return false;
      return FAMILY[first.item] === family;
    })
    .map(pointStatus);
  return HOUSEHOLD_STATUSES.find((s) => statuses.includes(s)) ?? 'none';
}

const answer = (v: boolean | null | undefined): Completed['written'] =>
  v === null || v === undefined ? 'unknown' : v ? 'yes' : 'no';

// The reform came into force in September 2022; the rest follow the minimum wage decrees by year.
const period = (payYear: number): Completed['pay_period'] =>
  payYear <= 2023 ? '2022-2023' : payYear <= 2025 ? '2024-2025' : '2026+';

function extraPays(input: HouseholdInput): Completed['extra_pays'] {
  if (input.regime === 'hourly_external') return 'not_applicable';
  const e = input.extraPays;
  if (e === null || e.count === 0) return 'none';
  return e.prorated ? 'prorated' : 'apart';
}

export function householdReviewProps(data: {
  review: HouseholdReview;
  input: HouseholdInput;
  ending: Completed['ending'];
  attempt: number;
  seconds: number;
}): Completed {
  const { review, input } = data;
  const points = review.items;
  const t = input.termination;
  return {
    work:
      input.regime === 'hourly_external' ? 'hourly_external' : input.liveIn ? 'live_in' : 'monthly',
    pay_period: period(input.payYear),
    ending: data.ending,
    extra_pays: extraPays(input),
    in_kind: (input.inKindMonthly ?? 0) > 0,
    pay: familyStatus(points, 'pay'),
    working_time: familyStatus(points, 'working_time'),
    holidays: familyStatus(points, 'holidays'),
    termination: familyStatus(points, 'termination'),
    severance: familyStatus(points, 'severance'),
    notice: familyStatus(points, 'notice'),
    written: answer(t?.inWriting),
    severance_available: answer(t?.severanceAvailable),
    difference: differenceBucket(points.reduce((sum, a) => sum + countedAmount(a), 0)),
    attempt: attemptBucket(data.attempt),
    seconds: reviewSecondsBucket(data.seconds),
  };
}

// The household review's events as catalogue events: steps, field names, codes and buckets only.
// Kept for this page view: when each step and the whole run started, and how many reviews.
export function householdAnalytics(track: Track, now: () => number): HouseholdEvents {
  const { events, reviewed } = sectionAnalytics<Step>(track, now);
  return {
    ...events,
    outOfScope(reason) {
      track('household_out_of_scope', { reason });
    },
    reviewCompleted({ review, input, ending }) {
      track(
        'household_review_completed',
        householdReviewProps({ review, input, ending, ...reviewed() }),
      );
    },
    detailOpened(item) {
      track('detail_opened', { item });
    },
  };
}
