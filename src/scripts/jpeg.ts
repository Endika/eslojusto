import { bytesToBase64 } from '../documents/files';
import type { EncodedFile } from '../documents/ports';

// Tried in turn until an image fits its share of the request (api/README.md, «Payload budget»).
const JPEG_QUALITIES = [0.85, 0.75, 0.65, 0.5] as const;

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

// The best quality that fits `maxBytes`; if none does, the lowest, and the request size decides.
export async function canvasJpeg(
  canvas: HTMLCanvasElement,
  maxBytes: number,
): Promise<EncodedFile> {
  let blob: Blob | null = null;
  for (const quality of JPEG_QUALITIES) {
    blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', quality));
    if (!blob) throw new Error('No JPEG');
    if (blob.size <= maxBytes) break;
  }
  if (!blob) throw new Error('No JPEG');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return { mediaType: 'image/jpeg', data: bytesToBase64(bytes), bytes: bytes.length };
}
