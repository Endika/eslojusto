import type { EmploymentPhrase } from '../engine/employment/calculation';
import { everyAssessed, type EmploymentReview } from '../engine/employment/review';
import type { Assessed, Finding, FindingStatus } from '../engine/employment/types';

export { roundToTens, shownOne, shownPair, type Shown } from '../calculator/amounts';

// Only a shortfall against the minimum wage carries euros; every other finding is worded by its
// status, never as «0 €».
export const amountOf = (f: Finding): number | null =>
  f.status === 'below_minimum' && f.amount !== null && f.amount.max > 0 ? f.amount.max : null;

// What the free summary says of a shortfall against the minimum wage: per year (or per working
// day in a short fixed-term contract) in the last year below it, and since the contract started.
export interface Shortfall {
  readonly per: 'year' | 'day';
  readonly year: number;
  readonly amount: number;
}

const euros = (v: EmploymentPhrase['vars'], name: string): number | null => {
  const f = v?.[name];
  return typeof f === 'object' && 'euros' in f ? f.euros : null;
};
const integer = (v: EmploymentPhrase['vars'], name: string): number | null => {
  const f = v?.[name];
  return typeof f === 'object' && 'integer' in f ? f.integer : null;
};

export function shortfallOf(f: Finding): Shortfall | null {
  if (f.status !== 'below_minimum') return null;
  const found = f.calculation
    .flatMap((p) => {
      const per: Shortfall['per'] | null =
        p.key === 'minimum_wage.year.below'
          ? 'year'
          : p.key === 'minimum_wage.temporary.below'
            ? 'day'
            : null;
      const year = integer(p.vars, 'year');
      const amount = euros(p.vars, 'difference');
      return per === null || year === null || amount === null ? [] : [{ per, year, amount }];
    })
    .at(-1);
  return found ?? null;
}

// How a shortfall against the minimum wage reads: per year or per working day in the last year
// below it, or, without a year to name, the payslips' or the finding's own total.
export interface Euros {
  readonly per: 'year' | 'day' | 'payslips' | 'total';
  readonly amount: number;
}

export function figureOf(f: Finding): Euros | null {
  const shortfall = shortfallOf(f);
  if (shortfall !== null) return { per: shortfall.per, amount: shortfall.amount };
  const amount = amountOf(f);
  if (amount === null) return null;
  return { per: f.id === 'smi_monthly' ? 'payslips' : 'total', amount };
}

// A shortfall below the minimum wage in every reading of a «No lo sé», by different amounts: the
// lower one is what counts, the higher only bounds it.
export interface EurosRange {
  readonly per: Euros['per'];
  readonly low: number;
  readonly high: number;
}

export function rangeOf(a: Assessed): EurosRange | null {
  if (a.kind !== 'readings') return null;
  const figures = a.readings.map((r) =>
    r.finding.status === 'below_minimum' ? figureOf(r.finding) : null,
  );
  const [first] = figures;
  if (!first || figures.some((x) => x === null || x.per !== first.per)) return null;
  const amounts = figures.flatMap((x) => (x === null ? [] : [x.amount]));
  return { per: first.per, low: Math.min(...amounts), high: Math.max(...amounts) };
}

// A year left out of the sum: before the table, without its decree yet, or with its effects from
// 1 January unchecked. With any of them the total does not cover the whole contract.
const GAPS: ReadonlySet<EmploymentPhrase['key']> = new Set([
  'minimum_wage.not_loaded',
  'minimum_wage.not_published',
  'minimum_wage.year.effects_unverified',
  'minimum_wage.year.hours_unknown',
  'minimum_wage.year.extra_pays_unknown',
  'minimum_wage.year.training_effective_work',
]);
const YEAR_PHRASE = /^minimum_wage\.year\./;

// The contract's shortfall added up over the years compared, from the first of them; null when a
// year of the span is left out or there is no yearly total.
export function sinceOf(f: Finding): { readonly from: number; readonly amount: number } | null {
  if (shortfallOf(f)?.per !== 'year') return null;
  const amount = amountOf(f);
  if (amount === null || f.calculation.some((p) => GAPS.has(p.key))) return null;
  const first = f.calculation.find((p) => YEAR_PHRASE.test(p.key));
  const from = first === undefined ? null : integer(first.vars, 'year');
  return from === null ? null : { from, amount };
}

const findingsOf = (a: Assessed): readonly Finding[] =>
  a.kind === 'single' ? [a.finding] : a.readings.map((r) => r.finding);

// Anything to look at: a concrete finding the pass does not open, or a doubt.
const TO_REVIEW: ReadonlySet<FindingStatus> = new Set([
  'below_minimum',
  'over_legal_limit',
  'clause_void',
  'becomes_permanent',
  'missing_requirement',
  'review_it',
  'depends_on_agreement',
]);

export type Headline = 'found' | 'to_review' | 'nothing_found' | 'nothing_entered';

// The summary's first line follows the engine: what opens the pass (a shortfall, a limit passed,
// a void clause or a contract the law makes permanent, in every reading) is «found»; anything
// else to look at, such as information missing, is only to review.
export function headline(review: EmploymentReview): Headline {
  if (review.offerPass) return 'found';
  const findings = everyAssessed(review).flatMap(findingsOf);
  if (findings.some((f) => TO_REVIEW.has(f.status))) return 'to_review';
  return findings.every((f) => f.status === 'not_entered') ? 'nothing_entered' : 'nothing_found';
}

// The status an assessed point shows on its card: its own, or «depends» across readings that
// disagree.
export const stateOf = (a: Assessed): FindingStatus | 'depends' =>
  a.kind === 'single' ? a.finding.status : 'depends';
