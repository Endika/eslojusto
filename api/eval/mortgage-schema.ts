import type { MORTGAGE_PAGE_KINDS } from '../src/domain/documents';
import type {
  MORTGAGE_CLAUSE_LABELS,
  MORTGAGE_LOAN_KINDS,
  MORTGAGE_OPERATION_KINDS,
  MORTGAGE_RATE_TYPES,
  MORTGAGE_READABILITY,
  PREPAYMENT_OPTIONS,
} from '../src/domain/mortgage-schema';
import type { Degrade, ExpectedExtraction, PageData } from './schema';

// One synthetic mortgage pack: the pages to render, what a read should find in them, and what the
// site's mortgage engine should say about the facts behind them. Every value is invented.

// Each template and the kind of document it should be read as. A template renders to as many
// images as it has sheets.
export const MORTGAGE_TEMPLATES = {
  'mortgage/deed-es': 'mortgage_deed',
  'mortgage/deed-clauses-es': 'mortgage_deed',
  'mortgage/deed-closing-es': 'mortgage_deed',
  'mortgage/deed-ca': 'mortgage_deed',
  'mortgage/deed-gl': 'mortgage_deed',
  'mortgage/notary-invoice-es': 'notary_invoice',
  'mortgage/registry-invoice-es': 'registry_invoice',
  'mortgage/agency-invoice-es': 'agency_invoice_mortgage',
  'mortgage/valuation-invoice-es': 'valuation_invoice',
  'mortgage/ajd-form-es': 'ajd_form',
  'mortgage/transparency-act-es': 'transparency_deed',
  'mortgage/prepayment-es': 'prepayment_statement',
} as const satisfies Readonly<Record<string, (typeof MORTGAGE_PAGE_KINDS)[number]>>;
export type MortgageTemplateId = keyof typeof MORTGAGE_TEMPLATES;
export const MORTGAGE_TEMPLATE_IDS = Object.keys(
  MORTGAGE_TEMPLATES,
) as readonly MortgageTemplateId[];

type Readability = (typeof MORTGAGE_READABILITY)[number];

interface PageBase {
  readonly data: PageData;
  readonly degrade: Degrade;
  // What a read should say of each image of this page; ok unless the photo is spoiled.
  readonly readability?: Readability;
}

// `other` is a page drawn by the renderer itself that nothing in the review uses.
export type MortgagePageSpec =
  (PageBase & { readonly template: MortgageTemplateId }) | (PageBase & { readonly kind: 'other' });

// Page data keys that hold a person's data: never to be transcribed by a read. The notary who
// authorises the deed is a person too.
export const MORTGAGE_PERSON_KEYS = ['borrowerName', 'borrowerDni', 'iban', 'notaryName'] as const;

type Iso = string;

// The engine's MortgageInput with ISO dates, as a person would enter it in the site's form from
// these documents: only the invoices of the loan they hold, paid on one day; the clauses the deed
// has; the latest operation.
export interface MortgageCaseInput {
  readonly deedOn: Iso;
  readonly borrower: 'individual' | 'company';
  readonly purpose: 'housing' | 'business';
  readonly consumer: boolean | null;
  readonly loanKind: (typeof MORTGAGE_LOAN_KINDS)[number] | 'not_mortgage';
  readonly rateType: (typeof MORTGAGE_RATE_TYPES)[number];
  readonly fixedUntil: Iso | null;
  readonly rateRevisionMonths: number | null;
  readonly loanAmount: number | null;
  readonly expensesClause: 'present' | 'absent' | 'unknown';
  readonly invoices: readonly {
    readonly kind:
      | 'notary_loan'
      | 'registry_mortgage'
      | 'agency'
      | 'valuation'
      | 'transparency_deed'
      | 'ajd_loan';
    readonly total: number | null;
    readonly paidBy: 'me' | 'bank' | 'unknown';
    readonly paidOn: Iso | null;
    readonly mixed: boolean;
    readonly supplied: readonly number[];
  }[];
  readonly alreadyReturned: number | null;
  readonly agreementOnExpenses: boolean | null;
  readonly prepaymentOption: (typeof PREPAYMENT_OPTIONS)[number] | 'unknown' | null;
  readonly deedPercents: { readonly variable?: number; readonly fixed?: number };
  readonly operations: readonly {
    readonly on: Iso;
    readonly kind: (typeof MORTGAGE_OPERATION_KINDS)[number];
    readonly principal: number;
    readonly feeCharged: number;
    readonly hadInsurance: boolean | null;
  }[];
  readonly clauses: readonly {
    readonly label: (typeof MORTGAGE_CLAUSE_LABELS)[number];
    readonly present: boolean | null;
    readonly floorPercent?: number;
    readonly defaultRate?: number;
    readonly ordinaryRate?: number;
    readonly missedInstalments?: number;
    readonly duplicateFee?: boolean;
    readonly feeAmount?: number;
  }[];
}

// Legal interest on the lender's part of a cost, up to its last day counted.
export interface ExpectedInterest {
  readonly amount: number;
  readonly until: Iso;
  readonly estimated: boolean;
  readonly missingYear: number | null;
}

// A cost of the deed's day: who bears it and on what basis, the share and euros, and the keys of
// the sentences that explain it.
export interface ExpectedMortgageExpense {
  readonly kind: string;
  readonly basis: 'statute' | 'case_law' | null;
  readonly status: string;
  readonly share: number | null;
  readonly amount: number | null;
  readonly interest: ExpectedInterest | null;
  readonly phrases: readonly string[];
}

// An early repayment, switch or change of lender against its cap.
export interface ExpectedMortgageFeeFinding {
  readonly kind: string;
  readonly status: string;
  readonly capPercent: number | null;
  readonly cap: number | null;
  readonly amount: number | null;
  readonly phrases: readonly string[];
}

// One finding, or `depends` with one finding per reading when the deed or the law leaves the cap
// open.
export type ExpectedMortgageFee =
  | ExpectedMortgageFeeFinding
  | {
      readonly status: 'depends';
      readonly question: string;
      readonly readings: readonly (ExpectedMortgageFeeFinding & { readonly when: string })[];
    };

// A clause flag: what the deed's figures say, and each law or court criterion beside it.
export interface ExpectedMortgageFlag {
  readonly label: string;
  readonly state: string;
  readonly phrases: readonly string[];
  readonly parts: readonly {
    readonly basis: 'statute' | 'case_law';
    readonly rule: string;
    readonly phrases: readonly string[];
  }[];
}

export interface ExpectedMortgageReview {
  readonly scope: { readonly inScope: true } | { readonly inScope: false; readonly reason: string };
  readonly expenses: readonly ExpectedMortgageExpense[];
  readonly fees: readonly ExpectedMortgageFee[];
  readonly flags: readonly ExpectedMortgageFlag[];
  // The ids of the information blocks, in order.
  readonly information: readonly string[];
  // By law and by the Supreme Court's split, never added together; the fees over their caps in
  // every reading, and at most.
  readonly totals: {
    readonly statute: number;
    readonly caseLaw: number;
    readonly caseLawInterest: ExpectedInterest | null;
    readonly fees: { readonly counted: number; readonly upTo: number };
  };
  readonly offerPass: boolean;
}

export interface MortgageBankCase {
  // The file name without `.json`.
  readonly id: string;
  // The rule the case exercises, with its article.
  readonly description: string;
  // One of the hard packs (bad photos, doubtful cases, long documents) read in the AI pass.
  readonly eval: boolean;
  // The day the review runs.
  readonly today: Iso;
  readonly pages: readonly MortgagePageSpec[];
  readonly expected: {
    readonly extraction: ExpectedExtraction;
    readonly input: MortgageCaseInput;
    readonly review: ExpectedMortgageReview;
  };
}

export const isMortgageTemplatePage = (
  page: MortgagePageSpec,
): page is PageBase & { readonly template: MortgageTemplateId } => 'template' in page;

// The kind of document a page should be read as.
export const mortgagePageKind = (page: MortgagePageSpec): string =>
  isMortgageTemplatePage(page) ? MORTGAGE_TEMPLATES[page.template] : page.kind;
