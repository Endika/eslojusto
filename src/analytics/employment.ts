import { toIso } from '../engine/date';
import { agreementScope } from '../engine/employment/agreement-code';
import type { EmploymentPhrase } from '../engine/employment/calculation';
import { everyAssessed, type EmploymentReview } from '../engine/employment/review';
import type { Assessed, EmploymentInput, Finding } from '../engine/employment/types';
import type { PassMode } from '../documents/ports';
import type {
  CompletedEmploymentReview,
  Detail,
  EmploymentEvents,
  Step,
} from '../employment/ports';
import {
  EMPLOYMENT_TRACKABLE_FIELDS,
  POINT_STATUSES,
  attemptBucket,
  differenceBucket,
  reviewSecondsBucket,
  type Props,
  type Track,
} from './events';
import { sectionAnalytics } from './section';

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

const FAMILY: Readonly<Partial<Record<Finding['item'], Family>>> = {
  minimum_wage: 'smi',
  modality: 'modality_check',
  chaining: 'chaining',
  trial_period: 'trial',
  working_time: 'working_time',
  part_time: 'part_time_check',
  clauses: 'clauses',
  information: 'information',
};

// The family of a point: its item, with the extra pays apart from the holidays they share it with;
// the offer has none. The readings of a point answer the same question, so its first one stands
// for it.
function familyOf(a: Assessed): Family | undefined {
  const first = findingsOf(a)[0];
  // Stryker disable next-line ConditionalExpression: a point always holds a finding, so the guard only narrows the type
  if (first === undefined) return undefined;
  if (first.item === 'holidays_pay') return first.id === 'extra_pays' ? 'extra_pays' : 'holidays';
  return FAMILY[first.item];
}

// A point's status, or `readings` when its verdict changes with a «No lo sé».
const pointStatus = (a: Assessed): PointResult =>
  a.kind === 'single' ? a.finding.status : 'readings';

// Of several points, the status that weighs most: POINT_STATUSES runs from the most to the least.
function familyStatus(points: readonly Assessed[], family: Family): PointResult {
  const statuses = points.filter((a) => familyOf(a) === family).map(pointStatus);
  return POINT_STATUSES.find((s) => statuses.includes(s)) ?? 'none';
}

const minimumWagePoints = (review: EmploymentReview): readonly Assessed[] =>
  review.items.filter((a) => familyOf(a) === 'smi');

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

export function yearsBucket(n: number): Completed['smi_years_below'] {
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
  pass: PassMode;
}): Completed {
  const { review, input } = data;
  const points = everyAssessed(review);
  const wage = minimumWagePoints(review);
  // The contract and the payslips may show the same shortfall: the larger one stands for both.
  const difference = Math.max(0, ...wage.map((a) => certain(a, shortfall)));
  const scope = agreementScope(input.agreement.code);
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
    agreement_authority: input.agreement.code === null ? 'none' : scope.authority,
    agreement_level: input.agreement.code === null ? 'none' : scope.level,
    difference: differenceBucket(difference),
    offered: review.offerPass,
    detail: data.detail,
    pass: data.pass,
    attempt: attemptBucket(data.attempt),
    seconds: reviewSecondsBucket(data.seconds),
  };
}

// The contract review's events as catalogue events: steps, field names, codes and buckets only.
// Kept for this page view: when each step and the whole run started, and how many reviews. `pass`
// tells how the pass shows under a review.
export function employmentAnalytics(
  track: Track,
  now: () => number,
  pass: (r: CompletedEmploymentReview) => PassMode,
): EmploymentEvents {
  const { events, reviewed } = sectionAnalytics<Step>(track, now);
  return {
    ...events,
    fieldRejected(step, field, code) {
      if (!(EMPLOYMENT_TRACKABLE_FIELDS as readonly string[]).includes(field)) return;
      events.fieldRejected(step, field, code);
    },
    outOfScope(reason) {
      track('employment_out_of_scope', { reason });
    },
    reviewCompleted(completed) {
      const { review, input, detail } = completed;
      track(
        'employment_review_completed',
        employmentReviewProps({ review, input, ...reviewed(), detail, pass: pass(completed) }),
      );
    },
    detailOpened(item) {
      track('detail_opened', { item });
    },
  };
}
