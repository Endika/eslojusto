import type { TELECOM_PAGE_KINDS } from '../src/domain/documents';
import type { PRICE_INDEXES, TELECOM_READABILITY } from '../src/domain/telecom-schema';
import type { ExpectedBillItem, ExpectedBillTotals } from './electricity-schema';
import type { Degrade, ExpectedExtraction, PageData } from './schema';

// One synthetic phone or internet pack: the contract and the bills to render, what a read should
// find in them, and what the site's bills engine should say about leaving the contract. Every
// value is invented.

// Each template and the kind of document it should be read as. A template renders to as many
// images as it has sheets.
export const TELECOM_TEMPLATES = {
  'telecom/mobile-bill-es': 'telecom_bill',
  'telecom/fibre-bill-es': 'telecom_bill',
  'telecom/contract-es': 'telecom_contract',
} as const satisfies Readonly<Record<string, (typeof TELECOM_PAGE_KINDS)[number]>>;
export type TelecomTemplateId = keyof typeof TELECOM_TEMPLATES;
export const TELECOM_TEMPLATE_IDS = Object.keys(TELECOM_TEMPLATES) as readonly TelecomTemplateId[];

type Readability = (typeof TELECOM_READABILITY)[number];

interface PageBase {
  readonly data: PageData;
  readonly degrade: Degrade;
  // What a read should say of each image of this page; ok unless the photo is spoiled.
  readonly readability?: Readability;
}

// `other` is a page drawn by the renderer itself that nothing in the review uses.
export type TelecomPageSpec =
  (PageBase & { readonly template: TelecomTemplateId }) | (PageBase & { readonly kind: 'other' });

// Page data keys that hold a person's data: never to be transcribed by a read.
export const TELECOM_PERSON_KEYS = ['holderName', 'holderDni', 'iban'] as const;

type Iso = string;

// The engine's TelecomInput with ISO dates, as a person would enter it from the contract, the
// bills and their own answers: the day they asked to leave and the notice of a change.
export interface TelecomCaseInput {
  readonly commitment: {
    readonly startedOn: Iso;
    readonly months: number;
    readonly agreedPenalty: number | null;
  } | null;
  readonly exitRequestedOn: Iso;
  readonly penaltyCharged: number | null;
  readonly handset: { readonly value: number; readonly kept: boolean } | null;
  readonly changeNotice: {
    readonly sentOn: Iso | null;
    readonly appliesOn: Iso | null;
    readonly change: 'price_up' | 'service_worse' | 'other';
    readonly index: (typeof PRICE_INDEXES)[number];
  } | null;
  readonly lines: readonly { readonly from: Iso; readonly to: Iso; readonly amount: number }[];
}

export interface ExpectedTelecomReview {
  readonly scope: { readonly inScope: true } | { readonly inScope: false; readonly reason: string };
  readonly items: readonly ExpectedBillItem[];
  readonly totals: ExpectedBillTotals;
}

export interface TelecomBankCase {
  // The file name without `.json`.
  readonly id: string;
  // The rule the case exercises, with its article.
  readonly description: string;
  // One of the hard packs (bad photos, doubtful cases, long documents) read in the AI pass.
  readonly eval: boolean;
  // The day the review runs.
  readonly today: Iso;
  readonly pages: readonly TelecomPageSpec[];
  readonly expected: {
    readonly extraction: ExpectedExtraction;
    readonly input: TelecomCaseInput;
    readonly review: ExpectedTelecomReview;
  };
}

export const isTelecomTemplatePage = (
  page: TelecomPageSpec,
): page is PageBase & { readonly template: TelecomTemplateId } => 'template' in page;

// The kind of document a page should be read as.
export const telecomPageKind = (page: TelecomPageSpec): string =>
  isTelecomTemplatePage(page) ? TELECOM_TEMPLATES[page.template] : page.kind;
