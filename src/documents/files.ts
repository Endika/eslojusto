import { LIMITS, type ErrorCode } from './contract';

export interface Selected {
  readonly type: string;
  readonly size: number;
  readonly name?: string;
  readonly lastModified?: number;
}

// The same file chosen twice: same name, size and modification time.
const sameFile = (a: Selected, b: Selected) =>
  a.name !== undefined &&
  a.name === b.name &&
  a.size === b.size &&
  a.lastModified === b.lastModified;

export const isPdf = (f: Selected) => f.type === 'application/pdf';
// Any photo the browser can decode is re-encoded to JPEG before it leaves, so HEIC or PNG work too.
const isImage = (f: Selected) => f.type.startsWith('image/');

export const MAX_PDF_BYTES = LIMITS.maxPdfBytes;

export interface Admission<T> {
  // Photos to add, and PDFs to open; a PDF then takes as many of the free places as its pages.
  readonly photos: readonly T[];
  readonly pdfs: readonly T[];
  // How many of the incoming files were left out, and why the first of them was.
  readonly refused: number;
  readonly problem: ErrorCode | null;
  // Files already in the list, left out without counting as refused.
  readonly duplicates: readonly T[];
}

// Which newly picked files join the list, in turn: a photo while there is a free place, a PDF
// under its size limit while there is one for its first page. The rest are left out, never
// silently.
export function admit<T extends Selected>(
  current: readonly Selected[],
  free: number,
  incoming: readonly T[],
): Admission<T> {
  const photos: T[] = [];
  const pdfs: T[] = [];
  const duplicates: T[] = [];
  let places = free;
  let problem: ErrorCode | null = null;
  for (const file of incoming) {
    if ([...current, ...photos, ...pdfs].some((f) => sameFile(f, file))) {
      duplicates.push(file);
      continue;
    }
    const why: ErrorCode | null =
      !isPdf(file) && !isImage(file)
        ? 'file_type'
        : isPdf(file) && file.size > MAX_PDF_BYTES
          ? 'pdf_too_large'
          : places <= 0
            ? 'too_many_files'
            : null;
    if (why !== null) {
      problem ??= why;
      continue;
    }
    (isPdf(file) ? pdfs : photos).push(file);
    places -= 1;
  }
  return {
    photos,
    pdfs,
    refused: incoming.length - photos.length - pdfs.length - duplicates.length,
    problem,
    duplicates,
  };
}

// What the browser checks before sending: something to read, and no more than the API takes.
export function checkSelection(images: number): ErrorCode | null {
  if (images === 0) return 'no_files';
  return images > LIMITS.maxImages ? 'too_many_files' : null;
}

// A closed bucket for analytics: never the exact count.
export function filesBucket(n: number): '1' | '2-4' | '5-9' | '10-15' | '16-25' {
  return n <= 1 ? '1' : n <= 4 ? '2-4' : n <= 9 ? '5-9' : n <= 15 ? '10-15' : '16-25';
}

// The size that keeps the proportions with the long side at most `max`, never enlarged.
export function fitWithin(width: number, height: number, max: number = LIMITS.maxImageLongSide) {
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

// Tried in turn until an image fits its share of the request (api/README.md, «Payload budget»):
// every quality at the full size first, and only then a shorter long side, which a pack of up to
// about fifteen pages never needs and a larger one of noisy photos may.
export const JPEG_QUALITIES = [0.85, 0.75, 0.65, 0.5] as const;
export const LONG_SIDES = [LIMITS.maxImageLongSide, 1280, 1100] as const;

// The sizes an image of `width` × `height` is encoded at in turn, each once: one that is already
// short is never enlarged, so it may have a single size.
export function encodingSizes(width: number, height: number) {
  const sizes: { width: number; height: number }[] = [];
  for (const side of LONG_SIDES) {
    const size = fitWithin(width, height, side);
    const last = sizes.at(-1);
    if (last?.width !== size.width || last.height !== size.height) sizes.push(size);
  }
  return sizes;
}

// The size that brings the long side to exactly `max`: a PDF page is drawn, not resampled, so
// it is rendered at the size a photo is sent at.
export function fitExactly(width: number, height: number, max = LIMITS.maxImageLongSide) {
  const scale = max / Math.max(width, height);
  return {
    width: Math.max(1, Math.min(max, Math.round(width * scale))),
    height: Math.max(1, Math.min(max, Math.round(height * scale))),
    scale,
  };
}

const REQUEST_OVERHEAD = 4096;
const FILE_OVERHEAD = 64;

// The JSON body's size, near enough: base64 data plus a margin for the rest of the request.
export const requestBytes = (files: readonly { data: string }[]) =>
  files.reduce((sum, f) => sum + f.data.length + FILE_OVERHEAD, REQUEST_OVERHEAD);

// What a file adds to the request once in base64.
export const encodedSize = (bytes: number) => Math.ceil(bytes / 3) * 4 + FILE_OVERHEAD;

// The bytes the next image may weigh once encoded: what the budget has left after `usedBytes`,
// shared equally among the images still to encode.
export function photoShare(usedBytes: number, photosLeft: number): number {
  const left = LIMITS.requestBudgetBytes - usedBytes - photosLeft * FILE_OVERHEAD;
  return Math.max(0, Math.floor(left / Math.max(1, photosLeft) / 4) * 3);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk)
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}
