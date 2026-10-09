import type { CivilDate } from '../date';
import type { NormSource } from '../law/sources';
import type { Range } from '../money';
import type { Accrual } from '../types';
import type { HouseholdCalculation } from './calculation';
import type { HouseholdRuleId } from './rules';

// `null` in any yes/no answer, amount or count means «No lo sé» or not given. No name,
// identifier, nationality, health or pregnancy datum is ever an input: only dates, figures and
// yes/no answers about the work and its end.

// Paid by the month, or an external worker (not living in) paid by the hour (art. 8.5).
export type HouseholdRegime = 'monthly' | 'hourly_external';

// The category of the cause written in a desistimiento notice (art. 11.2): the three the law
// allows, another one, or none stated.
export type DesistimientoCause =
  'income_drop_or_expense_rise' | 'family_needs_change' | 'loss_of_trust' | 'other' | 'none';

export interface HouseholdExtraPays {
  readonly count: number;
  // Amount of each extra payment when paid apart; null when not known.
  readonly amount: number | null;
  // Spread over the twelve monthly payments, so already inside `monthlyCash`.
  readonly prorated: boolean;
  // Art. 8.4: at the end of each half-year unless agreed otherwise.
  readonly accrual: Accrual;
}

export interface HouseholdHolidays {
  // Calendar days agreed a year.
  readonly days: number;
  // The longest stretch of consecutive days; null = not known.
  readonly longestStretch: number | null;
  // Calendar days already taken this year, for the final pay.
  readonly taken: number | null;
}

export interface HouseholdTermination {
  // The employer's desistimiento (art. 11.2), or any other cause of art. 49.1 ET (art. 11.1).
  readonly route: 'desistimiento' | 'et_cause';
  // The day the written notice was given.
  readonly noticeGivenOn: CivilDate | null;
  // The last day of service.
  readonly effectiveOn: CivilDate;
  // 'HH:MM', when the notice reached a live-in worker.
  readonly noticeTime: string | null;
  readonly inWriting: boolean | null;
  readonly cause: DesistimientoCause | null;
  // The severance was made available at the same time as the notice.
  readonly severanceAvailable: boolean | null;
  readonly severanceOffered: number | null;
  // Pay given instead of the days of notice not given.
  readonly substitutePaid: number | null;
  // The employer alleges a very serious breach of loyalty and trust (art. 11.4).
  readonly seriousBreachAlleged: boolean | null;
}

export interface HouseholdInput {
  readonly startDate: CivilDate;
  // The year the pay checked is for: it picks the minimum wage decree.
  readonly payYear: number;
  readonly liveIn: boolean;
  readonly regime: HouseholdRegime;
  // Hours of effective work a week, presence time apart.
  readonly weeklyHours: number | null;
  // Gross monthly salary in money; with extra pays prorated it already includes them.
  readonly monthlyCash: number | null;
  // Monthly value of board and lodging agreed as pay in kind.
  readonly inKindMonthly: number | null;
  readonly extraPays: HouseholdExtraPays | null;
  readonly hourlyRate: number | null;
  readonly shortestRestHours: number | null;
  // A live-in worker's shorter rest made up within four weeks.
  readonly restMadeUpWithinFourWeeks: boolean | null;
  readonly weeklyRestHours: number | null;
  readonly holidays: HouseholdHolidays | null;
  readonly termination: HouseholdTermination | null;
}

export type ItemId =
  | 'minimum_wage'
  | 'working_time'
  | 'holidays'
  | 'termination'
  | 'severance'
  | 'notice'
  | 'unemployment';

export const FINDING_STATUSES = [
  'below_minimum',
  'over_legal_limit',
  'missing_requirement',
  // Working time and holidays: art. 9 warns, it never adds to what is owed.
  'warning',
  'dismissal_regime_presumed',
  'within_limit',
  'review_it',
  'information',
  'not_entered',
  'not_published',
  'not_reviewed_in_this_version',
] as const;
export type FindingStatus = (typeof FINDING_STATUSES)[number];

// A finding is named after the rule it checks.
export interface Finding {
  readonly id: HouseholdRuleId;
  readonly item: ItemId;
  readonly status: FindingStatus;
  // Money the figures say is owed; never set on a warning.
  readonly amount: Range | null;
  readonly calculation: HouseholdCalculation;
  readonly sources: readonly NormSource[];
  // The verdict rests on something the person told us rather than on a document.
  readonly basedOnYourAnswer: boolean;
  // What was agreed may set another term.
  readonly agreementMaySetOther: boolean;
}

// Questions the law leaves open; each opens two labelled readings, and only the one that holds in
// both counts.
export const READINGS = {
  incomplete_year: ['complete_years_only', 'prorated_by_months'],
  notice_service_date: ['measured_at_notice', 'measured_at_termination'],
  in_kind_base: ['month_without_extra_pays', 'year_with_extra_pays'],
} as const;
export type DoubtQuestion = keyof typeof READINGS;
export type ReadingCode<Q extends DoubtQuestion = DoubtQuestion> = (typeof READINGS)[Q][number];

export interface Reading<Q extends DoubtQuestion = DoubtQuestion> {
  readonly when: ReadingCode<Q>;
  readonly finding: Finding;
}

export type Assessed =
  | { readonly kind: 'single'; readonly finding: Finding }
  | {
      readonly kind: 'readings';
      readonly question: DoubtQuestion;
      readonly readings: readonly Reading[];
    };

export type Scope =
  | { readonly inScope: true }
  // The service ended before RDL 16/2022 came into force: the earlier regime applied.
  | { readonly inScope: false; readonly reason: 'before_reform' };
