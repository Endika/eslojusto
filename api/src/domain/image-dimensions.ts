export interface ImageSize {
  readonly format: 'image/jpeg' | 'image/webp';
  readonly width: number;
  readonly height: number;
}

const u16be = (b: Uint8Array, i: number): number => ((b[i] ?? 0) << 8) | (b[i + 1] ?? 0);
const u16le = (b: Uint8Array, i: number): number => (b[i] ?? 0) | ((b[i + 1] ?? 0) << 8);
const u24le = (b: Uint8Array, i: number): number => u16le(b, i) | ((b[i + 2] ?? 0) << 16);
const ascii = (b: Uint8Array, i: number, n: number): string =>
  String.fromCharCode(...b.subarray(i, i + n));

// SOF0..SOF15 carry the frame size; C4 (DHT), C8 (JPG) and CC (DAC) share the range but don't.
const isStartOfFrame = (marker: number): boolean =>
  marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

function jpegSize(b: Uint8Array): ImageSize | null {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1] ?? 0;
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      i += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null;
    const length = u16be(b, i + 2);
    if (length < 2) return null;
    if (isStartOfFrame(marker)) {
      const height = u16be(b, i + 5);
      const width = u16be(b, i + 7);
      return width > 0 && height > 0 ? { format: 'image/jpeg', width, height } : null;
    }
    i += 2 + length;
  }
  return null;
}

function webpSize(b: Uint8Array): ImageSize | null {
  if (b.length < 30 || ascii(b, 0, 4) !== 'RIFF' || ascii(b, 8, 4) !== 'WEBP') return null;
  const chunk = ascii(b, 12, 4);
  let width: number;
  let height: number;
  if (chunk === 'VP8 ') {
    width = u16le(b, 26) & 0x3fff;
    height = u16le(b, 28) & 0x3fff;
  } else if (chunk === 'VP8L') {
    if (b[20] !== 0x2f) return null;
    const bits = (b[21] ?? 0) | ((b[22] ?? 0) << 8) | ((b[23] ?? 0) << 16) | ((b[24] ?? 0) << 24);
    width = (bits & 0x3fff) + 1;
    height = ((bits >>> 14) & 0x3fff) + 1;
  } else if (chunk === 'VP8X') {
    width = u24le(b, 24) + 1;
    height = u24le(b, 27) + 1;
  } else {
    return null;
  }
  return width > 0 && height > 0 ? { format: 'image/webp', width, height } : null;
}

export function imageDimensions(bytes: Uint8Array): ImageSize | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return jpegSize(bytes);
  return webpSize(bytes);
}
