import type { CREDIT_PAGE_KINDS } from '../src/domain/documents';
import type {
  CREDIT_READABILITY,
  LOAN_CHARGE_KINDS,
  LOAN_CHARGE_PAYMENTS,
  LOAN_PRODUCTS,
  LOAN_RATE_TYPES,
} from '../src/domain/credit-schema';
import type { Degrade, ExpectedExtraction, PageData } from './schema';

// One synthetic consumer credit pack: the pages to render, what a read should find in them, and
// what the site's credit engine should say about the facts behind them. Every value is invented.

// Each template and the kind of document it should be read as. A template renders to as many
// images as it has sheets.
export const CREDIT_TEMPLATES = {
  'credit/loan-es': 'credit_agreement',
  'credit/loan-ca': 'credit_agreement',
  'credit/car-loan-es': 'credit_agreement',
  'credit/precontract-es': 'credit_precontract_info',
  'credit/schedule-es': 'amortization_schedule',
  'credit/early-repayment-es': 'early_repayment_statement',
  'credit/revolving-es': 'revolving_agreement',
  'credit/card-statement-es': 'card_statement',
} as const satisfies Readonly<Record<string, (typeof CREDIT_PAGE_KINDS)[number]>>;
export type CreditTemplateId = keyof typeof CREDIT_TEMPLATES;
export const CREDIT_TEMPLATE_IDS = Object.keys(CREDIT_TEMPLATES) as readonly CreditTemplateId[];

type Readability = (typeof CREDIT_READABILITY)[number];

interface PageBase {
  readonly data: PageData;
  readonly degrade: Degrade;
  // What a read should say of each image of this page; ok unless the photo is spoiled.
  readonly readability?: Readability;
}

// `other` is a page drawn by the renderer itself that nothing in the review uses.
export type CreditPageSpec =
  (PageBase & { readonly template: CreditTemplateId }) | (PageBase & { readonly kind: 'other' });

// Page data keys that hold a person's data: never to be transcribed by a read.
export const CREDIT_PERSON_KEYS = ['borrowerName', 'borrowerDni', 'iban'] as const;

type Iso = string;

// The engine's CreditInput with ISO dates, as a person would enter it from these documents.
export interface CreditCaseInput {
  readonly product: (typeof LOAN_PRODUCTS)[number];
  readonly purpose: 'personal' | 'business';
  readonly secured: 'none' | 'mortgage';
  readonly leaseWithoutPurchase: boolean;
  readonly agreedOn: Iso;
  readonly drawnOn: Iso;
  readonly principal: number;
  readonly netDisbursed: number | null;
  readonly nominalRate: number;
  readonly rateType: (typeof LOAN_RATE_TYPES)[number];
  readonly declaredApr: number | null;
  readonly declaredTotalPayable: number | null;
  readonly confirmedApr: boolean;
  readonly instalments:
    | {
        readonly kind: 'regular';
        readonly count: number;
        readonly amount: number;
        readonly frequency: 'monthly';
        readonly firstDueOn: Iso;
      }
    | {
        readonly kind: 'schedule';
        readonly rows: readonly { readonly dueOn: Iso; readonly amount: number }[];
      }
    | null;
  readonly balloon: { readonly amount: number; readonly dueOn: Iso | null } | null;
  readonly charges: readonly {
    readonly kind: (typeof LOAN_CHARGE_KINDS)[number];
    readonly amount: number;
    readonly paidOn: Iso;
    readonly how: (typeof LOAN_CHARGE_PAYMENTS)[number];
  }[];
  readonly insurance: {
    readonly premium: number;
    readonly single: boolean;
    readonly financed: boolean;
    readonly required: boolean | null;
  } | null;
  readonly card: {
    readonly limit: number;
    readonly nominalRate: number;
    readonly annualFee: number;
    readonly minimumPayment: number;
    readonly balance: number;
  } | null;
  readonly earlyRepayment: {
    readonly on: Iso;
    readonly principalRepaid: number;
    readonly interestSettled: number | null;
    readonly compensationCharged: number;
    readonly paidByInsurance: boolean;
    readonly agreedEndOn: Iso;
    readonly remainingInterest: number | null;
    readonly discountLost: boolean | null;
  } | null;
  readonly infoReceivedOn: Iso | null;
  readonly infoReceived: boolean | null;
  // Letters of art. 16.2 LCC the person answered about; the engine's test checks the letters.
  readonly mentions: Readonly<Record<string, boolean>>;
}

// A finding: its rule, its status, and what it carries when it carries it: euros over a cap, the
// last day of a period and the days left, the APR worked out from the contract's figures.
export interface ExpectedCreditFinding {
  readonly id: string;
  readonly status: string;
  readonly amount?: number;
  readonly lastDay?: Iso;
  readonly daysLeft?: number;
  readonly apr?: number;
}

// A point of the review: one finding, or `depends` with one finding per reading when a «No lo
// sé» or a doubtful base changes the outcome.
export type ExpectedCreditPoint =
  | ExpectedCreditFinding
  | {
      readonly id: string;
      readonly status: 'depends';
      readonly question: string;
      readonly readings: readonly (ExpectedCreditFinding & { readonly when: string })[];
    };

export interface ExpectedIndicator {
  readonly status: string;
  readonly apr: number | null;
  readonly aprOrigin: 'recalculated' | 'declared' | null;
  readonly reference:
    | null
    | {
        readonly kind: 'series';
        readonly series: string;
        readonly month: string;
        readonly value: number;
      }
    | { readonly kind: 'ruling_2010'; readonly value: number };
  readonly points: number | null;
}

export interface ExpectedCreditReview {
  readonly scope:
    | { readonly inScope: true; readonly indicatorOnly: boolean }
    | { readonly inScope: false; readonly reason: string };
  readonly items: readonly ExpectedCreditPoint[];
  // Never in a total, never behind the pass; null when the review stops at the door.
  readonly indicator: ExpectedIndicator | null;
  // The ids of the information blocks, in order.
  readonly information: readonly string[];
  // Compensation for an early repayment over the caps of art. 30 LCC: in every reading, and at most.
  readonly overCharged: { readonly counted: number; readonly upTo: number };
  readonly offerPass: boolean;
}

export interface CreditBankCase {
  // The file name without `.json`.
  readonly id: string;
  // The rule the case exercises, with its article.
  readonly description: string;
  // One of the hard packs (bad photos, doubtful cases, long documents) read in the AI pass.
  readonly eval: boolean;
  // The day the review runs.
  readonly today: Iso;
  readonly pages: readonly CreditPageSpec[];
  readonly expected: {
    readonly extraction: ExpectedExtraction;
    readonly input: CreditCaseInput;
    readonly review: ExpectedCreditReview;
  };
}

export const isCreditTemplatePage = (
  page: CreditPageSpec,
): page is PageBase & { readonly template: CreditTemplateId } => 'template' in page;

// The kind of document a page should be read as.
export const creditPageKind = (page: CreditPageSpec): string =>
  isCreditTemplatePage(page) ? CREDIT_TEMPLATES[page.template] : page.kind;
