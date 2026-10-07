import type { CompletedReview } from '../calculator/ports';
import type { ErrorCode, MediaType, PageKind } from './contract';
import type { filesBucket } from './files';
import type { LetterDetails, LetterPrefilled } from './letter';

export { ERROR_CODES, PAGE_KINDS } from './contract';
export { LETTER_PREFILLED } from './letter';
export type { ErrorCode, PageKind } from './contract';

export type FilesBucket = ReturnType<typeof filesBucket>;
export const FILES_BUCKETS = ['1', '2-4', '5-9', '10-15'] as const satisfies readonly FilesBucket[];

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
  }): void;
  extractionFailed(code: ErrorCode): void;
  checkoutStarted(): void;
  passIssued(via: PassVia): void;
  passFailed(code: ErrorCode): void;
  passVerified(result: PassVerifyResult): void;
  // For the letter, how many of its optional fields were filled; never what they say.
  downloaded(document: Download, letterPrefilled?: LetterPrefilled): void;
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

export interface PdfMaker {
  report(review: CompletedReview): Promise<Blob>;
  letter(review: CompletedReview, details: LetterDetails): Promise<Blob>;
}

export interface Browser {
  // Epoch milliseconds.
  now(): number;
  redirect(url: string): void;
  save(blob: Blob, filename: string): void;
  randomBytes(count: number): Uint8Array;
}
