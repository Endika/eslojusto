import type { EMPLOYMENT_PAGE_KINDS } from '../src/domain/documents';
import type {
  CLAUSE_LABELS,
  HOLIDAY_UNITS,
  INFO_ELEMENTS,
  MODALITIES,
  REMOTE_WORK,
  SALARY_PART_KINDS,
  SALARY_PERIODS,
  TRIAL_UNITS,
  WAIVED_RIGHTS,
} from '../src/domain/employment-schema';
import type { FINAL_PAY_READABILITY } from '../src/domain/extraction-schema';
import type { Degrade, ExpectedExtraction, PageData } from './schema';

// One synthetic employment pack: the pages to render, what a read should find in them, and what
// the site's employment engine should say about the facts behind them. Every value is invented.

// Each template and the kind of document it should be read as. A template renders to as many
// images as it has sheets.
export const EMPLOYMENT_TEMPLATES = {
  'employment/permanent-es': 'employment_contract',
  'employment/temporary-es': 'employment_contract',
  'employment/training-es': 'employment_contract',
  'employment/part-time-es': 'employment_contract',
  'employment/permanent-ca': 'employment_contract',
  'employment/permanent-gl': 'employment_contract',
  'employment/payslip-es': 'payslip',
  'employment/work-history-es': 'work_history',
  'employment/offer-es': 'job_offer',
} as const satisfies Readonly<Record<string, (typeof EMPLOYMENT_PAGE_KINDS)[number]>>;
export type EmploymentTemplateId = keyof typeof EMPLOYMENT_TEMPLATES;
export const EMPLOYMENT_TEMPLATE_IDS = Object.keys(
  EMPLOYMENT_TEMPLATES,
) as readonly EmploymentTemplateId[];

type Readability = (typeof FINAL_PAY_READABILITY)[number];

interface PageBase {
  readonly data: PageData;
  readonly degrade: Degrade;
  // What a read should say of each image of this page; ok unless the photo is spoiled.
  readonly readability?: Readability;
}

// `other` is a page drawn by the renderer itself that nothing in the review uses.
export type EmploymentPageSpec =
  | (PageBase & { readonly template: EmploymentTemplateId })
  | (PageBase & { readonly kind: 'other' });

// Page data keys that hold a person's data: never to be transcribed by a read. The person replaced
// in a replacement contract and a household employer are persons too.
export const EMPLOYMENT_PERSON_KEYS = [
  'workerName',
  'workerDni',
  'workerNaf',
  'iban',
  'replacedName',
  'employerPersonName',
] as const;

type Iso = string;
type YesNo = boolean | null;

// The engine's EmploymentInput with ISO dates, as a person would enter it from these documents.
export interface EmploymentCaseInput {
  readonly relationship:
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
  readonly viaTempAgency: boolean;
  readonly relief: boolean;
  readonly under18: boolean;
  readonly writtenContract: YesNo;
  readonly startDate: Iso;
  readonly endDate: Iso | null;
  readonly signedOn: Iso | null;
  readonly modality: (typeof MODALITIES)[number];
  readonly extensions: number;
  readonly causeStated: YesNo;
  readonly circumstancesStated: YesNo;
  readonly replacedPersonNamed: YesNo;
  readonly replacementCauseStated: YesNo;
  readonly discontinuous: {
    readonly activityPeriod: YesNo;
    readonly hours: YesNo;
    readonly distribution: YesNo;
  } | null;
  readonly training: {
    readonly studiesEndedOn: Iso | null;
    readonly disability: YesNo;
    readonly planAttached: YesNo;
    readonly effectiveWorkPercent: { readonly year1: number | null; readonly year2: number | null };
  } | null;
  readonly salary: {
    readonly amount: number;
    readonly period: (typeof SALARY_PERIODS)[number];
    readonly payments: number;
    readonly prorated: boolean;
    readonly breakdown: readonly {
      readonly kind: (typeof SALARY_PART_KINDS)[number];
      readonly amount: number;
    }[];
    readonly inKind: number | null;
  };
  readonly contractHours: { readonly weekly: number | null; readonly annual: number | null };
  readonly fullTimeHours: number | null;
  readonly agreement: {
    readonly named: boolean;
    readonly categoryAnnualSalary: number | null;
    readonly annualHours: number | null;
    readonly holidayDays: number | null;
    readonly trialMonths: number | null;
  };
  readonly payslips: readonly {
    readonly month: string;
    readonly wholeMonth: boolean;
    readonly incidents: boolean;
    readonly salaryInMoney: number;
    readonly inKind: number;
    readonly proratedExtraPay: number;
    readonly overtimeHours: number | null;
    readonly complementaryHours: number | null;
  }[];
  readonly trial: { readonly amount: number; readonly unit: (typeof TRIAL_UNITS)[number] } | null;
  readonly technical: YesNo;
  readonly smallCompany: YesNo;
  readonly sameDutiesBefore: YesNo;
  readonly afterTraining: YesNo;
  readonly schedule:
    | readonly {
        readonly day: 1 | 2 | 3 | 4 | 5 | 6 | 7;
        readonly slots: readonly { readonly from: string; readonly to: string }[];
      }[]
    | null;
  readonly shifts: boolean;
  readonly nightWorker: YesNo;
  readonly irregular: boolean;
  readonly overtimeAgreed: {
    readonly hoursPerYear: number | 'as_needed';
    readonly paidInMoney: YesNo;
  } | null;
  readonly partTime: {
    readonly hoursStated: boolean;
    readonly distributionStated: boolean;
    readonly complementary: { readonly percent: number; readonly noticeDays: number | null } | null;
    readonly voluntaryPercent: number | null;
  } | null;
  readonly remoteShare: number | null;
  readonly realWeeklyHours: number | null;
  readonly holidays: {
    readonly days: number;
    readonly unit: (typeof HOLIDAY_UNITS)[number];
    readonly workDaysPerWeek: number | null;
    readonly includedInSalary: boolean;
  } | null;
  readonly extraPays: { readonly count: number; readonly prorated: boolean } | null;
  readonly clauses: readonly {
    readonly label: (typeof CLAUSE_LABELS)[number];
    readonly months: number | null;
    readonly compensationStated: YesNo;
    readonly trainingDescribed: YesNo;
    readonly waivedRight: (typeof WAIVED_RIGHTS)[number] | null;
    readonly costsOnWorker: YesNo;
    readonly literal: { readonly text: string };
  }[];
  // Each element of art. 3.2 RD 723/2026; `unknown` is one the person could not find.
  readonly info: Readonly<
    Record<(typeof INFO_ELEMENTS)[number], 'present' | 'by_reference' | 'absent' | 'unknown'>
  >;
  readonly history:
    | readonly {
        readonly startDate: Iso;
        readonly endDate: Iso;
        readonly employer: 'same' | 'same_group' | 'same_via_agency' | 'other';
        readonly kind: 'production' | 'replacement' | 'training' | 'permanent' | 'unknown';
      }[]
    | null;
  readonly historyIncomplete: boolean;
  readonly offer: {
    readonly grossAnnual: number | null;
    readonly net: boolean;
    readonly weeklyHours: number | null;
    readonly modality: (typeof MODALITIES)[number] | null;
    readonly remote: (typeof REMOTE_WORK)[number] | null;
  } | null;
}

export interface ExpectedRange {
  readonly min: number;
  readonly max: number;
}

// A finding: its rule, its status, and the euros it carries when it carries any.
export interface ExpectedFinding {
  readonly id: string;
  readonly status: string;
  readonly amount?: ExpectedRange;
}

// A point of the review: one finding, or `depends` with one finding per reading when the
// person's «No lo sé» changes the outcome.
export type ExpectedPoint =
  | ExpectedFinding
  | {
      readonly id: string;
      readonly status: 'depends';
      readonly question: string;
      readonly readings: readonly (ExpectedFinding & { readonly when: string })[];
    };

export interface ExpectedClause {
  readonly label: string;
  // Null for a clause listed with its words and no verdict, or checked under another item.
  readonly point: ExpectedPoint | null;
  // The rule of the working-time finding that already checks it.
  readonly checkedIn: string | null;
}

export interface ExpectedEmploymentReview {
  readonly scope:
    | { readonly inScope: true; readonly partial: false }
    | { readonly inScope: true; readonly partial: true; readonly reason: string }
    | { readonly inScope: false; readonly reason: string };
  readonly items: readonly ExpectedPoint[];
  readonly clauses: readonly ExpectedClause[];
  // Whether art. 3.2 RD 723/2026 applies, and the elements flagged when it does.
  readonly informationDuty:
    | null
    | { readonly applies: false; readonly reason: string }
    | {
        readonly applies: true;
        readonly moment: string;
        readonly flagged: readonly { readonly element: string; readonly status: string }[];
      };
  readonly offer: {
    readonly differences: readonly Readonly<Record<string, string | number>>[];
    readonly notCompared: readonly { readonly field: string; readonly reason: string }[];
  } | null;
  readonly offerPass: boolean;
}

export interface EmploymentBankCase {
  // The file name without `.json`.
  readonly id: string;
  // The rule the case exercises, with its article.
  readonly description: string;
  // One of the hard packs (bad photos, doubtful cases, long documents) read in the AI pass.
  readonly eval: boolean;
  // The day the review runs.
  readonly today: Iso;
  readonly pages: readonly EmploymentPageSpec[];
  readonly expected: {
    readonly extraction: ExpectedExtraction;
    readonly input: EmploymentCaseInput;
    readonly review: ExpectedEmploymentReview;
  };
}

export const isEmploymentTemplatePage = (
  page: EmploymentPageSpec,
): page is PageBase & { readonly template: EmploymentTemplateId } => 'template' in page;

// The kind of document a page should be read as.
export const employmentPageKind = (page: EmploymentPageSpec): string =>
  isEmploymentTemplatePage(page) ? EMPLOYMENT_TEMPLATES[page.template] : page.kind;
