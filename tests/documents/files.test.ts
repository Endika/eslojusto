import { describe, expect, it } from 'vitest';
import { LIMITS } from '../../src/documents/contract';
import {
  MAX_PDF_BYTES,
  admit,
  bytesToBase64,
  checkSelection,
  encodedSize,
  encodingSizes,
  filesBucket,
  fitExactly,
  fitWithin,
  photoShare,
  requestBytes,
} from '../../src/documents/files';

const jpeg = { type: 'image/jpeg', size: 3_000_000 };
const heic = { type: 'image/heic', size: 2_000_000 };
const pdf = { type: 'application/pdf', size: 500_000 };

const photos = (n: number) => Array.from({ length: n }, () => jpeg);

describe('checkSelection', () => {
  it('wants between one and twenty-five images', () => {
    expect(checkSelection(0)).toBe('no_files');
    expect(checkSelection(1)).toBeNull();
    expect(checkSelection(25)).toBeNull();
    expect(checkSelection(26)).toBe('too_many_files');
  });
});

describe('admit', () => {
  it('takes photos of any decodable kind and PDFs to open, while places are free', () => {
    expect(admit(photos(3), 12, [jpeg, heic, pdf])).toEqual({
      photos: [jpeg, heic],
      pdfs: [pdf],
      refused: 0,
      problem: null,
      duplicates: [],
    });
  });
  it('stops when no place is left and says how many were left out', () => {
    expect(admit(photos(13), 2, photos(4))).toEqual({
      photos: photos(2),
      pdfs: [],
      refused: 2,
      problem: 'too_many_files',
      duplicates: [],
    });
  });
  it('leaves out what is no photo or PDF, and a PDF too heavy to open, with the first reason', () => {
    const text = { type: 'text/plain', size: 10 };
    const heavy = { ...pdf, size: MAX_PDF_BYTES + 1 };
    expect(admit([], 15, [text, jpeg, heavy])).toEqual({
      photos: [jpeg],
      pdfs: [],
      refused: 2,
      problem: 'file_type',
      duplicates: [],
    });
  });
});

describe('admit, with the same file twice', () => {
  const file = (name: string, lastModified = 1) => ({ ...jpeg, name, lastModified });
  it('leaves out a file already in the list, or picked twice at once, without refusing it', () => {
    expect(admit([file('a.jpg')], 14, [file('a.jpg'), file('b.jpg'), file('b.jpg')])).toEqual({
      photos: [file('b.jpg')],
      pdfs: [],
      refused: 0,
      problem: null,
      duplicates: [file('a.jpg'), file('b.jpg')],
    });
  });
  it('tells apart two files of one name that differ in time or size', () => {
    expect(admit([file('a.jpg')], 14, [file('a.jpg', 2)]).photos).toEqual([file('a.jpg', 2)]);
  });
});

describe('filesBucket', () => {
  it.each([
    [1, '1'],
    [2, '2-4'],
    [4, '2-4'],
    [5, '5-9'],
    [10, '10-15'],
    [15, '10-15'],
    [16, '16-25'],
    [25, '16-25'],
  ])('puts %i files in %s', (n, bucket) => {
    expect(filesBucket(n)).toBe(bucket);
  });
});

describe('fitExactly', () => {
  it('draws a PDF page with its long side at 1568 px, enlarging if need be', () => {
    expect(fitExactly(595, 842)).toEqual({ width: 1108, height: 1568, scale: 1568 / 842 });
    expect(fitExactly(842, 595).width).toBe(1568);
  });
});

describe('fitWithin', () => {
  it('scales the long side down to 1568 px, keeping the proportions', () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 1568, height: 1176 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 1176, height: 1568 });
  });
  it('never enlarges', () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
});

describe('encodingSizes', () => {
  it('tries the full size first, then 1280 and 1100 px on the long side', () => {
    expect(encodingSizes(1176, 1568)).toEqual([
      { width: 1176, height: 1568 },
      { width: 960, height: 1280 },
      { width: 825, height: 1100 },
    ]);
  });
  it('tries each size once and never enlarges a small image', () => {
    expect(encodingSizes(1200, 900)).toEqual([
      { width: 1200, height: 900 },
      { width: 1100, height: 825 },
    ]);
    expect(encodingSizes(800, 600)).toEqual([{ width: 800, height: 600 }]);
  });
});

describe('the request size', () => {
  it('keeps the browser’s budget under the API’s limit', () => {
    expect(LIMITS.requestBudgetBytes).toBeLessThan(LIMITS.maxPayloadBytes);
  });
  it('shares what the budget has left among the photos still to encode', () => {
    const share = photoShare(4096, 15);
    expect(share).toBeGreaterThan(260_000);
    expect(4096 + 15 * encodedSize(share)).toBeLessThanOrEqual(LIMITS.requestBudgetBytes);
    const full = photoShare(4096, LIMITS.maxImages);
    expect(full).toBeGreaterThan(170_000);
    expect(4096 + LIMITS.maxImages * encodedSize(full)).toBeLessThanOrEqual(
      LIMITS.requestBudgetBytes,
    );
    expect(photoShare(LIMITS.requestBudgetBytes, 1)).toBe(0);
  });
  it('adds up the encoded files', () => {
    expect(requestBytes([{ data: 'a'.repeat(100) }])).toBe(4096 + 164);
  });
  it('encodes bytes as base64', () => {
    expect(bytesToBase64(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBe('JVBERg==');
    const big = new Uint8Array(100_000).fill(65);
    expect(atob(bytesToBase64(big))).toHaveLength(100_000);
  });
});
