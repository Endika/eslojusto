import type { RENTAL_PAGE_KINDS } from '../src/domain/documents';
import type {
  CHARGE_KINDS,
  DEDUCTION_KINDS,
  FEE_CONCEPT_KINDS,
  GUARANTEE_KINDS,
  LANDLORD_TYPES,
  LEASE_USES,
  RENTAL_READABILITY,
  UPDATE_CLAUSE_INDEXES,
} from '../src/domain/rental-schema';

// One synthetic lease pack: the pages to render, what a read should find in them, and what the
// site's rental engine should say about the facts behind them. Every value is invented.

export const TEMPLATE_IDS = [
  'general-es',
  'long-es',
  'catalan-ca',
  'basque-eu',
  'galician-gl',
] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

// Documents other than the lease, drawn by the renderer itself; `other` is a page nothing in the
// review uses, such as a supermarket receipt.
export type DocumentKind = (typeof RENTAL_PAGE_KINDS)[number];
type Readability = (typeof RENTAL_READABILITY)[number];

// How the photo of a page is spoiled, applied in a canvas from a seeded PRNG.
export interface Degrade {
  // Degrees, clockwise.
  readonly rotate: number;
  // 0-1: how dark the shadow across one corner gets.
  readonly shadow: number;
  // Pixels of gaussian blur.
  readonly blur: number;
  // 0-1: how much the whole page is darkened.
  readonly dark: number;
  // 0-1: the share of the page cut off the bottom.
  readonly crop: number;
  // 0-1, as the canvas JPEG encoder takes it.
  readonly jpegQuality: number;
}

export type PageData = Readonly<Record<string, string | number>>;

interface PageBase {
  readonly data: PageData;
  readonly degrade: Degrade;
  // What a read should say of each image of this page; ok unless the photo is spoiled.
  readonly readability?: Readability;
}

// A lease template renders to as many images as it has sheets; any other kind to one.
export type PageSpec =
  (PageBase & { readonly template: TemplateId }) | (PageBase & { readonly kind: DocumentKind });

// Page data keys that hold a person's data: never to be transcribed by a read.
export const PERSON_KEYS = [
  'landlordName',
  'landlordDni',
  'tenantName',
  'tenantDni',
  'iban',
  'signatory',
] as const;

export type ExpectedValue = string | number | boolean;

export interface ExpectedExtraction {
  // nothing_read when the pages are too spoiled to yield anything.
  readonly outcome: 'ok' | 'nothing_read';
  readonly fields: Readonly<Record<string, ExpectedValue>>;
  // Rows in the order the documents print them; only the values listed are compared.
  readonly lists: Readonly<Record<string, readonly Readonly<Record<string, ExpectedValue>>[]>>;
}

type Iso = string;

// The engine's RentalInput with ISO dates, as a person would enter it from these documents.
export interface CaseInput {
  readonly contractType: (typeof LEASE_USES)[number];
  readonly signedOn: Iso;
  readonly startDate: Iso;
  readonly landlordType: (typeof LANDLORD_TYPES)[number];
  readonly largeLandlord: boolean | null;
  readonly agreedMonths: number;
  readonly initialRent: number;
  readonly updateClause: (typeof UPDATE_CLAUSE_INDEXES)[number];
  readonly fixedPercent?: number;
  readonly region: string;
  readonly stressedZone: boolean | null;
  readonly fees: readonly {
    readonly kind: (typeof FEE_CONCEPT_KINDS)[number];
    readonly amount: number;
    readonly deductedLater: boolean;
    readonly requestedInWriting: boolean | null;
  }[];
  readonly deposit: number | null;
  readonly guarantees: readonly {
    readonly kind: (typeof GUARANTEE_KINDS)[number];
    readonly amount: number | null;
  }[];
  readonly advanceMonths: number | null;
  readonly updates: readonly {
    readonly anniversary: Iso;
    readonly effectiveOn: Iso;
    readonly previousRent: number;
    readonly newRent: number;
    readonly chargedFrom: Iso;
    readonly notice:
      'letter' | 'burofax' | 'receipt_note' | 'annex' | 'email' | 'messaging' | 'verbal' | 'none';
    readonly noticeOn: Iso | null;
    readonly agreedInWriting: boolean | null;
  }[];
  readonly charges: readonly {
    readonly kind: (typeof CHARGE_KINDS)[number];
    readonly inContract: boolean;
    readonly annualAgreed: number | null;
    readonly charged: readonly { readonly year: number; readonly amount: number }[];
  }[];
  readonly moveOut: {
    readonly keysReturnedOn: Iso;
    readonly returns: readonly { readonly on: Iso; readonly amount: number }[];
    readonly deductions: readonly {
      readonly amount: number;
      readonly kind: (typeof DEDUCTION_KINDS)[number];
    }[];
  } | null;
}

// An item of the review: `fee:0`, `guarantees`, `guarantee:1`, `advance`, `rent_update:0`,
// `charge:0` or `charge:0:2024` (a charge by year), `deposit_return`, `deposit_interest`.
export interface ExpectedItem {
  readonly id: string;
  // The item's status, or `depends` when the readings differ.
  readonly status: string;
  // Euros a single result carries, or what a `depends` counts in every reading.
  readonly amount?: number;
  // For `depends`: the most any reading gives, and the doubts that move it.
  readonly upTo?: number;
  readonly reasons?: readonly string[];
}

export interface ExpectedReview {
  readonly scope: { readonly inScope: true } | { readonly inScope: false; readonly reason: string };
  readonly items: readonly ExpectedItem[];
}

export interface BankCase {
  // The file name without `.json`.
  readonly id: string;
  // The rule the case exercises, with its article.
  readonly description: string;
  // One of the hard packs (bad photos, doubtful cases, long documents) read in the AI pass.
  readonly eval: boolean;
  // The day the review runs.
  readonly today: Iso;
  readonly pages: readonly PageSpec[];
  readonly expected: {
    readonly extraction: ExpectedExtraction;
    readonly input: CaseInput;
    readonly review: ExpectedReview;
  };
}

export const isTemplatePage = (
  page: PageSpec,
): page is PageBase & { readonly template: TemplateId } => 'template' in page;

// The kind of document a page should be read as.
export const pageKind = (page: PageSpec): DocumentKind =>
  isTemplatePage(page) ? 'lease' : page.kind;

// Placeholders a template or a drawn document fills: `{{name}}`.
export const PLACEHOLDER = /\{\{(\w+)\}\}/g;

// Sheets of a lease template: one image each.
export const SHEET = /<section class="page"/g;

export const FOOTER = 'Documento ficticio · banco de pruebas';
