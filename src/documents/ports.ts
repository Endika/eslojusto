import type { FormEntries } from '../calculator/fill';
import type { CivilDate } from '../engine/date';
import type { Translate } from '../i18n/client';
import type {
  Confidence,
  ErrorCode,
  Extraction,
  MediaType,
  PageKind,
  SkipReason,
} from './contract';
import type { filesBucket } from './files';
import type { LetterDetails, LetterField, LetterKind, LetterPrefilled } from './letter';
import type { QualityProblem, QualitySignals } from './quality';

export { ERROR_CODES, PAGE_KINDS, SKIP_REASONS } from './contract';
export { QUALITY_PROBLEMS } from './quality';
export { LETTER_KINDS, LETTER_PREFILLED } from './letter';
export type { ErrorCode, PageKind, SkipReason } from './contract';
export type { QualityProblem } from './quality';

export type FilesBucket = ReturnType<typeof filesBucket>;
export const FILES_BUCKETS = [
  '1',
  '2-4',
  '5-9',
  '10-15',
  '16-25',
] as const satisfies readonly FilesBucket[];

export const PASS_VIA = ['return', 'recovery'] as const;
export type PassVia = (typeof PASS_VIA)[number];
export const DOWNLOADS = ['report', 'letter'] as const;
// What the API said of the pass this browser holds; `unavailable` when it could not say.
export const PASS_VERIFY_RESULTS = ['ok', 'invalid', 'expired', 'revoked', 'unavailable'] as const;
export type PassVerifyResult = (typeof PASS_VERIFY_RESULTS)[number];
export type Download = (typeof DOWNLOADS)[number];

// What happens around documents and the pass, for whoever listens. Never a value from a document.
export interface DocumentEvents {
  startChosen(path: 'upload' | 'manual'): void;
  uploadStarted(files: FilesBucket, pdfs: number): void;
  extractionCompleted(result: {
    // The kinds of document recognised, each once.
    readonly kinds: readonly PageKind[];
    readonly fields: number;
    readonly lowConfidence: boolean;
    readonly failedChecks: boolean;
    readonly conflicts: boolean;
    readonly escalated: boolean | null;
    // Why pages were set aside, each reason once.
    readonly skippedReasons: readonly SkipReason[];
  }): void;
  extractionFailed(code: ErrorCode): void;
  // A read that found nothing: why, each reason once, never which page said what.
  nothingRead(reasons: readonly SkipReason[], files: FilesBucket, pdfs: number): void;
  // Before sending, a photo looked dark, blurry or small; then whether it was sent all the same.
  qualityWarned(problem: QualityProblem): void;
  qualityOverridden(): void;
  checkoutStarted(): void;
  passIssued(via: PassVia): void;
  passFailed(code: ErrorCode): void;
  passVerified(result: PassVerifyResult): void;
  // For the letter, how many of its optional fields were filled; never what they say.
  downloaded(document: Download, letterPrefilled?: LetterPrefilled, letterKind?: LetterKind): void;
}

// localStorage or sessionStorage; a store that throws or is missing behaves as empty.
export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export interface Captcha {
  // A fresh, single-use token; rejects when the challenge can't be completed.
  token(): Promise<string>;
}

// The Turnstile action each operation's token is checked against.
export type CaptchaAction = 'extract' | 'checkout';

export interface EncodedFile {
  readonly mediaType: MediaType;
  readonly data: string;
  readonly bytes: number;
  // A photo's, measured on the canvas it was drawn on; a PDF page has none.
  readonly quality?: QualitySignals;
}

export interface FileEncoder {
  // A photo comes back downsized and re-encoded, at the quality that keeps it within `maxBytes`
  // if any does. Rejects on an unreadable image.
  encode(file: File, maxBytes: number): Promise<EncodedFile>;
}

// An opened PDF: how many pages it has, and each page as an image like a photo's.
export interface OpenedPdf {
  readonly pages: number;
  // `page` counts from 1. Rejects when the page can't be drawn; gives up on one that takes too
  // long, as a heavy scan or a crafted file can.
  render(page: number, maxBytes: number): Promise<EncodedFile | 'pdf_too_slow'>;
  // Frees what the reader holds for the document; its pages can't be drawn afterwards.
  close(): void;
}

export type PdfProblem = 'pdf_unreadable' | 'pdf_encrypted' | 'pdf_too_slow';

// PDFs are drawn in the browser, page by page, so the API only ever reads images.
export interface PdfPages {
  open(file: File): Promise<OpenedPdf | PdfProblem>;
}

// What a PDF says, block by block, before any layout: a report or a letter is built from the
// review the person confirmed and the page's dictionary, never from anything else.
export type Block =
  | { readonly type: 'title'; readonly text: string }
  | { readonly type: 'meta'; readonly text: string }
  | { readonly type: 'heading'; readonly text: string }
  | { readonly type: 'subheading'; readonly text: string }
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'note'; readonly text: string }
  | { readonly type: 'row'; readonly label: string; readonly value: string }
  | { readonly type: 'bullet'; readonly text: string }
  | { readonly type: 'source'; readonly text: string; readonly url: string }
  // A line to write on, with the value already on it when the person gave one.
  | { readonly type: 'blank'; readonly label: string; readonly value?: string }
  | { readonly type: 'rule' };

export interface DocumentModel {
  readonly title: string;
  readonly footer: string | null;
  readonly blocks: readonly Block[];
}

export interface PdfMaker {
  render(model: DocumentModel): Promise<Blob>;
  // The fields with a character the letter's fonts can't draw.
  unprintable(details: Record<LetterField, string>): LetterField[];
}

// A completed review as the pass sees it, whichever section made it: whether the pass is offered,
// and the report and letters it unlocks.
export interface PaidReview {
  readonly offer: boolean;
  // The letters this review can download; the first is the one a plain letter button gives.
  readonly letterKinds: readonly [LetterKind, ...LetterKind[]];
  report(tr: Translate, today: CivilDate): DocumentModel;
  letter(kind: LetterKind, details: LetterDetails, tr: Translate): DocumentModel;
}

// A review's form as reading and the pass drive it: set or read its answers, and open or review it.
export interface ReviewForm {
  readonly form: HTMLFormElement;
  // Sets the answers and returns the names it could not set.
  fill(entries: FormEntries): string[];
  entries(): FormEntries;
  // Shows the first sheet, as if the visit started there.
  open(): void;
  // Reviews the answers as the «Revisar» button does; false when a sheet still needs an answer.
  review(): boolean;
  // Shows the last review again, locked or with its detail as the pass now says.
  refreshResult(): void;
}

// Where a value read lands in the form, to mark it as read and how surely.
export interface ReadMark {
  readonly id: string;
  // A selector, within the form, for the element that holds the answer.
  readonly container: string;
  readonly confidence: Confidence;
  // Worked out from what was read rather than read as such.
  readonly derived?: true;
}

export interface ReadPrefill {
  readonly entries: FormEntries;
  readonly marks: readonly ReadMark[];
  // How many answers the read gave.
  readonly count: number;
  readonly lowConfidence: boolean;
  // What the summary adds about this read, after the pages it set aside.
  readonly notes: readonly string[];
}

// How a section turns what the API read into answers for its form.
export interface DocumentReading<F extends string, L extends string> {
  // `answers` are the form's current ones, by name.
  prefill(extraction: Extraction<F, L>, answers: Readonly<Record<string, string>>): ReadPrefill;
}

export interface Browser {
  // Epoch milliseconds.
  now(): number;
  redirect(url: string): void;
  save(blob: Blob, filename: string): void;
  randomBytes(count: number): Uint8Array;
  // Asks the browser to warn before the page is left, or stops asking.
  warnBeforeLeaving(on: boolean): void;
}
