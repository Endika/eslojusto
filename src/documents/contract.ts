// The API's request and response shapes, mirrored from the api package (api/README.md, «Contract»).
// The two must change together; the site never trusts a response that does not match them.
import { MAX_IMAGE_LONG_SIDE } from '../../api/src/domain/image-limit';

// Which review a request is for; a request without one is the final pay's.
export type ReviewKind = 'final_pay' | 'rental' | 'employment' | 'credit' | 'insurance';

// What the API says each page is; `other` is a page the review has no use for.
export const PAGE_KINDS = [
  'settlement_proposal',
  'payslip',
  'dismissal_letter',
  'company_certificate',
  'settlement_agreement',
  'work_history',
  'lease',
  'rent_update_notice',
  'rent_receipt',
  'agency_invoice',
  'deposit_return',
  'employment_contract',
  'job_offer',
  'other',
] as const;
export type PageKind = (typeof PAGE_KINDS)[number];
export type SourceKind = Exclude<PageKind, 'other'>;

// Whether the API could read a page, or the main reason it set it aside.
export const READABILITY = [
  'ok',
  'handwritten',
  'blurry',
  'dark',
  'cropped',
  'not_labour_document',
  'not_rental_document',
  'foreign_jurisdiction',
  'unknown_format',
] as const;
export type Readability = (typeof READABILITY)[number];

// Why a page sent gave nothing: what the API said of it, `no_data` when it was legible with
// nothing the review uses, `unread` when the API left it out of its answer.
export const SKIP_REASONS = [
  'handwritten',
  'blurry',
  'dark',
  'cropped',
  'not_labour_document',
  'not_rental_document',
  'foreign_jurisdiction',
  'unknown_format',
  'no_data',
  'unread',
] as const satisfies readonly (Exclude<Readability, 'ok'> | 'no_data' | 'unread')[];
export type SkipReason = (typeof SKIP_REASONS)[number];

// The API reads images only; the browser renders a PDF's pages to images first.
export const MEDIA_TYPES = ['image/jpeg', 'image/webp'] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

export const LIMITS = {
  // Photos and PDF pages together: each becomes one image.
  maxImages: 25,
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
  'pass_unconfirmed',
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
  // The kind of document a rental row came from.
  readonly source?: SourceKind;
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

// What a review reads from documents: its fields, and its lists of rows by name.
export interface ExtractionShape<F extends string, L extends string> {
  readonly review: ReviewKind;
  readonly fields: readonly F[];
  readonly lists: readonly L[];
}

// The final pay's rows are the other jobs of «Otros trabajos», from the work history.
export const FINAL_PAY_EXTRACTION: ExtractionShape<ExtractedFieldName, 'contracts'> = {
  review: 'final_pay',
  fields: EXTRACTED_FIELDS,
  lists: ['contracts'],
};

// The fields the API merges from rental documents (api/src/domain/rental-merge.ts). The deposit
// is the only one two kinds of document state: the contract's comes first.
export const RENTAL_FIELDS = [
  'signedOn',
  'startDate',
  'postcode',
  'landlordType',
  'landlordCompanyName',
  'agencyNamed',
  'use',
  'agreedMonths',
  'initialRent',
  'updateClauseText',
  'updateClauseIndex',
  'updateFixedPercent',
  'deposit',
  'advanceMonths',
  'necessityClause',
  'feesText',
  'chargesClauseText',
  'keysReturnedOn',
  'closingDocumentSigned',
] as const;
export type RentalFieldName = (typeof RENTAL_FIELDS)[number];

// Their lists, each row with the kind of document it came from (api/src/domain/rental-schema.ts).
export const RENTAL_LISTS = [
  'guarantees',
  'charges',
  'utilities',
  'notices',
  'receipts',
  'invoices',
  'returns',
  'deductions',
] as const;
export type RentalListName = (typeof RENTAL_LISTS)[number];

export const RENTAL_EXTRACTION: ExtractionShape<RentalFieldName, RentalListName> = {
  review: 'rental',
  fields: RENTAL_FIELDS,
  lists: RENTAL_LISTS,
};

export type RentalExtraction = Extraction<RentalFieldName, RentalListName>;

// The fields the API merges from employment documents (api/src/domain/employment-merge.ts): the
// contract's, the agreement and category a payslip may state too, and the offer's, prefixed.
export const EMPLOYMENT_FIELDS = [
  'employerType',
  'companyName',
  'companyTaxId',
  'workplaceRegion',
  'signedOn',
  'startDate',
  'endDate',
  'durationMonths',
  'modalityText',
  'modality',
  'partTime',
  'causeText',
  'replacedPersonNamed',
  'replacementCauseStated',
  'category',
  'agreementName',
  'agreementCode',
  'salaryAmount',
  'salaryPeriod',
  'annualSalaryAmount',
  'payments',
  'prorated',
  'inKindAmount',
  'weeklyHours',
  'annualHours',
  'scheduleText',
  'shifts',
  'night',
  'complementaryPercent',
  'complementaryNoticeDays',
  'overtimeAgreed',
  'overtimeHoursPerYear',
  'holidayDays',
  'holidayUnit',
  'trialAmount',
  'trialUnit',
  'remoteShare',
  'trainingType',
  'studiesEndedOn',
  'planAttached',
  'effectiveWorkPercent',
  'offerPosition',
  'offerSalaryAmount',
  'offerSalaryPeriod',
  'offerNet',
  'offerVariable',
  'offerWeeklyHours',
  'offerModality',
  'offerRemote',
  'offerPublishedOn',
] as const;
export type EmploymentFieldName = (typeof EMPLOYMENT_FIELDS)[number];

// Their lists (api/src/domain/employment-schema.ts). Past its maximum a list keeps its most recent
// rows, and the response says one was cut.
export const EMPLOYMENT_LIST_MAXIMA = {
  salaryParts: 12,
  clauses: 10,
  information: 17,
  relationshipHints: 3,
  payslips: 6,
  lines: 60,
  contracts: 15,
} as const;
export type EmploymentListName = keyof typeof EMPLOYMENT_LIST_MAXIMA;
export const EMPLOYMENT_LISTS = Object.keys(EMPLOYMENT_LIST_MAXIMA) as EmploymentListName[];

export const EMPLOYMENT_EXTRACTION: ExtractionShape<EmploymentFieldName, EmploymentListName> = {
  review: 'employment',
  fields: EMPLOYMENT_FIELDS,
  lists: EMPLOYMENT_LISTS,
};

export type EmploymentExtraction = Extraction<EmploymentFieldName, EmploymentListName>;

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
export interface Conflict<F extends string = ExtractedFieldName> {
  readonly field: F;
  readonly sources: readonly SourceKind[];
}

// A page as the API classified it, numbered from 1 in the order sent.
export interface ReadPage {
  readonly page: number;
  readonly kind: PageKind;
  readonly readability: Readability;
}

// Each of the review's lists sits beside the fields under its own name.
export type Extraction<F extends string = ExtractedFieldName, L extends string = 'contracts'> = {
  readonly pages: readonly ReadPage[];
  readonly documents: readonly RecognisedDocument[];
  readonly fields: Readonly<Partial<Record<F, SourcedField>>>;
  readonly conflicts: readonly Conflict<F>[];
  // Some list reached its maximum, so the documents may hold rows beyond it (employment only).
  readonly truncated?: true;
} & { readonly [List in L]: readonly ExtractedRow[] };

export const COHERENCE_CHECKS = [
  'end_before_start',
  'items_do_not_sum',
  'period_end_before_start',
  'start_after_period_end',
  'proration_exceeds_total',
  'contract_end_before_start',
] as const;
export type CoherenceCheck = (typeof COHERENCE_CHECKS)[number];

// What the API finds incoherent in rental documents (api/src/domain/rental-checks.ts).
export const RENTAL_CHECKS = [
  'return_before_keys',
  'receipt_parts_do_not_sum',
  'invoice_total_mismatch',
  'notice_rent_mismatch',
  'start_long_before_signing',
] as const;
export type RentalCheck = (typeof RENTAL_CHECKS)[number];

// What the API finds incoherent in employment documents (api/src/domain/employment-checks.ts).
// `end_before_start` shares its name with the final pay's check, but the reading words it.
export const EMPLOYMENT_CHECKS = [
  'end_before_start',
  'payslip_not_whole_month',
  'payslip_lines_do_not_sum',
  'hours_over_week',
  'salary_period_mismatch',
] as const;
export type EmploymentCheck = (typeof EMPLOYMENT_CHECKS)[number];

// The final pay's checks are worded by the upload; any other review's, by its own reading.
export type FailedCheck = CoherenceCheck | RentalCheck | EmploymentCheck;
export const isCoherenceCheck = (c: FailedCheck): c is CoherenceCheck =>
  (COHERENCE_CHECKS as readonly string[]).includes(c);

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

// A read that found nothing to fill the form with; it spent no read.
export type NothingRead = {
  readonly ok: false;
  readonly code: 'nothing_read';
  readonly pages: readonly ReadPage[];
};

export type ExtractResult<F extends string = ExtractedFieldName, L extends string = 'contracts'> =
  | {
      readonly ok: true;
      readonly extraction: Extraction<F, L>;
      readonly failedChecks: readonly FailedCheck[];
      // A free read returns the quota token to send next time; a pass read, the reads it has left.
      readonly allowance: string | null;
      readonly readsLeft: number | null;
      // Whether the reading was repeated with the stronger model; null when the API doesn't say.
      readonly escalated: boolean | null;
    }
  | NothingRead
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

export type VerifyResult =
  { readonly ok: true; readonly expiresAt: number; readonly readsLeft: number } | Failure;

// The pass is one for every review: bought, issued and checked the same way.
export interface PassApi {
  // The captcha token comes from a Turnstile widget with the action «checkout».
  checkout(nonce: string, captchaToken: string): Promise<CheckoutResult>;
  pass(sessionId: string, nonce: string): Promise<PassResult>;
  // Whether a pass the browser holds still unlocks the detail, the report and the letter.
  verify(pass: string): Promise<VerifyResult>;
}

// The API as one review's page uses it: reading reads that review's documents.
export interface Api<
  F extends string = ExtractedFieldName,
  L extends string = 'contracts',
> extends PassApi {
  extract(request: ExtractRequest): Promise<ExtractResult<F, L>>;
}

// Shapes the API checks too (src/domain/payments.ts there).
export const NONCE = /^[A-Za-z0-9_-]{22,64}$/;
export const SESSION_ID = /^cs_(test|live)_[A-Za-z0-9]{1,250}$/;
