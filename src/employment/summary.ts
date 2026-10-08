import type { EmploymentPhrase } from '../engine/employment/calculation';
import { everyAssessed, type EmploymentReview } from '../engine/employment/review';
import type { Assessed, Finding, FindingStatus } from '../engine/employment/types';

// An amount for the free summary: to the nearest 10 €.
export const roundToTens = (n: number): number => Math.round(n / 10) * 10;

// How an approximate amount is shown: to tens («unos 340 €»), or with its cents where tens would
// say something false.
export interface Shown {
  readonly amount: number;
  readonly cents: boolean;
}

// One amount alone: to tens, unless that would turn something into «0 €».
export const shownOne = (n: number): Shown =>
  n > 0 && roundToTens(n) === 0
    ? { amount: n, cents: true }
    : { amount: roundToTens(n), cents: false };

// Two amounts that bound something (two readings): to tens only when the rounded figures stay
// apart and neither passes the other's figure; otherwise both keep their cents, so a range never
// reads as one figure.
export function shownPair(low: number, high: number): readonly [Shown, Shown] {
  const [a, b] = [roundToTens(low), roundToTens(high)];
  const tens =
    low === high
      ? low === 0 || (a > 0 && a <= high)
      : a < b && a <= high && b >= low && (low === 0 || a > 0);
  return tens
    ? [
        { amount: a, cents: false },
        { amount: b, cents: false },
      ]
    : [
        { amount: low, cents: true },
        { amount: high, cents: true },
      ];
}

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

// Concrete findings: something below the minimum, over a limit, void, missing or turned
// permanent by the law.
const CONCRETE: ReadonlySet<FindingStatus> = new Set([
  'below_minimum',
  'over_legal_limit',
  'clause_void',
  'becomes_permanent',
  'missing_requirement',
]);
const DOUBT: ReadonlySet<FindingStatus> = new Set(['review_it', 'depends_on_agreement']);

const isConcrete = (f: Finding): boolean => CONCRETE.has(f.status) && !f.agreementMaySetOther;

const findingsOf = (a: Assessed): readonly Finding[] =>
  a.kind === 'single' ? [a.finding] : a.readings.map((r) => r.finding);

export type Headline = 'found' | 'to_review' | 'nothing_found' | 'nothing_entered';

// The summary's first line: something concrete in every reading, something to look at, nothing,
// or nothing to compare.
export function headline(review: EmploymentReview): Headline {
  const all = everyAssessed(review);
  if (all.some((a) => findingsOf(a).every(isConcrete))) return 'found';
  const findings = all.flatMap(findingsOf);
  if (findings.some((f) => CONCRETE.has(f.status) || DOUBT.has(f.status))) return 'to_review';
  return findings.every((f) => f.status === 'not_entered') ? 'nothing_entered' : 'nothing_found';
}

// The status an assessed point shows on its card: its own, or «depends» across readings that
// disagree.
export const stateOf = (a: Assessed): FindingStatus | 'depends' =>
  a.kind === 'single' ? a.finding.status : 'depends';
