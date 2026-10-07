import { bytesToBase64, encodingSteps } from '../documents/files';
import type { EncodedFile } from '../documents/ports';

export function whiteCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No canvas');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, width, height);
  return { canvas, context };
}

function scaled(canvas: HTMLCanvasElement, width: number, height: number) {
  if (width === canvas.width && height === canvas.height) return canvas;
  const smaller = whiteCanvas(width, height);
  smaller.context.imageSmoothingQuality = 'high';
  smaller.context.drawImage(canvas, 0, 0, width, height);
  return smaller.canvas;
}

// The first size and quality that fit `maxBytes`; if none does, the smallest, and the request
// size decides.
async function fittingJpeg(canvas: HTMLCanvasElement, maxBytes: number): Promise<Blob> {
  let blob: Blob | null = null;
  let source = canvas;
  for (const { width, height, quality } of encodingSteps(canvas.width, canvas.height)) {
    if (width !== source.width || height !== source.height) source = scaled(canvas, width, height);
    blob = await new Promise<Blob | null>((r) => source.toBlob(r, 'image/jpeg', quality));
    if (!blob) throw new Error('No JPEG');
    if (blob.size <= maxBytes) return blob;
  }
  if (!blob) throw new Error('No JPEG');
  return blob;
}

export async function canvasJpeg(
  canvas: HTMLCanvasElement,
  maxBytes: number,
): Promise<EncodedFile> {
  const bytes = new Uint8Array(await (await fittingJpeg(canvas, maxBytes)).arrayBuffer());
  return { mediaType: 'image/jpeg', data: bytesToBase64(bytes), bytes: bytes.length };
}
