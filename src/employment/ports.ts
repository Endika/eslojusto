import type { Detail } from '../calculator/flow';
import type { CivilDate } from '../engine/date';
import type { EmploymentDeps, EmploymentReview } from '../engine/employment/review';
import type { EmploymentInput, ItemId, Scope } from '../engine/employment/types';
import type { Translate } from '../i18n/client';
import type { Step } from './steps';

export type { Detail } from '../calculator/flow';
export type { Step } from './steps';

export type OutOfScopeReason = Extract<Scope, { inScope: false }>['reason'];

export interface CompletedEmploymentReview {
  readonly review: EmploymentReview;
  readonly input: EmploymentInput;
  readonly detail: Detail;
}

// The names of the questions, as a rejected answer is reported: a row list counts by its name.
export const EMPLOYMENT_FIELDS = [
  'relationship',
  'viaTempAgency',
  'relief',
  'under18',
  'writtenContract',
  'startDate',
  'signedOn',
  'endDate',
  'modality',
  'extensions',
  'causeStated',
  'circumstancesStated',
  'replacedPersonNamed',
  'replacementCauseStated',
  'activityPeriod',
  'discontinuousHours',
  'distribution',
  'studiesEndedOn',
  'disability',
  'planAttached',
  'effectiveYear1',
  'effectiveYear2',
  'hasHistory',
  'history',
  'historyIncomplete',
  'salaryAmount',
  'salaryPeriod',
  'extraPays',
  'extraProrated',
  'hasBreakdown',
  'parts',
  'inKind',
  'weeklyHours',
  'annualHours',
  'fullTimeHours',
  'agreementNamed',
  'categorySalary',
  'agreementAnnualHours',
  'hasPayslips',
  'payslips',
  'hasSchedule',
  'schedule',
  'shifts',
  'nightWorker',
  'irregular',
  'hasOvertime',
  'overtimeKind',
  'overtimeHours',
  'overtimePaid',
  'isPartTime',
  'hoursStated',
  'distributionStated',
  'hasComplementary',
  'complementaryPercent',
  'complementaryNotice',
  'voluntaryPercent',
  'remoteShare',
  'realWeeklyHours',
  'hasTrial',
  'trialAmount',
  'trialUnit',
  'technical',
  'smallCompany',
  'sameDutiesBefore',
  'afterTraining',
  'agreementTrialMonths',
  'hasHolidays',
  'holidayDays',
  'holidayUnit',
  'workDaysPerWeek',
  'holidaysInSalary',
  'agreementHolidayDays',
  'hasClauses',
  'clauses',
  'info_a',
  'info_b',
  'info_c',
  'info_d',
  'info_e',
  'info_f',
  'info_g',
  'info_h',
  'info_i',
  'info_j',
  'info_k',
  'info_l',
  'info_m',
  'info_n',
  'info_o',
  'info_p',
  'info_q',
  'hasOffer',
  'offerGross',
  'offerNet',
  'offerHours',
  'offerModality',
  'offerRemote',
] as const;
export type EmploymentFormField = (typeof EMPLOYMENT_FIELDS)[number];

// What a result card is about, as its `data-kind` names it: a checked point, or the reference of
// what a court could award.
export type EmploymentItemKind = ItemId | 'reference';

// What happens during a visit, for whoever listens; the review does not know who does.
export interface EmploymentEvents {
  stepShown(step: Step): void;
  stepCompleted(step: Step): void;
  wentBack(from: Step, to: Step): void;
  fieldRejected(step: Step, field: string): void;
  outOfScope(reason: OutOfScopeReason): void;
  reviewCompleted(r: CompletedEmploymentReview): void;
  // A frequently asked question, by the id of its <details>.
  helpOpened(topic: string): void;
  detailOpened(item: EmploymentItemKind): void;
  startedOver(): void;
}

export interface EmploymentReviewDeps {
  readonly events: EmploymentEvents;
  readonly today: () => CivilDate;
  readonly tr: Translate;
  // The norms and the minimum wage table the review reads, as the composition root loads them.
  readonly tables: EmploymentDeps;
  // How the result is shown when a review completes; unlocked unless told otherwise.
  readonly detail?: () => Detail;
}
