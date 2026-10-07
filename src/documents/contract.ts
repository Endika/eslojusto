// The API's request and response shapes, mirrored from the api package (api/README.md, «Contract»).
// The two must change together; the site never trusts a response that does not match them.
import { MAX_IMAGE_LONG_SIDE } from '../../api/src/domain/image-limit';

// What the API says each page is; `other` is a page the review has no use for.
export const PAGE_KINDS = [
  'settlement_proposal',
  'payslip',
  'dismissal_letter',
  'company_certificate',
  'settlement_agreement',
  'work_history',
  'other',
] as const;
export type PageKind = (typeof PAGE_KINDS)[number];
export type SourceKind = Exclude<PageKind, 'other'>;

// The API reads images only; the browser renders a PDF's pages to images first.
export const MEDIA_TYPES = ['image/jpeg', 'image/webp'] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

export const LIMITS = {
  // Photos and PDF pages together: each becomes one image.
  maxImages: 15,
  // What the browser opens to render; past it, a PDF is too heavy to render on a phone.
  maxPdfBytes: 20 * 1024 * 1024,
  maxImageLongSide: MAX_IMAGE_LONG_SIDE,
  maxPayloadBytes: 6 * 1024 * 1024,
  // What the browser lets a request weigh: under the API's limit, with room for Lambda's event
  // envelope, which counts towards its 6 MB too.
  requestBudgetBytes: 5_800_000,
} as const;

export const FREE_READS_PER_DAY = 2;
export const PASS_READS = 15;
export const PASS_DAYS = 7;
export const PASS_PRICE = 4.99;

export const API_ERROR_CODES = [
  'method_not_allowed',
  'invalid_request',
  'payload_too_large',
  'no_files',
  'too_many_files',
  'unsupported_media_type',
  'image_unreadable',
  'image_too_large',
  'document_too_dense',
  'captcha_failed',
  'daily_limit_reached',
  'pass_invalid',
  'pass_expired',
  'pass_exhausted',
  'pass_revoked',
  'document_unreadable',
  'model_unavailable',
  'session_not_found',
  'session_mismatch',
  'payment_not_complete',
  'price_mismatch',
  'payment_provider_unavailable',
  'service_unavailable',
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

// What can go wrong before or around a request, in the browser.
export const CLIENT_ERROR_CODES = [
  'network_error',
  'unexpected_response',
  'captcha_unavailable',
  'file_type',
  'pdf_unreadable',
  'pdf_encrypted',
  'pdf_too_large',
  'pdf_too_slow',
  'checkout_unavailable',
  'no_checkout',
] as const;
export type ClientErrorCode = (typeof CLIENT_ERROR_CODES)[number];

export type ErrorCode = ApiErrorCode | ClientErrorCode;
// Marked pure so a build without the documents API can drop it with the events that use it.
export const ERROR_CODES: readonly ErrorCode[] = /* @__PURE__ */ (
  API_ERROR_CODES as readonly ErrorCode[]
).concat(CLIENT_ERROR_CODES);

export const CONFIDENCES = ['high', 'medium', 'low'] as const;
export type Confidence = (typeof CONFIDENCES)[number];

export type ExtractedValue = string | number | boolean;

export interface ExtractedField {
  readonly value: ExtractedValue;
  readonly confidence: Confidence;
}

export interface ExtractedRow {
  readonly values: Readonly<Record<string, ExtractedValue>>;
  readonly confidence: Confidence;
}

// The fields the API merges from the documents (api/src/domain/merge.ts), each with the kind of
// document it came from. `extraPayAmount` is the full extra payment paid in the payslip's period,
// when `extraPayPaid` is true.
export const EXTRACTED_FIELDS = [
  'startDate',
  'endDate',
  'cause',
  'fixedTermType',
  'monthlySalary',
  'pending_salary',
  'holiday_pay',
  'extra_pay',
  'severance',
  'employer_notice',
  'notice_deduction',
  'annualHolidayDays',
  'holidayDaysTaken',
  'noticeDaysReceived',
  // Notice paid instead of given; the form takes only the days given.
  'noticeDaysPaid',
  'payslipPeriodStart',
  'payslipPeriodEnd',
  'payslipTotalAccrued',
  'extraPayProrated',
  'extraPayProratedAmount',
  'extraPayPaid',
  'extraPayAmount',
  // What an agreement or conciliation offers as severance in total: shown, never prefilled.
  'agreementSeveranceTotal',
] as const;
export type ExtractedFieldName = (typeof EXTRACTED_FIELDS)[number];

export interface SourcedField extends ExtractedField {
  readonly source: SourceKind;
}

// Consecutive pages of one document; `month` (YYYY-MM) only for a payslip.
export interface RecognisedDocument {
  readonly kind: PageKind;
  readonly pages: number;
  readonly month?: string;
}

// Two documents that state a field differently; the first source is the one kept.
export interface Conflict {
  readonly field: ExtractedFieldName;
  readonly sources: readonly SourceKind[];
}

export interface Extraction {
  readonly documents: readonly RecognisedDocument[];
  readonly fields: Readonly<Partial<Record<ExtractedFieldName, SourcedField>>>;
  // Rows for «Otros trabajos», from the work history.
  readonly contracts: readonly ExtractedRow[];
  readonly conflicts: readonly Conflict[];
}

export const COHERENCE_CHECKS = [
  'end_before_start',
  'items_do_not_sum',
  'period_end_before_start',
  'start_after_period_end',
  'proration_exceeds_total',
  'contract_end_before_start',
] as const;
export type CoherenceCheck = (typeof COHERENCE_CHECKS)[number];

export interface DocumentFile {
  readonly mediaType: MediaType;
  // Base64, without a data: prefix.
  readonly data: string;
}

export interface ExtractRequest {
  readonly files: readonly DocumentFile[];
  readonly captchaToken: string;
  // Exactly one of the two: a pass read, or a free read with the last quota token (or null).
  readonly pass?: string;
  readonly quota?: string | null;
}

export type Failure = { readonly ok: false; readonly code: ErrorCode };

export type ExtractResult =
  | {
      readonly ok: true;
      readonly extraction: Extraction;
      readonly failedChecks: readonly CoherenceCheck[];
      // A free read returns the quota token to send next time; a pass read, the reads it has left.
      readonly allowance: string | null;
      readonly readsLeft: number | null;
      // Whether the reading was repeated with the stronger model; null when the API doesn't say.
      readonly escalated: boolean | null;
    }
  | Failure;

export type CheckoutResult =
  { readonly ok: true; readonly sessionId: string; readonly url: string } | Failure;

export type PassResult =
  | {
      readonly ok: true;
      readonly pass: string;
      readonly expiresAt: number;
      readonly readsLeft: number;
    }
  | Failure;

export interface Api {
  extract(request: ExtractRequest): Promise<ExtractResult>;
  // The captcha token comes from a Turnstile widget with the action «checkout».
  checkout(nonce: string, captchaToken: string): Promise<CheckoutResult>;
  pass(sessionId: string, nonce: string): Promise<PassResult>;
}

// Shapes the API checks too (src/domain/payments.ts there).
export const NONCE = /^[A-Za-z0-9_-]{22,64}$/;
export const SESSION_ID = /^cs_(test|live)_[A-Za-z0-9]{1,250}$/;
