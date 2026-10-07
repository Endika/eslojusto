import { imageDimensions } from './image-dimensions';
import type { ErrorCode } from './results';

export const DOCUMENT_KINDS = ['settlement', 'payslip', 'work_history'] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const MEDIA_TYPES = ['image/jpeg', 'image/webp', 'application/pdf'] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

export interface DocumentFile {
  readonly mediaType: MediaType;
  readonly bytes: Uint8Array;
}

export const LIMITS = {
  maxImages: 4,
  maxPdfFiles: 1,
  maxPdfPages: 4,
  // Claude downsizes anything larger, so more pixels only cost bandwidth.
  maxImageLongSide: 1568,
  // Lambda's synchronous invocation payload limit.
  maxPayloadBytes: 6 * 1024 * 1024,
} as const;

const startsWith = (bytes: Uint8Array, prefix: readonly number[]): boolean =>
  prefix.every((b, i) => bytes[i] === b);

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-

// Checks that need no parsing beyond headers; the PDF page count is checked by a PdfInspector.
export function checkFiles(files: readonly DocumentFile[]): ErrorCode | null {
  if (files.length === 0) return 'no_files';
  const pdfs = files.filter((f) => f.mediaType === 'application/pdf');
  if (pdfs.length > 0 && pdfs.length !== files.length) return 'mixed_files';
  if (pdfs.length > LIMITS.maxPdfFiles || files.length > LIMITS.maxImages) return 'too_many_files';
  for (const file of files) {
    if (file.mediaType === 'application/pdf') {
      if (!startsWith(file.bytes, PDF_MAGIC)) return 'pdf_unreadable';
      continue;
    }
    const size = imageDimensions(file.bytes);
    if (size === null || size.format !== file.mediaType) return 'image_unreadable';
    if (Math.max(size.width, size.height) > LIMITS.maxImageLongSide) return 'image_too_large';
  }
  return null;
}
