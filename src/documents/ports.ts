import type { CompletedReview } from '../calculator/ports';
import type { DocumentKind, ErrorCode, MediaType } from './contract';

export { DOCUMENT_KINDS, ERROR_CODES } from './contract';
export type { DocumentKind, ErrorCode } from './contract';

export const PASS_VIA = ['return', 'recovery'] as const;
export type PassVia = (typeof PASS_VIA)[number];
export const DOWNLOADS = ['report', 'letter'] as const;
export type Download = (typeof DOWNLOADS)[number];

// What happens around documents and the pass, for whoever listens. Never a value from a document.
export interface DocumentEvents {
  startChosen(path: 'upload' | 'manual'): void;
  uploadStarted(kind: DocumentKind, files: number, media: 'image' | 'pdf'): void;
  extractionCompleted(
    kind: DocumentKind,
    fields: number,
    lowConfidence: boolean,
    failedChecks: boolean,
  ): void;
  extractionFailed(kind: DocumentKind, code: ErrorCode): void;
  checkoutStarted(): void;
  passIssued(via: PassVia): void;
  passFailed(code: ErrorCode): void;
  downloaded(document: Download): void;
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

export interface EncodedFile {
  readonly mediaType: MediaType;
  readonly data: string;
  readonly bytes: number;
}

export interface FileEncoder {
  // A photo comes back downsized and re-encoded; a PDF as it is. Rejects on an unreadable image.
  encode(file: File): Promise<EncodedFile>;
}

export interface PdfMaker {
  report(review: CompletedReview): Promise<Blob>;
  letter(review: CompletedReview): Promise<Blob>;
}

export interface Browser {
  // Epoch milliseconds.
  now(): number;
  redirect(url: string): void;
  save(blob: Blob, filename: string): void;
  randomBytes(count: number): Uint8Array;
}
