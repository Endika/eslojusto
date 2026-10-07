import { BENEFIT_STATES, benefitState, type BenefitEstimate } from '../engine/unemployment';
import type { EmployerFigures, Review } from '../engine/review';
import type { Cause, FinalPayInput, HolidayUnit, ItemId, FixedTermType } from '../engine/types';
import type { Detail } from '../calculator/ports';
import { FAQ_TOPICS } from '../content/faq-topics';
import { DOCUMENTS_BUILD } from '../documents/config';
import {
  DOWNLOADS,
  ERROR_CODES,
  FILES_BUCKETS,
  LETTER_KINDS,
  LETTER_PREFILLED,
  PAGE_KINDS,
  PASS_VERIFY_RESULTS,
  PASS_VIA,
} from '../documents/ports';

// Every property is a code from a closed list, a small count or a bucket: nothing a person
// types can fit in one. `isValidEvent` enforces it at runtime before anything is sent.

// One per sheet of the form, conditional ones included, plus the result. They are the steps'
// URL fragments, so they keep their Spanish names.
export const SECTIONS = [
  'causa',
  'temporal',
  'fechas',
  'prorrateo',
  'salario',
  'pagas',
  'vacaciones',
  'preaviso',
  'hijos',
  'otros',
  'finiquito',
  'resultado',
] as const;
export type Section = (typeof SECTIONS)[number];

const ITEM_IDS = [
  'pending_salary',
  'holiday_pay',
  'extra_pay',
  'severance',
  'employer_notice',
  'notice_deduction',
] as const satisfies readonly ItemId[];

const INPUT_FIELDS = [
  'cause',
  'fixedTermType',
  'startDate',
  'endDate',
  'monthlySalary',
  'extraPayProrated',
  'extraPayCount',
  'extraPayAmount',
  'extraPayAccrual',
  'holidayUnit',
  'workDaysPerWeek',
  'annualHolidayDays',
  'holidayDaysTaken',
  'noticeDaysReceived',
  'agreementNoticeDays',
  'noticeDaysGiven',
] as const satisfies readonly (keyof FinalPayInput)[];

// Fails the typecheck when the engine gains an input field or an item the catalogue lacks.
type CoversAll<All, Listed> = Exclude<All, Listed> extends never ? true : never;
const _allFieldsListed: CoversAll<keyof FinalPayInput, (typeof INPUT_FIELDS)[number]> = true;
const _allItemsListed: CoversAll<ItemId, (typeof ITEM_IDS)[number]> = true;
void _allFieldsListed;
void _allItemsListed;

// The benefit answers, by name only: an error on one of them names the field, never the answer.
// They are left out of `snapshot`, so `changed_fields` never lists them either.
const BENEFIT_FIELDS = ['children', 'otherContracts', 'benefitDrawnSince'] as const;

const figureField = (id: ItemId) => `figure_${id}` as const;
export const TRACKABLE_FIELDS = [
  ...INPUT_FIELDS,
  ...ITEM_IDS.map(figureField),
  ...BENEFIT_FIELDS,
] as const;
export type TrackableField = (typeof TRACKABLE_FIELDS)[number];

export const HELP_TOPICS = FAQ_TOPICS.map(([, anchor]) => anchor);

const CAUSES = [
  'resignation',
  'fixed_term_end',
  'objective_dismissal',
  'unfair_dismissal',
  'disciplinary_dismissal',
] as const satisfies readonly Cause[];
const FIXED_TERM_TYPES = [
  'production_circumstances',
  'replacement',
  'training',
  'not_applicable',
] as const satisfies readonly (FixedTermType | 'not_applicable')[];
const HOLIDAY_UNITS = ['working', 'calendar'] as const satisfies readonly HolidayUnit[];
const EXTRA_PAY = ['prorated', 'annual', 'semiannual', 'unknown', 'no_extra_pay'] as const;
const OUTCOMES = ['shortfall', 'all_match', 'only_not_checkable', 'no_figures'] as const;
const OTHER_CONTRACT_BUCKETS = ['0', '1', '2', '3+'] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const ERROR_TYPES = [
  'Error',
  'TypeError',
  'ReferenceError',
  'RangeError',
  'SyntaxError',
  'URIError',
  'EvalError',
  'AggregateError',
  'AbortError',
  'InvalidStateError',
  'NotFoundError',
  'NotAllowedError',
  'NotSupportedError',
  'NetworkError',
  'QuotaExceededError',
  'SecurityError',
  'other',
] as const;

const SECTION_SECONDS = ['<10', '10-30', '30-60', '60-180', '>180'] as const;
const REVIEW_SECONDS = ['<60', '60-180', '180-600', '>600'] as const;
const DIFFERENCE_BUCKETS = ['0', '<100', '100-500', '500-2000', '>2000'] as const;
const ATTEMPT_BUCKETS = ['1', '2', '3+'] as const;

// The first bucket holds what is below the first limit; each next one, up to its limit inclusive.
function bucket<T extends string>(x: number, limits: readonly number[], labels: readonly T[]): T {
  const i = x < (limits[0] ?? 0) ? 0 : limits.findIndex((l, j) => j > 0 && x <= l);
  return labels[i < 0 ? labels.length - 1 : i] as T;
}

export const sectionSecondsBucket = (s: number) => bucket(s, [10, 30, 60, 180], SECTION_SECONDS);
export const reviewSecondsBucket = (s: number) => bucket(s, [60, 180, 600], REVIEW_SECONDS);
export const differenceBucket = (euros: number) =>
  euros <= 0 ? '0' : bucket(euros, [100, 500, 2000], DIFFERENCE_BUCKETS.slice(1));
export const FIELD_BUCKETS = ['0', '1-3', '4-8', '9+'] as const;
export const fieldsBucket = (n: number) =>
  n <= 0 ? '0' : n <= 3 ? '1-3' : n <= 8 ? '4-8' : ('9+' as const);
export const attemptBucket = (n: number) => (n <= 1 ? '1' : n === 2 ? '2' : '3+');
export const otherContractsBucket = (n: number) =>
  n <= 0 ? '0' : n === 1 ? '1' : n === 2 ? '2' : '3+';

type Rule =
  | { readonly values: readonly string[] }
  | { readonly pattern: RegExp }
  | { readonly intRange: readonly [number, number] }
  | { readonly boolean: true }
  | { readonly list: readonly string[] };

const oneOf = <const T extends readonly string[]>(values: T) => ({ values });
const section = oneOf(SECTIONS);
const count = { intRange: [0, 6] } as const;

// A primary language subtag (ISO 639), or 'unknown'.
const LANGUAGE_RULE = { pattern: /^(?:[a-z]{2,3}|unknown)$/ } as const;
// A script's file name and line; a name made only of digits or symbols is refused.
export const SCRIPT_SOURCE = /^[\w.-]*[a-z][\w.-]*\.(?:m?js|html):\d{1,6}$/i;
const SOURCE_RULE = { pattern: new RegExp(`${SCRIPT_SOURCE.source}|^unknown$`, 'i') } as const;

const BASE_CATALOGUE = {
  browser_language: { lang: LANGUAGE_RULE },
  page_translated: { lang: LANGUAGE_RULE },
  section_viewed: { section },
  section_completed: { section, seconds: oneOf(SECTION_SECONDS) },
  went_back: { from: section, to: section },
  validation_error: { section, field: oneOf(TRACKABLE_FIELDS) },
  help_opened: { topic: oneOf(HELP_TOPICS) },
  review_completed: {
    cause: oneOf(CAUSES),
    fixed_term_type: oneOf(FIXED_TERM_TYPES),
    extra_pay: oneOf(EXTRA_PAY),
    holiday_unit: oneOf(HOLIDAY_UNITS),
    // Days worked a week, asked only with working days.
    work_week: oneOf(['5', '6', 'other', 'not_applicable']),
    figures_entered: count,
    below_minimum: count,
    matching: count,
    above_minimum: count,
    not_checkable: count,
    deduction_too_high: { boolean: true },
    difference: oneOf(DIFFERENCE_BUCKETS),
    result: oneOf(OUTCOMES),
    attempt: oneOf(ATTEMPT_BUCKETS),
    changed_fields: { list: TRACKABLE_FIELDS },
    seconds: oneOf(REVIEW_SECONDS),
    benefit: oneOf(BENEFIT_STATES),
    other_contracts: oneOf(OTHER_CONTRACT_BUCKETS),
    // Whether the result showed what an unfair dismissal would pay, never the figure.
    unfair_reference: oneOf(['shown', 'none']),
    // Whether the result showed only its summary or the detail a pass unlocks.
    detail: oneOf(['locked', 'unlocked']),
  },
  detail_opened: { item: oneOf(ITEM_IDS) },
  started_over: {},
  js_error: { kind: oneOf(ERROR_TYPES), source: SOURCE_RULE },
} as const satisfies Record<string, Record<string, Rule>>;

// Reading documents and the pass: never a value read from a document, only the kinds found, how
// many fields they filled and how sure the reading was.
const DOCUMENT_CATALOGUE = {
  start_chosen: { path: oneOf(['upload', 'manual']) },
  upload_started: {
    files_bucket: oneOf(FILES_BUCKETS),
    // PDFs picked; their pages leave as images.
    pdfs: { intRange: [0, 15] },
  },
  extraction_completed: {
    // The kinds of document recognised in the pack, each once.
    doc_types: { list: PAGE_KINDS },
    fields_bucket: oneOf(FIELD_BUCKETS),
    low_confidence: { boolean: true },
    failed_checks: { boolean: true },
    conflicts: { boolean: true },
    escalated: oneOf(['yes', 'no', 'unknown']),
  },
  extraction_failed: { code: oneOf(ERROR_CODES) },
  checkout_started: {},
  pass_issued: { via: oneOf(PASS_VIA) },
  pass_failed: { code: oneOf(ERROR_CODES) },
  pass_verified: { result: oneOf(PASS_VERIFY_RESULTS) },
  // For the letter, whether none, some or all of its optional fields were filled; never their
  // values. The report has none.
  report_downloaded: {
    document: oneOf(DOWNLOADS),
    letter_prefilled: oneOf([...LETTER_PREFILLED, 'not_applicable']),
    // Whether the letter listed what falls short or only acknowledged receipt.
    letter_kind: oneOf([...LETTER_KINDS, 'not_applicable']),
  },
} as const satisfies Record<string, Record<string, Rule>>;

// The document events exist only in a build with the documents API; elsewhere they are dropped
// from the bundle (the variables are read inline so the bundler can fold them) and refused like
// any unknown event.
export const CATALOGUE = {
  ...BASE_CATALOGUE,
  ...(!!(
    import.meta.env.PUBLIC_API_EXTRACT_URL &&
    import.meta.env.PUBLIC_API_CHECKOUT_URL &&
    import.meta.env.PUBLIC_API_PASS_URL &&
    import.meta.env.PUBLIC_TURNSTILE_SITE_KEY
  ) && DOCUMENTS_BUILD
    ? DOCUMENT_CATALOGUE
    : {}),
} as typeof BASE_CATALOGUE & typeof DOCUMENT_CATALOGUE;

export type EventName = keyof typeof CATALOGUE;

type RuleValue<R> = R extends { values: readonly (infer V)[] }
  ? V
  : R extends { pattern: RegExp }
    ? string
    : R extends { intRange: unknown }
      ? number
      : R extends { boolean: true }
        ? boolean
        : R extends { list: readonly (infer V)[] }
          ? readonly V[]
          : never;

export type Props<E extends EventName> = {
  -readonly [K in keyof (typeof CATALOGUE)[E]]: RuleValue<(typeof CATALOGUE)[E][K]>;
};

export type Track = <E extends EventName>(event: E, props: Props<E>) => void;

function matchesRule(rule: Rule, v: unknown): boolean {
  if ('values' in rule) return typeof v === 'string' && rule.values.includes(v);
  if ('pattern' in rule) return typeof v === 'string' && rule.pattern.test(v);
  if ('intRange' in rule)
    return (
      Number.isInteger(v) && (v as number) >= rule.intRange[0] && (v as number) <= rule.intRange[1]
    );
  if ('boolean' in rule) return typeof v === 'boolean';
  return (
    Array.isArray(v) &&
    new Set(v).size === v.length &&
    v.every((x) => typeof x === 'string' && rule.list.includes(x))
  );
}

export function isValidEvent(name: string, props: unknown): boolean {
  if (!Object.hasOwn(CATALOGUE, name)) return false;
  if (typeof props !== 'object' || props === null || Array.isArray(props)) return false;
  const rules: Record<string, Rule> = CATALOGUE[name as EventName];
  const keys = Object.keys(props);
  return (
    keys.length === Object.keys(rules).length &&
    keys.every(
      (k) =>
        Object.hasOwn(rules, k) &&
        matchesRule(rules[k] as Rule, (props as Record<string, unknown>)[k]),
    )
  );
}

export function outcomeOf(r: Review): Outcome {
  const statuses = r.items.map((p) => p.status);
  if (statuses.some((e) => e === 'below_minimum' || e === 'deduction_too_high')) return 'shortfall';
  if (r.items.every((p) => p.employerFigure === null)) return 'no_figures';
  return statuses.some(
    (e) => e === 'matches' || e === 'above_minimum' || e === 'deduction_within_max',
  )
    ? 'all_match'
    : 'only_not_checkable';
}

// What the visitor answered, field by field, kept in this page only to tell which names changed.
export type Snapshot = Readonly<Partial<Record<TrackableField, string>>>;

export function snapshot(e: FinalPayInput, figures: EmployerFigures): Snapshot {
  const answers: Partial<Record<TrackableField, string>> = {};
  for (const field of INPUT_FIELDS)
    if (e[field] !== undefined) answers[field] = JSON.stringify(e[field]);
  for (const id of ITEM_IDS)
    if (figures[id] !== undefined) answers[figureField(id)] = String(figures[id]);
  return answers;
}

export const changedFields = (before: Snapshot | null, now: Snapshot): TrackableField[] =>
  before === null ? [] : TRACKABLE_FIELDS.filter((c) => before[c] !== now[c]);

export function reviewProps(data: {
  review: Review;
  input: FinalPayInput;
  attempt: number;
  changedFields: readonly TrackableField[];
  seconds: number;
  benefit: BenefitEstimate;
  otherContracts: number;
  detail: Detail;
}): Props<'review_completed'> {
  const { review, input: e } = data;
  const countOf = (status: string) => review.items.filter((p) => p.status === status).length;
  const shortfall = review.items
    .filter((p) => p.status === 'below_minimum')
    .reduce((sum, p) => sum + (p.difference ?? 0), 0);
  return {
    cause: e.cause,
    fixed_term_type:
      e.cause === 'fixed_term_end' ? (e.fixedTermType ?? 'not_applicable') : 'not_applicable',
    extra_pay: e.extraPayProrated
      ? 'prorated'
      : e.extraPayCount === 0
        ? 'no_extra_pay'
        : e.extraPayAccrual,
    holiday_unit: e.holidayUnit,
    work_week:
      e.holidayUnit === 'calendar'
        ? 'not_applicable'
        : e.workDaysPerWeek === undefined || e.workDaysPerWeek === 5
          ? '5'
          : e.workDaysPerWeek === 6
            ? '6'
            : 'other',
    figures_entered: review.items.filter((p) => p.employerFigure !== null).length,
    below_minimum: countOf('below_minimum'),
    matching: countOf('matches'),
    above_minimum: countOf('above_minimum'),
    not_checkable: countOf('not_checkable'),
    deduction_too_high: countOf('deduction_too_high') > 0,
    difference: differenceBucket(shortfall),
    result: outcomeOf(review),
    attempt: attemptBucket(data.attempt),
    changed_fields: [...data.changedFields],
    seconds: reviewSecondsBucket(data.seconds),
    benefit: benefitState(data.benefit),
    other_contracts: otherContractsBucket(data.otherContracts),
    unfair_reference: review.unfairReference === null ? 'none' : 'shown',
    detail: data.detail,
  };
}
