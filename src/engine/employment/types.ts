import type { CivilDate } from '../date';
import type { NormSource } from '../law/sources';
import type { Range } from '../money';
import type { ContributionPeriod } from '../types';
import type { EmploymentCalculation } from './calculation';
import type { EmploymentRuleId } from './rules';

// Words copied from a document; shown back to the person, never interpreted by the engine.
export interface LiteralQuote {
  readonly text: string;
}

// `null` in any yes/no answer means «No lo sé».
export type Relationship =
  | 'common'
  | 'household'
  | 'senior_management'
  | 'sport'
  | 'artist'
  | 'law_firm'
  | 'medical_resident'
  | 'special_employment_centre'
  | 'public_servant'
  | 'other_special';

export type Modality =
  | 'permanent'
  | 'discontinuous'
  | 'production'
  | 'production_occasional'
  | 'replacement'
  | 'replacement_selection'
  | 'training_alternance'
  | 'training_practice'
  | 'work_or_service'
  | 'eventual'
  | 'interim'
  | 'unknown';

export type SalaryPeriod = 'year' | 'month' | 'day' | 'hour';

export type SalaryComponentKind = 'base' | 'fixed_complement' | 'variable' | 'unknown';

export interface SalaryComponent {
  readonly kind: SalaryComponentKind;
  readonly amount: number;
}

export interface Salary {
  readonly amount: number;
  readonly period: SalaryPeriod;
  readonly payments: number;
  readonly prorated: boolean;
  readonly breakdown: readonly SalaryComponent[];
  readonly inKind: number | null;
}

export interface Agreement {
  readonly named: boolean;
  readonly categoryAnnualSalary: number | null;
  readonly annualHours: number | null;
  readonly holidayDays: number | null;
  readonly trialMonths: number | null;
}

export interface Payslip {
  // 'YYYY-MM'
  readonly month: string;
  readonly wholeMonth: boolean;
  readonly incidents: boolean;
  readonly salaryInMoney: number;
  readonly inKind: number;
  readonly proratedExtraPay: number;
  readonly overtimeHours: number | null;
  readonly complementaryHours: number | null;
}

export interface Discontinuous {
  readonly activityPeriod: boolean | null;
  readonly hours: boolean | null;
  readonly distribution: boolean | null;
}

export interface Training {
  readonly studiesEndedOn: CivilDate | null;
  readonly disability: boolean | null;
  readonly planAttached: boolean | null;
  readonly effectiveWorkPercent: { readonly year1: number | null; readonly year2: number | null };
}

export interface Trial {
  readonly amount: number;
  readonly unit: 'days' | 'weeks' | 'months';
}

export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface TimeSlot {
  // 'HH:MM'
  readonly from: string;
  readonly to: string;
}

export interface ScheduleDay {
  readonly day: Weekday;
  readonly slots: readonly TimeSlot[];
}

export interface PartTime {
  readonly hoursStated: boolean;
  readonly distributionStated: boolean;
  readonly complementary: { readonly percent: number; readonly noticeDays: number | null } | null;
  readonly voluntaryPercent: number | null;
}

export interface Holidays {
  readonly days: number;
  readonly unit: 'calendar' | 'working';
  readonly workDaysPerWeek: number | null;
  readonly includedInSalary: boolean;
}

export type ClauseLabel =
  | 'non_compete'
  | 'retention'
  | 'exclusivity'
  | 'waiver'
  | 'mandatory_overtime'
  | 'overtime_included'
  | 'remote_work_costs'
  | 'other';

export interface Clause {
  readonly label: ClauseLabel;
  readonly months: number | null;
  readonly compensationStated: boolean | null;
  readonly trainingDescribed: boolean | null;
  readonly waivedRight: 'holidays' | 'salary' | 'severance' | 'other' | null;
  readonly costsOnWorker: boolean | null;
  readonly literal: LiteralQuote;
}

// The seventeen elements of art. 3.2 RD 723/2026, letters a) to q).
export const INFO_ELEMENTS = [
  'a',
  'b',
  'c',
  'd',
  'e',
  'f',
  'g',
  'h',
  'i',
  'j',
  'k',
  'l',
  'm',
  'n',
  'o',
  'p',
  'q',
] as const;
export type InfoElement = (typeof INFO_ELEMENTS)[number];
export type InfoPresence = 'present' | 'by_reference' | 'absent' | 'unknown';

export interface EmploymentPeriod extends ContributionPeriod {
  readonly employer: 'same' | 'same_group' | 'other';
  readonly kind: 'production' | 'replacement' | 'training' | 'permanent' | 'unknown';
}

export interface Offer {
  readonly grossAnnual: number | null;
  readonly net: boolean;
  readonly weeklyHours: number | null;
  readonly modality: Modality | null;
  readonly remote: 'none' | 'hybrid' | 'full' | null;
}

export interface EmploymentInput {
  readonly relationship: Relationship;
  readonly viaTempAgency: boolean;
  readonly relief: boolean;
  readonly under18: boolean;
  readonly writtenContract: boolean | null;
  readonly startDate: CivilDate;
  readonly endDate: CivilDate | null;
  readonly signedOn: CivilDate | null;

  readonly modality: Modality;
  readonly extensions: number;
  readonly causeStated: boolean | null;
  readonly circumstancesStated: boolean | null;
  readonly replacedPersonNamed: boolean | null;
  readonly replacementCauseStated: boolean | null;
  readonly discontinuous: Discontinuous | null;
  readonly training: Training | null;

  readonly salary: Salary;
  readonly contractHours: { readonly weekly: number | null; readonly annual: number | null };
  // The agreement's full-time week; null falls back to the legal 40 hours (art. 34.1 ET).
  readonly fullTimeHours: number | null;
  readonly agreement: Agreement;
  readonly payslips: readonly Payslip[];

  readonly trial: Trial | null;
  readonly technical: boolean | null;
  readonly smallCompany: boolean | null;
  readonly sameDutiesBefore: boolean | null;
  readonly afterTraining: boolean | null;

  readonly schedule: readonly ScheduleDay[] | null;
  readonly shifts: boolean;
  readonly nightWorker: boolean | null;
  readonly irregular: boolean;
  readonly overtimeAgreed: { readonly hoursPerYear: number | 'as_needed' } | null;
  readonly partTime: PartTime | null;
  readonly remoteShare: number | null;
  readonly realWeeklyHours: number | null;

  readonly holidays: Holidays | null;
  readonly extraPays: { readonly count: number; readonly prorated: boolean } | null;

  readonly clauses: readonly Clause[];
  readonly info: Readonly<Record<InfoElement, InfoPresence>>;
  readonly history: readonly EmploymentPeriod[] | null;
  readonly offer: Offer | null;
}

export type ItemId =
  | 'minimum_wage'
  | 'modality'
  | 'chaining'
  | 'trial_period'
  | 'working_time'
  | 'part_time'
  | 'holidays_pay'
  | 'clauses'
  | 'information'
  | 'offer';

export const FINDING_STATUSES = [
  'below_minimum',
  'over_legal_limit',
  'clause_void',
  'becomes_permanent',
  'missing_requirement',
  'within_limit',
  'depends_on_agreement',
  'review_it',
  'not_applicable_to_date',
  'not_entered',
  'not_reviewed_in_this_version',
  'not_published',
] as const;
export type FindingStatus = (typeof FINDING_STATUSES)[number];

// A finding is named after the rule it checks.
export type FindingId = EmploymentRuleId;

export interface Finding {
  readonly id: FindingId;
  readonly item: ItemId;
  readonly status: FindingStatus;
  readonly amount: Range | null;
  readonly calculation: EmploymentCalculation;
  readonly sources: readonly NormSource[];
  // The verdict rests on something the person told us rather than on a document.
  readonly basedOnYourAnswer: boolean;
  // The applicable collective agreement may set another limit.
  readonly agreementMaySetOther: boolean;
  // The words of the law quoted with the finding, such as art. 15.4 ET.
  readonly literal: LiteralQuote | null;
}

// Questions the person may answer «No lo sé»; each answer opens one labelled reading.
export const READINGS = {
  technical: ['technical', 'not_technical'],
  small_company: ['under_25_staff', 'from_25_staff'],
  chaining_cutoff: ['cutoff_2021_12_31', 'cutoff_2022_03_30'],
  complement_kind: ['complement_fixed', 'complement_variable'],
  paid_hours: ['effective_hours', 'with_paid_rest'],
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
  | { readonly inScope: true; readonly partial: false }
  // Started before 30-03-2022: its fixed-term rules are the ones before the 2021 reform.
  | { readonly inScope: true; readonly partial: true; readonly reason: 'before_reform' }
  | {
      readonly inScope: false;
      readonly reason:
        'special_relationship' | 'public_servant' | 'temp_agency' | 'relief' | 'minor';
    };

export interface EmploymentReview {
  readonly scope: Scope;
  readonly assessed: readonly Assessed[];
  readonly offerPass: boolean;
}
