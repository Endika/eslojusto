// The API's request and response shapes, mirrored from the api package (api/README.md, «Contract»).
// The two must change together; the site never trusts a response that does not match them.

export const DOCUMENT_KINDS = ['settlement', 'payslip', 'work_history'] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const MEDIA_TYPES = ['image/jpeg', 'image/webp', 'application/pdf'] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

export const LIMITS = {
  maxImages: 4,
  maxPdfFiles: 1,
  maxPdfPages: 4,
  // A heavier PDF is almost always a scan; photos of its pages read better.
  maxPdfBytes: 2 * 1024 * 1024,
  maxImageLongSide: 1568,
  maxPayloadBytes: 6 * 1024 * 1024,
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
  'mixed_files',
  'unsupported_media_type',
  'image_unreadable',
  'image_too_large',
  'pdf_unreadable',
  'pdf_too_large',
  'pdf_too_many_pages',
  'document_too_dense',
  'captcha_failed',
  'daily_limit_reached',
  'pass_invalid',
  'pass_expired',
  'pass_exhausted',
  'pass_revoked',
  'document_kind_mismatch',
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
  'checkout_unavailable',
  'no_checkout',
] as const;
export type ClientErrorCode = (typeof CLIENT_ERROR_CODES)[number];

export type ErrorCode = ApiErrorCode | ClientErrorCode;
export const ERROR_CODES: readonly ErrorCode[] = [...API_ERROR_CODES, ...CLIENT_ERROR_CODES];

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

// The fields and lists each kind can return (api/src/domain/extraction-schema.ts). For a payslip,
// `extraPayAmount` is the full extra payment paid in the period, when `extraPayPaid` is true.
export const EXTRACTION_SHAPE = {
  settlement: {
    fields: [
      'detectedKind',
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
      'totalAccrued',
    ],
    lists: ['otherAccruals'],
  },
  payslip: {
    fields: [
      'detectedKind',
      'periodStart',
      'periodEnd',
      'startDate',
      'totalAccrued',
      'extraPayProrated',
      'extraPayProratedAmount',
      'extraPayPaid',
      'extraPayAmount',
    ],
    lists: ['accruals'],
  },
  work_history: { fields: ['detectedKind'], lists: ['contracts'] },
} as const satisfies Record<
  DocumentKind,
  { readonly fields: readonly string[]; readonly lists: readonly string[] }
>;

export interface Extraction {
  readonly kind: DocumentKind;
  readonly fields: Readonly<Record<string, ExtractedField>>;
  readonly lists: Readonly<Record<string, readonly ExtractedRow[]>>;
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
  readonly kind: DocumentKind;
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
