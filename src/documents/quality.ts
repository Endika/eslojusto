// Cheap signals of a photo that will read badly, worked out in the browser before anything is
// sent. They only ever warn: the person can always send the photo as it is.

// The long side of the grey copy the signals are measured on: enough for text to stay edges,
// and about 2 ms a photo on a desktop. At 256 px it took a quarter of that, but a page blurred
// past reading scored about 200, above where a soft but legible one sits at 512 px, and telling
// the two apart would rest on retuning MIN_SHARPNESS against one synthetic pattern.
export const ANALYSIS_LONG_SIDE = 512;

// Mean luma, 0 to 255, below which a page reads as dark: white paper photographed in fair light
// averages 150 to 220, and under 70 (about a quarter of white) it is in shadow.
export const MIN_BRIGHTNESS = 70;
// Variance of the Laplacian below which a photo reads as blurry, the usual rule of thumb on
// 8-bit grey. On synthetic pages (tests/documents/quality.test.ts) sharp text scores in the tens
// of thousands, the same text blurred by about 1.5 px at this size about 180, and blurred by
// about 3 px, past reading, under 20. Real phone photos may move these figures.
export const MIN_SHARPNESS = 100;
// The photo's long side, before any downsizing, below which small print stops being legible: an
// A4 page at 1000 px is about 85 dpi, which leaves the x-height of 9-point type about 5 px.
export const MIN_LONG_SIDE = 1000;

export const QUALITY_PROBLEMS = ['dark', 'blurry', 'small'] as const;
export type QualityProblem = (typeof QUALITY_PROBLEMS)[number];

export interface QualitySignals {
  readonly brightness: number;
  readonly sharpness: number;
  // Of the photo as taken, in pixels.
  readonly longSide: number;
}

// Mean brightness (Rec. 601 luma, the weights JPEG uses) and the variance of the 4-neighbour
// Laplacian of an RGBA image, as a canvas's getImageData gives it. Plain indexed loops over typed
// arrays: this runs once per photo on a phone's main thread.
export function measureQuality(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  longSide: number,
): QualitySignals {
  const size = width * height;
  const grey = new Float32Array(size);
  let sum = 0;
  for (let i = 0, j = 0; i < size; i += 1, j += 4) {
    const y =
      0.299 * (rgba[j] as number) +
      0.587 * (rgba[j + 1] as number) +
      0.114 * (rgba[j + 2] as number);
    grey[i] = y;
    sum += y;
  }
  // Laplacians are at most 1,020 in size and there are fewer than a million of them, so plain
  // sums in doubles lose nothing that matters.
  let n = 0;
  let total = 0;
  let squares = 0;
  for (let y = 1; y < height - 1; y += 1) {
    const row = y * width;
    for (let i = row + 1; i < row + width - 1; i += 1) {
      const l =
        (grey[i - 1] as number) +
        (grey[i + 1] as number) +
        (grey[i - width] as number) +
        (grey[i + width] as number) -
        4 * (grey[i] as number);
      total += l;
      squares += l * l;
      n += 1;
    }
  }
  const mean = n > 0 ? total / n : 0;
  return {
    brightness: size > 0 ? sum / size : 0,
    sharpness: n > 0 ? squares / n - mean * mean : 0,
    longSide,
  };
}

// The one thing worth saying about a photo, if any. Darkness comes first, since a dark photo
// also measures as blurry; size last, since a small sharp photo may still read.
export function qualityProblem(s: QualitySignals): QualityProblem | null {
  if (s.brightness < MIN_BRIGHTNESS) return 'dark';
  if (s.sharpness < MIN_SHARPNESS) return 'blurry';
  if (s.longSide < MIN_LONG_SIDE) return 'small';
  return null;
}
