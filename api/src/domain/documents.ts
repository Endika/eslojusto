import { imageDimensions, type ImageSize } from './image-dimensions';
import { MAX_IMAGE_LONG_SIDE } from './image-limit';
import type { ErrorCode } from './results';

// What the model says each page is. `other` is a page with nothing the review uses, such as an
// IRPF withholding certificate.
export const FINAL_PAY_PAGE_KINDS = [
  'settlement_proposal',
  'payslip',
  'dismissal_letter',
  'company_certificate',
  'settlement_agreement',
  'work_history',
  'other',
] as const;
// A rental review's documents; `other` is a page with nothing it uses, such as a payslip.
export const RENTAL_PAGE_KINDS = [
  'lease',
  'rent_update_notice',
  'rent_receipt',
  'agency_invoice',
  'deposit_return',
  'other',
] as const;
// Every kind any review can give a page.
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
  'other',
] as const satisfies readonly (
  (typeof FINAL_PAY_PAGE_KINDS)[number] | (typeof RENTAL_PAGE_KINDS)[number]
)[];
export type PageKind = (typeof PAGE_KINDS)[number];
// The documents a value can come from.
export type SourceKind = Exclude<PageKind, 'other'>;

// Images only: the browser renders a PDF's pages to images, so what a read costs is set by
// pixels, which the API can measure exactly, and never by what a PDF might hide.
export const MEDIA_TYPES = ['image/jpeg', 'image/webp'] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

export interface DocumentFile {
  readonly mediaType: MediaType;
  readonly bytes: Uint8Array;
}

// One read takes a whole pack: up to 25 page images, of any kind of document, in any order. Above
// 20 images Claude takes none over 2000 px a side, which MAX_IMAGE_LONG_SIDE stays under.
export const LIMITS = {
  maxImages: 25,
  maxImageLongSide: MAX_IMAGE_LONG_SIDE,
  // Lambda's synchronous invocation payload limit.
  maxPayloadBytes: 6 * 1024 * 1024,
} as const;

const startsWith = (bytes: Uint8Array, prefix: readonly number[]): boolean =>
  prefix.every((b, i) => bytes[i] === b);

const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];

function hasMagic(file: DocumentFile): boolean {
  if (file.mediaType === 'image/jpeg') return startsWith(file.bytes, JPEG_MAGIC);
  return startsWith(file.bytes, RIFF) && startsWith(file.bytes.subarray(8), WEBP);
}

// Counts and magic bytes only: cheap enough to run before the captcha.
export function checkFileShapes(files: readonly DocumentFile[]): ErrorCode | null {
  if (files.length === 0) return 'no_files';
  if (files.length > LIMITS.maxImages) return 'too_many_files';
  return files.every(hasMagic) ? null : 'image_unreadable';
}

// Parses image headers; runs only after the captcha.
export function imageSizes(files: readonly DocumentFile[]): readonly ImageSize[] | ErrorCode {
  const sizes: ImageSize[] = [];
  for (const file of files) {
    const size = imageDimensions(file.bytes);
    if (size === null || size.format !== file.mediaType) return 'image_unreadable';
    if (Math.max(size.width, size.height) > LIMITS.maxImageLongSide) return 'image_too_large';
    sizes.push(size);
  }
  return sizes;
}
