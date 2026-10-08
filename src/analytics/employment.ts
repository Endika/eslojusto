import { toIso } from '../engine/date';
import type { EmploymentPhrase } from '../engine/employment/calculation';
import { everyAssessed, type EmploymentReview } from '../engine/employment/review';
import type { Assessed, EmploymentInput, Finding } from '../engine/employment/types';
import type { Detail, EmploymentEvents } from '../employment/ports';
import {
  POINT_STATUSES,
  attemptBucket,
  differenceBucket,
  reviewSecondsBucket,
  sectionSecondsBucket,
  type Props,
  type Section,
  type Track,
} from './events';

type Completed = Props<'employment_review_completed'>;
type Family =
  | 'smi'
  | 'modality_check'
  | 'chaining'
  | 'trial'
  | 'working_time'
  | 'part_time_check'
  | 'holidays'
  | 'extra_pays'
  | 'clauses'
  | 'information';
type PointResult = Completed['smi'];

const findingsOf = (a: Assessed): readonly Finding[] =>
  a.kind === 'single' ? [a.finding] : a.readings.map((r) => r.finding);

// The family of a point: its item, with the extra pays apart from the holidays they share it with.
function familyOf(f: Finding): Family | null {
  switch (f.item) {
    case 'minimum_wage':
      return 'smi';
    case 'modality':
      return 'modality_check';
    case 'chaining':
      return 'chaining';
    case 'trial_period':
      return 'trial';
    case 'working_time':
      return 'working_time';
    case 'part_time':
      return 'part_time_check';
    case 'holidays_pay':
      return f.id === 'extra_pays' ? 'extra_pays' : 'holidays';
    case 'clauses':
      return 'clauses';
    case 'information':
      return 'information';
    case 'offer':
      return null;
  }
}

// A point's status, or `readings` when its verdict changes with a «No lo sé».
const pointStatus = (a: Assessed): PointResult =>
  a.kind === 'single' ? a.finding.status : 'readings';

// Of several points, the status that weighs most: POINT_STATUSES runs from the most to the least.
function familyStatus(points: readonly Assessed[], family: Family): PointResult {
  const statuses = points
    .filter((a) => {
      const first = findingsOf(a)[0];
      return first !== undefined && familyOf(first) === family;
    })
    .map(pointStatus);
  return POINT_STATUSES.find((s) => statuses.includes(s)) ?? 'none';
}

const minimumWagePoints = (review: EmploymentReview): readonly Assessed[] =>
  review.items.filter((a) => findingsOf(a)[0]?.item === 'minimum_wage');

const BELOW_YEAR: ReadonlySet<EmploymentPhrase['key']> = new Set([
  'minimum_wage.year.below',
  'minimum_wage.temporary.below',
]);

// The years a finding puts below the minimum wage.
const yearsBelow = (f: Finding): number =>
  f.status === 'below_minimum' ? f.calculation.filter((p) => BELOW_YEAR.has(p.key)).length : 0;

// What holds in every reading: the fewest years and the smallest shortfall of any of them.
const certain = (a: Assessed, of: (f: Finding) => number): number =>
  Math.min(...findingsOf(a).map(of));

const shortfall = (f: Finding): number =>
  f.status === 'below_minimum' && f.amount !== null ? f.amount.min : 0;

function yearsBucket(n: number): Completed['smi_years_below'] {
  if (n <= 0) return '0';
  if (n === 1) return '1';
  return n === 2 ? '2' : '3+';
}

function payslipsBucket(n: number): Completed['payslips'] {
  if (n <= 0) return '0';
  return n <= 3 ? '1-3' : '4+';
}

const answer = (v: boolean | null): Completed['written'] =>
  v === null ? 'unknown' : v ? 'yes' : 'no';

// The 2021 reform applies from 30-03-2022; the rest follow the minimum wage decrees by year.
function startPeriod(input: EmploymentInput): Completed['start_period'] {
  const day = toIso(input.startDate);
  if (day < '2022-03-30') return 'before_reform';
  if (input.startDate.y <= 2023) return '2022-2023';
  return input.startDate.y <= 2025 ? '2024-2025' : '2026+';
}

export function employmentReviewProps(data: {
  review: EmploymentReview;
  input: EmploymentInput;
  attempt: number;
  seconds: number;
  detail: Detail;
}): Completed {
  const { review, input } = data;
  const points = everyAssessed(review);
  const wage = minimumWagePoints(review);
  // The contract and the payslips may show the same shortfall: the larger one stands for both.
  const difference = Math.max(0, ...wage.map((a) => certain(a, shortfall)));
  return {
    start_period: startPeriod(input),
    modality: input.modality,
    part_time: input.partTime !== null,
    written: answer(input.writtenContract),
    technical: answer(input.technical),
    small_company: answer(input.smallCompany),
    smi: familyStatus(points, 'smi'),
    modality_check: familyStatus(points, 'modality_check'),
    chaining: familyStatus(points, 'chaining'),
    trial: familyStatus(points, 'trial'),
    working_time: familyStatus(points, 'working_time'),
    part_time_check: familyStatus(points, 'part_time_check'),
    holidays: familyStatus(points, 'holidays'),
    extra_pays: familyStatus(points, 'extra_pays'),
    clauses: familyStatus(points, 'clauses'),
    information: familyStatus(points, 'information'),
    smi_years_below: yearsBucket(Math.max(0, ...wage.map((a) => certain(a, yearsBelow)))),
    smi_not_published: wage
      .flatMap(findingsOf)
      .some(
        (f) =>
          f.status === 'not_published' ||
          f.calculation.some((p) => p.key === 'minimum_wage.not_published'),
      ),
    payslips: payslipsBucket(input.payslips.length),
    history: input.history !== null,
    offer: input.offer !== null,
    agreement_named: input.agreement.named,
    difference: differenceBucket(difference),
    offered: review.offerPass,
    detail: data.detail,
    attempt: attemptBucket(data.attempt),
    seconds: reviewSecondsBucket(data.seconds),
  };
}

// The contract review's events as catalogue events: steps, field names, codes and buckets only.
// Kept for this page view: when each step and the whole run started, and how many reviews.
export function employmentAnalytics(track: Track, now: () => number): EmploymentEvents {
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
      track('employment_out_of_scope', { reason });
    },
    reviewCompleted({ review, input, detail }) {
      attempts += 1;
      track(
        'employment_review_completed',
        employmentReviewProps({
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
