import type { CivilDate } from '../date';
import type { NormSource } from '../law/sources';
import { assessFinalPay, type HouseholdFinalPay } from './final-pay';
import { assessMinimumWage, type MinimumWageDeps } from './minimum-wage';
import { assessNotice } from './notice';
import { ruleSource } from './rules';
import { scope } from './scope';
import { assessSeverance } from './severance';
import { assessTermination } from './termination';
import { assessUnemployment } from './unemployment';
import type { Assessed, Finding, HouseholdInput, Scope } from './types';
import { validate, type ValidationError } from './validate';
import { assessHolidays, assessWorkingTime } from './working-time';

// What no review of the facts given can tell, always listed at the end.
export type UncheckedCode = 'cause_truth' | 'in_kind_in_severance' | 'contributions' | 'net_pay';

export type HouseholdDeps = MinimumWageDeps;

export interface HouseholdReview {
  readonly scope: Scope;
  // Why the review stopped at the door, when it did.
  readonly scopeSource: NormSource | null;
  // Pay, working time and holidays, then how the relationship ended: its form, severance, notice
  // and unemployment. Working time and holidays are warnings and carry no amount.
  readonly items: readonly Assessed[];
  readonly finalPay: HouseholdFinalPay | null;
  readonly unchecked: readonly UncheckedCode[];
}

export type HouseholdResult =
  | { readonly ok: false; readonly errors: readonly ValidationError[] }
  | { readonly ok: true; readonly review: HouseholdReview };

const isAssessed = (a: Assessed | null): a is Assessed => a !== null;

function uncheckedOf(input: HouseholdInput): readonly UncheckedCode[] {
  return [
    ...(input.termination?.route === 'desistimiento' ? (['cause_truth'] as const) : []),
    ...(input.termination?.route === 'desistimiento' && (input.inKindMonthly ?? 0) > 0
      ? (['in_kind_in_severance'] as const)
      : []),
    'contributions',
    'net_pay',
  ];
}

// The whole household review. `today` and every table come in from the caller.
export function reviewHousehold(
  input: HouseholdInput,
  today: CivilDate,
  deps: HouseholdDeps,
): HouseholdResult {
  const errors = validate(input, today);
  if (errors.length > 0) return { ok: false, errors };

  const reach = scope(input);
  const unchecked = uncheckedOf(input);
  const { norms } = deps;
  if (!reach.inScope)
    return {
      ok: true,
      review: {
        scope: reach,
        scopeSource: ruleSource('transitional_application', norms),
        items: [],
        finalPay: null,
        unchecked,
      },
    };

  const items = [
    ...assessMinimumWage(input, deps),
    ...assessWorkingTime(input, norms),
    ...assessHolidays(input, norms),
    ...assessTermination(input, norms),
    assessSeverance(input, norms),
    ...assessNotice(input, norms),
    assessUnemployment(input, norms),
  ].filter(isAssessed);
  return {
    ok: true,
    review: {
      scope: reach,
      scopeSource: null,
      items,
      finalPay: assessFinalPay(input, norms),
      unchecked,
    },
  };
}

const findingsOf = (a: Assessed): readonly Finding[] =>
  a.kind === 'single' ? [a.finding] : a.readings.map((r) => r.finding);

const MONEY_STATUSES: ReadonlySet<Finding['status']> = new Set([
  'below_minimum',
  'missing_requirement',
]);

const owedBy = (f: Finding): number => (MONEY_STATUSES.has(f.status) ? (f.amount?.max ?? 0) : 0);

// What a point counts for in a total: the lowest any reading gives, so a doubtful higher reading
// never counts. A warning has no amount and counts for nothing.
export const countedAmount = (a: Assessed): number => Math.min(...findingsOf(a).map(owedBy));

// The most any reading gives: the «y hasta» of a point.
export const highestAmount = (a: Assessed): number => Math.max(...findingsOf(a).map(owedBy));
