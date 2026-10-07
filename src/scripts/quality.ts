import { fitWithin } from '../documents/files';
import { ANALYSIS_LONG_SIDE, measureQuality, type QualitySignals } from '../documents/quality';

// Measured on a small copy of the canvas a photo was drawn on, in this page only. None when the
// browser won't hand pixels back: the hint is a courtesy, never a gate.
export function photoQuality(
  canvas: HTMLCanvasElement,
  longSide: number,
): QualitySignals | undefined {
  try {
    const { width, height } = fitWithin(canvas.width, canvas.height, ANALYSIS_LONG_SIDE);
    const copy = document.createElement('canvas');
    copy.width = width;
    copy.height = height;
    const context = copy.getContext('2d', { willReadFrequently: true });
    if (!context) return undefined;
    context.drawImage(canvas, 0, 0, width, height);
    return measureQuality(context.getImageData(0, 0, width, height).data, width, height, longSide);
  } catch {
    return undefined;
  }
}
