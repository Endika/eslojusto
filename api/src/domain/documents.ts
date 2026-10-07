import { imageDimensions, type ImageSize } from './image-dimensions';
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
  // Digital payslips weigh tens of kilobytes; a heavier PDF is a scan, which the browser
  // rasterizes into images instead.
  maxPdfBytes: 2 * 1024 * 1024,
  // Claude downsizes anything larger, so more pixels only cost bandwidth.
  maxImageLongSide: 1568,
  // Lambda's synchronous invocation payload limit.
  maxPayloadBytes: 6 * 1024 * 1024,
} as const;

const startsWith = (bytes: Uint8Array, prefix: readonly number[]): boolean =>
  prefix.every((b, i) => bytes[i] === b);

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];

function hasMagic(file: DocumentFile): boolean {
  if (file.mediaType === 'application/pdf') return startsWith(file.bytes, PDF_MAGIC);
  if (file.mediaType === 'image/jpeg') return startsWith(file.bytes, JPEG_MAGIC);
  return startsWith(file.bytes, RIFF) && startsWith(file.bytes.subarray(8), WEBP);
}

// Counts, sizes and magic bytes only: cheap enough to run before the captcha.
export function checkFileShapes(files: readonly DocumentFile[]): ErrorCode | null {
  if (files.length === 0) return 'no_files';
  const pdfs = files.filter((f) => f.mediaType === 'application/pdf');
  if (pdfs.length > 0 && pdfs.length !== files.length) return 'mixed_files';
  if (pdfs.length > LIMITS.maxPdfFiles || files.length > LIMITS.maxImages) return 'too_many_files';
  for (const file of files) {
    if (!hasMagic(file))
      return file.mediaType === 'application/pdf' ? 'pdf_unreadable' : 'image_unreadable';
    if (file.mediaType === 'application/pdf' && file.bytes.length > LIMITS.maxPdfBytes)
      return 'pdf_too_large';
  }
  return null;
}

// Parses image headers; runs only after the captcha.
export function imageSizes(files: readonly DocumentFile[]): readonly ImageSize[] | ErrorCode {
  const sizes: ImageSize[] = [];
  for (const file of files) {
    if (file.mediaType === 'application/pdf') continue;
    const size = imageDimensions(file.bytes);
    if (size === null || size.format !== file.mediaType) return 'image_unreadable';
    if (Math.max(size.width, size.height) > LIMITS.maxImageLongSide) return 'image_too_large';
    sizes.push(size);
  }
  return sizes;
}
