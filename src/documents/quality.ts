// Cheap signals of a photo that will read badly, worked out in the browser before anything is
// sent. They only ever warn: the person can always send the photo as it is.

// The long side of the grey copy the signals are measured on: enough for text to stay edges,
// small enough to measure in a few milliseconds on a phone.
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

// Rec. 601 luma, the weights JPEG uses.
const luma = (rgba: ArrayLike<number>, i: number): number =>
  0.299 * (rgba[i] ?? 0) + 0.587 * (rgba[i + 1] ?? 0) + 0.114 * (rgba[i + 2] ?? 0);

// Mean brightness and the variance of the 4-neighbour Laplacian of an RGBA image, as a canvas's
// getImageData gives it.
export function measureQuality(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  longSide: number,
): QualitySignals {
  const grey = new Float32Array(width * height);
  let sum = 0;
  for (let i = 0; i < grey.length; i += 1) {
    const y = luma(rgba, i * 4);
    grey[i] = y;
    sum += y;
  }
  let n = 0;
  let mean = 0;
  let squares = 0;
  for (let y = 1; y < height - 1; y += 1)
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const at = (j: number) => grey[j] ?? 0;
      const l = at(i - 1) + at(i + 1) + at(i - width) + at(i + width) - 4 * at(i);
      // Welford's running variance: no second pass, no precision lost on large sums.
      n += 1;
      const delta = l - mean;
      mean += delta / n;
      squares += delta * (l - mean);
    }
  return {
    brightness: grey.length > 0 ? sum / grey.length : 0,
    sharpness: n > 0 ? squares / n : 0,
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
