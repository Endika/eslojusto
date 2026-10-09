import type { INSURANCE_PAGE_KINDS } from '../src/domain/documents';
import type {
  CAR_COVERS,
  INSURANCE_LINES,
  INSURANCE_READABILITY,
} from '../src/domain/insurance-schema';
import type { Degrade, ExpectedExtraction, PageData } from './schema';

// One synthetic insurance pack: the pages to render, what a read should find in them, and what
// the site's insurance engine should say about the facts behind them. Every value is invented.

// Each template and the kind of document it should be read as. A template renders to as many
// images as it has sheets.
export const INSURANCE_TEMPLATES = {
  'insurance/policy-es': 'insurance_policy',
  'insurance/policy-gl': 'insurance_policy',
  'insurance/car-es': 'insurance_policy',
  'insurance/renewal-es': 'insurance_renewal_notice',
} as const satisfies Readonly<Record<string, (typeof INSURANCE_PAGE_KINDS)[number]>>;
export type InsuranceTemplateId = keyof typeof INSURANCE_TEMPLATES;
export const INSURANCE_TEMPLATE_IDS = Object.keys(
  INSURANCE_TEMPLATES,
) as readonly InsuranceTemplateId[];

type Readability = (typeof INSURANCE_READABILITY)[number];

interface PageBase {
  readonly data: PageData;
  readonly degrade: Degrade;
  // What a read should say of each image of this page; ok unless the photo is spoiled.
  readonly readability?: Readability;
}

// `other` is a page drawn by the renderer itself that nothing in the review uses.
export type InsurancePageSpec =
  (PageBase & { readonly template: InsuranceTemplateId }) | (PageBase & { readonly kind: 'other' });

// Page data keys that hold a person's data: never to be transcribed by a read. The insurer's
// contact who manages the policy is a person too.
export const INSURANCE_PERSON_KEYS = ['holderName', 'holderDni', 'iban', 'contactName'] as const;

type Iso = string;

// The engine's InsuranceInput with ISO dates, as a person would enter it from these documents.
export interface InsuranceCaseInput {
  readonly line: (typeof INSURANCE_LINES)[number];
  readonly carCover: (typeof CAR_COVERS)[number] | null;
  readonly mortgageRequired: boolean | null;
  readonly renews: boolean | null;
  readonly expiresOn: Iso;
  readonly notice: {
    readonly receivedOn: Iso;
    readonly previousPremium: number | null;
    readonly newPremium: number | null;
    readonly changes: boolean | null;
  } | null;
  readonly distance: boolean | null;
  readonly concludedOn: Iso | null;
  readonly policyReceived: boolean | null;
  readonly policyReceivedOn: Iso | null;
}

// A finding: its rule, its status, and the last day of its period with the days left while open.
export interface ExpectedInsuranceFinding {
  readonly id: string;
  readonly status: string;
  readonly lastDay: Iso | null;
  readonly daysLeft: number | null;
}

export interface ExpectedInsuranceReview {
  readonly scope: { readonly inScope: true } | { readonly inScope: false; readonly reason: string };
  readonly findings: readonly ExpectedInsuranceFinding[];
  // The ids of the information blocks, in order.
  readonly information: readonly string[];
  // No insurance finding carries euros.
  readonly offerPass: false;
}

export interface InsuranceBankCase {
  // The file name without `.json`.
  readonly id: string;
  // The rule the case exercises, with its article.
  readonly description: string;
  // One of the hard packs (bad photos, doubtful cases, long documents) read in the AI pass.
  readonly eval: boolean;
  // The day the review runs.
  readonly today: Iso;
  readonly pages: readonly InsurancePageSpec[];
  readonly expected: {
    readonly extraction: ExpectedExtraction;
    readonly input: InsuranceCaseInput;
    readonly review: ExpectedInsuranceReview;
  };
}

export const isInsuranceTemplatePage = (
  page: InsurancePageSpec,
): page is PageBase & { readonly template: InsuranceTemplateId } => 'template' in page;

// The kind of document a page should be read as.
export const insurancePageKind = (page: InsurancePageSpec): string =>
  isInsuranceTemplatePage(page) ? INSURANCE_TEMPLATES[page.template] : page.kind;
