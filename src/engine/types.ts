import type { Calculation, Phrase } from './calculation';
import type { CivilDate } from './date';
import type { Range } from './money';
import type { Source } from './sources';

export type Cause =
  | 'resignation'
  | 'fixed_term_end'
  | 'objective_dismissal'
  | 'collective_dismissal'
  | 'unfair_dismissal'
  | 'disciplinary_dismissal'
  | 'unknown';
// The causes a document can state; «No lo sé» is only ever the person's answer.
export type StatedCause = Exclude<Cause, 'unknown'>;
// Whether the person was in an ERTE when dismissed, and how.
export type Erte = 'none' | 'reduced' | 'suspended' | 'unknown';
export type FixedTermType = 'production_circumstances' | 'replacement' | 'training';

export type Accrual = 'annual' | 'semiannual' | 'unknown';
// How the person counts holiday days: Monday to Friday, or every day of the week.
export type HolidayUnit = 'working' | 'calendar';
export type ItemId =
  | 'pending_salary'
  | 'holiday_pay'
  | 'extra_pay'
  | 'severance'
  | 'employer_notice'
  | 'notice_deduction';

// Another contract in the last 6 years, as the person reads it in their work history report (vida laboral).
export interface ContributionPeriod {
  readonly startDate: CivilDate;
  readonly endDate: CivilDate;
}

// Kept out of FinalPayInput on purpose: these dates never reach the analytics catalogue.
export interface OtherContracts {
  readonly contracts: readonly ContributionPeriod[];
  // null = «No lo sé» (unknown).
  readonly benefitDrawnSince: boolean | null;
}

export interface FinalPayInput {
  readonly cause: Cause;
  readonly fixedTermType?: FixedTermType;
  readonly startDate: CivilDate;
  readonly endDate: CivilDate;
  readonly monthlySalary: number;
  readonly extraPayProrated: boolean;
  readonly extraPayCount: number;
  readonly extraPayAmount: number;
  readonly extraPayAccrual: Accrual;
  readonly holidayUnit: HolidayUnit;
  // Days worked a week, 1 to 7, for holidays in working days; 5 when not given.
  readonly workDaysPerWeek?: number;
  // Both in `holidayUnit`.
  readonly annualHolidayDays: number;
  readonly holidayDaysTaken: number | null;
  readonly noticeDaysReceived?: number;
  readonly agreementNoticeDays?: number;
  readonly noticeDaysGiven?: number;
  // Absent = not in an ERTE.
  readonly erte?: Erte;
  // The full monthly salary before the ERTE, on the same basis as `monthlySalary`.
  readonly preErteMonthlySalary?: number;
  // false when the final pay is still unpaid; absent when not answered.
  readonly paid?: boolean;
}

// The situations that may make a dismissal null (art. 55.5 ET; Ley 15/2022 for sick leave). Kept
// out of FinalPayInput on purpose: health and family answers stay in the browser, in the form.
export const PROTECTED_SITUATIONS = [
  'pregnancy',
  'family_leave',
  'back_from_leave',
  'care_rights',
  'gender_violence',
  'sick_leave',
] as const;
export type ProtectedSituation = (typeof PROTECTED_SITUATIONS)[number];

// Why a severance item is legally zero; the UI words each cause differently.
export type ZeroReason = 'resignation' | 'disciplinary_dismissal' | 'replacement' | 'training';

export interface Item {
  readonly id: ItemId;
  readonly direction: 'credit' | 'deduction';
  readonly range: Range | null;
  readonly calculation: Calculation;
  readonly dependsOnAgreement: boolean;
  readonly basedOnYourAnswer: boolean;
  readonly sources: readonly Source[];
  readonly zeroReason?: ZeroReason;
  // Set when `range` is null for want of an answer the person gave as «No lo sé», not the agreement.
  readonly missingAnswer?: 'days_taken' | 'cause' | 'pre_erte_salary';
  // The figure is a legal minimum that an agreement the review cannot know usually improves.
  readonly orMore?: 'ere_agreement';
  // What the item took from the person's answers, said in the result so a slip shows.
  readonly counted?: Phrase;
}
