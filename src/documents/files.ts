import { LIMITS, type ErrorCode } from './contract';

export interface Selected {
  readonly type: string;
  readonly size: number;
}

const isPdf = (f: Selected) => f.type === 'application/pdf';
// Any photo the browser can decode is re-encoded to JPEG before it leaves, so HEIC or PNG work too.
const isImage = (f: Selected) => f.type.startsWith('image/');

export const MAX_PDF_BYTES = LIMITS.maxPdfBytes;

// The checks the API makes that the browser can make first, so a bad choice costs no request.
export function checkSelection(files: readonly Selected[]): ErrorCode | null {
  if (files.length === 0) return 'no_files';
  if (!files.every((f) => isPdf(f) || isImage(f))) return 'file_type';
  const pdfs = files.filter(isPdf).length;
  if (pdfs > 0 && pdfs !== files.length) return 'mixed_files';
  if (pdfs > LIMITS.maxPdfFiles || files.length > LIMITS.maxImages) return 'too_many_files';
  if (pdfs === 1 && (files[0]?.size ?? 0) > MAX_PDF_BYTES) return 'pdf_too_large';
  return null;
}

export const mediaOf = (files: readonly Selected[]): 'image' | 'pdf' =>
  files.some(isPdf) ? 'pdf' : 'image';

// The size that keeps the proportions with the long side at most `max`, never enlarged.
export function fitWithin(width: number, height: number, max = LIMITS.maxImageLongSide) {
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

// The JSON body's size, near enough: base64 data plus a margin for the rest of the request.
export const requestBytes = (files: readonly { data: string }[]) =>
  files.reduce((sum, f) => sum + f.data.length + 64, 4096);

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk)
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}
