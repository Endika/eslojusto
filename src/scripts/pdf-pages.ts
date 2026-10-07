import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
// Bundled and served from this site, like every other script.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { createPdfPages, type PdfJs } from '../documents/pdf-pages';
import { canvasJpeg, whiteCanvas } from './jpeg';

GlobalWorkerOptions.workerSrc = workerUrl;

export const pdfPages = createPdfPages({ getDocument } as unknown as PdfJs, {
  create: whiteCanvas,
  toJpeg: canvasJpeg,
});
