import { describe, expect, it } from 'vitest';
import { checkFiles, LIMITS, type DocumentFile } from '../src/domain/documents';
import { jpeg, webpLossy } from './support/synthetic';

const img = (w = 1000, h = 1400): DocumentFile => ({ mediaType: 'image/jpeg', bytes: jpeg(w, h) });
const pdf: DocumentFile = {
  mediaType: 'application/pdf',
  bytes: new TextEncoder().encode('%PDF-1.7\n'),
};

describe('checkFiles', () => {
  it('accepts up to four images within the size limit', () => {
    expect(checkFiles([img(), img(1568, 1568), img(), img()])).toBeNull();
  });

  it('accepts one PDF', () => {
    expect(checkFiles([pdf])).toBeNull();
  });

  it.each([
    ['no files', [], 'no_files'],
    ['five images', [img(), img(), img(), img(), img()], 'too_many_files'],
    ['two PDFs', [pdf, pdf], 'too_many_files'],
    ['a PDF with an image', [pdf, img()], 'mixed_files'],
    ['an image one pixel too long', [img(LIMITS.maxImageLongSide + 1, 800)], 'image_too_large'],
    ['a tall image over the limit', [img(800, 1569)], 'image_too_large'],
    [
      'WebP bytes labelled JPEG',
      [{ mediaType: 'image/jpeg', bytes: webpLossy(800, 600) }],
      'image_unreadable',
    ],
    [
      'bytes that are no image',
      [{ mediaType: 'image/webp', bytes: new TextEncoder().encode('hello') }],
      'image_unreadable',
    ],
    [
      'a "PDF" without the PDF header',
      [{ mediaType: 'application/pdf', bytes: new TextEncoder().encode('<html>') }],
      'pdf_unreadable',
    ],
  ] as const)('rejects %s', (_, files, code) => {
    expect(checkFiles(files as readonly DocumentFile[])).toBe(code);
  });
});
