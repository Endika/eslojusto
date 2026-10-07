import { describe, expect, it } from 'vitest';
import {
  MAX_PDF_BYTES,
  bytesToBase64,
  checkSelection,
  fitWithin,
  mediaOf,
  requestBytes,
} from '../../src/documents/files';

const jpeg = { type: 'image/jpeg', size: 3_000_000 };
const heic = { type: 'image/heic', size: 2_000_000 };
const pdf = { type: 'application/pdf', size: 500_000 };

describe('checkSelection', () => {
  it('accepts up to 4 photos of any decodable kind, or one PDF', () => {
    expect(checkSelection([jpeg])).toBeNull();
    expect(checkSelection([jpeg, heic, jpeg, jpeg])).toBeNull();
    expect(checkSelection([pdf])).toBeNull();
  });
  it('names what is wrong, as the API would', () => {
    expect(checkSelection([])).toBe('no_files');
    expect(checkSelection([jpeg, jpeg, jpeg, jpeg, jpeg])).toBe('too_many_files');
    expect(checkSelection([pdf, pdf])).toBe('too_many_files');
    expect(checkSelection([pdf, jpeg])).toBe('mixed_files');
    expect(checkSelection([{ type: 'text/plain', size: 10 }])).toBe('file_type');
    expect(checkSelection([{ ...pdf, size: MAX_PDF_BYTES + 1 }])).toBe('file_too_large');
  });
  it('tells photos from a PDF', () => {
    expect(mediaOf([jpeg])).toBe('image');
    expect(mediaOf([pdf])).toBe('pdf');
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

describe('the request size', () => {
  it('a PDF at the limit still fits in 6 MB once in base64', () => {
    expect(Math.ceil(MAX_PDF_BYTES / 3) * 4).toBeLessThan(6 * 1024 * 1024);
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
