import { describe, expect, it } from 'vitest';
import {
  ANALYSIS_LONG_SIDE,
  MIN_BRIGHTNESS,
  MIN_LONG_SIDE,
  MIN_SHARPNESS,
  measureQuality,
  qualityProblem,
} from '../../src/documents/quality';

// A synthetic page at the analysis size: lines of "words" made of ink strokes on paper, in grey.
const WIDTH = (ANALYSIS_LONG_SIDE * 3) / 4;
const HEIGHT = ANALYSIS_LONG_SIDE;

function page(paper = 225, ink = 30): Float32Array {
  const grey = new Float32Array(WIDTH * HEIGHT).fill(paper);
  for (let y = 20; y < HEIGHT - 20; y += 9)
    for (let x = 20; x < WIDTH - 20; x += 1) {
      if (Math.floor(x / 23) % 4 === 3) continue;
      for (let dy = 0; dy < 4; dy += 1) if ((x + dy) % 3 !== 0) grey[(y + dy) * WIDTH + x] = ink;
    }
  return grey;
}

// Three passes of a box blur, close to a Gaussian of about r × 1.4 px.
function blurred(grey: Float32Array, r: number): Float32Array {
  let out = grey;
  for (let pass = 0; pass < 3; pass += 1) {
    const src = out;
    out = new Float32Array(src.length);
    for (let y = 0; y < HEIGHT; y += 1)
      for (let x = 0; x < WIDTH; x += 1) {
        let sum = 0;
        let n = 0;
        for (let dy = -r; dy <= r; dy += 1)
          for (let dx = -r; dx <= r; dx += 1) {
            const yy = y + dy;
            const xx = x + dx;
            if (yy < 0 || yy >= HEIGHT || xx < 0 || xx >= WIDTH) continue;
            sum += src[yy * WIDTH + xx] ?? 0;
            n += 1;
          }
        out[y * WIDTH + x] = sum / n;
      }
  }
  return out;
}

// As a canvas's getImageData returns it.
function rgba(grey: Float32Array): Uint8ClampedArray {
  const data = new Uint8ClampedArray(grey.length * 4);
  grey.forEach((v, i) => data.set([v, v, v, 255], i * 4));
  return data;
}

const measure = (grey: Float32Array, longSide = 1568) =>
  measureQuality(rgba(grey), WIDTH, HEIGHT, longSide);

describe('photo quality', () => {
  it('says nothing of a sharp, well-lit page of the usual size', () => {
    const signals = measure(page());
    expect(signals.brightness).toBeGreaterThan(150);
    expect(signals.sharpness).toBeGreaterThan(10_000);
    expect(qualityProblem(signals)).toBeNull();
  });

  it('calls a page in shadow dark, even when it is sharp', () => {
    const signals = measure(page(50, 10));
    expect(signals.brightness).toBeLessThan(MIN_BRIGHTNESS);
    expect(signals.sharpness).toBeGreaterThan(MIN_SHARPNESS);
    expect(qualityProblem(signals)).toBe('dark');
  });

  it('keeps a slightly soft page and calls one blurred past reading blurry', () => {
    const soft = measure(blurred(page(), 1));
    expect(soft.sharpness).toBeGreaterThan(MIN_SHARPNESS);
    expect(qualityProblem(soft)).toBeNull();
    const unreadable = measure(blurred(page(), 2));
    expect(unreadable.sharpness).toBeLessThan(MIN_SHARPNESS / 4);
    expect(qualityProblem(unreadable)).toBe('blurry');
  });

  it('calls a blank or uniform photo blurry: it has no edges to read', () => {
    expect(qualityProblem(measure(new Float32Array(WIDTH * HEIGHT).fill(200)))).toBe('blurry');
  });

  it('calls a sharp photo below the minimum size small', () => {
    expect(qualityProblem(measure(page(), MIN_LONG_SIDE - 1))).toBe('small');
    expect(qualityProblem(measure(page(), MIN_LONG_SIDE))).toBeNull();
  });

  it('reads brightness as luma, so a red page is darker than a white one', () => {
    const red = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
    for (let i = 0; i < red.length; i += 4) red.set([255, 0, 0, 255], i);
    expect(measureQuality(red, WIDTH, HEIGHT, 1568).brightness).toBeCloseTo(76.245, 2);
  });

  // The measure runs on the main thread once per photo, up to 25 in a pack. About 2 ms here.
  it('measures a photo at the analysis size in well under 15 ms', () => {
    const data = rgba(page());
    for (let i = 0; i < 3; i += 1) measureQuality(data, WIDTH, HEIGHT, 1568);
    const runs = 20;
    const started = performance.now();
    for (let i = 0; i < runs; i += 1) measureQuality(data, WIDTH, HEIGHT, 1568);
    const perPhoto = (performance.now() - started) / runs;
    console.info(`measureQuality: ${perPhoto.toFixed(2)} ms per ${WIDTH}×${HEIGHT} photo`);
    expect(perPhoto).toBeLessThan(15);
  });

  it('survives an image too small to have an inside', () => {
    expect(measureQuality(new Uint8ClampedArray(4), 1, 1, 1)).toEqual({
      brightness: 0,
      sharpness: 0,
      longSide: 1,
    });
  });
});
