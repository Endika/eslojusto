import { describe, expect, it } from 'vitest';
import { checkFileShapes, imageSizes, LIMITS, type DocumentFile } from '../src/domain/documents';
import { jpeg, webpLossy } from './support/synthetic';

const img = (w = 1000, h = 1400): DocumentFile => ({ mediaType: 'image/jpeg', bytes: jpeg(w, h) });

describe('checkFileShapes', () => {
  it('accepts up to twenty-five images', () => {
    expect(checkFileShapes(Array.from({ length: LIMITS.maxImages }, () => img()))).toBeNull();
  });

  it.each([
    ['no files', [], 'no_files'],
    ['twenty-six images', Array.from({ length: 26 }, () => img()), 'too_many_files'],
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
  ] as const)('rejects %s', (_, files, code) => {
    expect(checkFileShapes(files as readonly DocumentFile[])).toBe(code);
  });

  it('does not parse image headers', () => {
    expect(checkFileShapes([img(4000, 3000)])).toBeNull();
  });
});

describe('imageSizes', () => {
  it('returns the size of each image', () => {
    expect(imageSizes([img(1568, 1176)])).toEqual([
      { format: 'image/jpeg', width: 1568, height: 1176 },
    ]);
  });

  it.each([
    ['an image one pixel too long', img(LIMITS.maxImageLongSide + 1, 800), 'image_too_large'],
    ['a tall image over the limit', img(800, 1569), 'image_too_large'],
    [
      'a truncated JPEG',
      { mediaType: 'image/jpeg' as const, bytes: jpeg(800, 600).subarray(0, 24) },
      'image_unreadable',
    ],
  ])('rejects %s', (_, file, code) => {
    expect(imageSizes([file])).toBe(code);
  });
});
