import { describe, expect, it } from 'vitest';
import { imageDimensions } from '../src/domain/image-dimensions';
import { jpeg, webpExtended, webpLossless, webpLossy } from './support/synthetic';

describe('imageDimensions', () => {
  it('reads a JPEG frame size past other segments', () => {
    expect(imageDimensions(jpeg(1176, 1568, 'DOCUMENTO FICTICIO'))).toEqual({
      format: 'image/jpeg',
      width: 1176,
      height: 1568,
    });
  });

  it.each([
    ['lossy', webpLossy(1200, 900)],
    ['lossless', webpLossless(1200, 900)],
    ['extended', webpExtended(1200, 900)],
  ])('reads a %s WebP size', (_, bytes) => {
    expect(imageDimensions(bytes)).toEqual({ format: 'image/webp', width: 1200, height: 900 });
  });

  it.each([
    ['empty', new Uint8Array()],
    ['PNG', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    ['truncated JPEG', jpeg(800, 600).subarray(0, 30)],
    [
      'RIFF that is not WebP',
      new TextEncoder().encode('RIFF\x10\x00\x00\x00WAVEfmt                    '),
    ],
  ])('returns null for %s', (_, bytes) => {
    expect(imageDimensions(bytes)).toBeNull();
  });
});
