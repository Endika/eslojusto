import { fitExactly } from './files';
import type { EncodedFile, OpenedPdf, PdfPages, PdfProblem } from './ports';

// The slice of pdf.js this adapter uses; the library itself loads only when a PDF is picked.
export interface PdfJsPage {
  getViewport(params: { scale: number }): { readonly width: number; readonly height: number };
  render(params: { canvas: unknown; canvasContext: unknown; viewport: unknown }): {
    readonly promise: Promise<void>;
    cancel(): void;
  };
  cleanup(): void;
}

export interface PdfJsDocument {
  readonly numPages: number;
  getPage(page: number): Promise<PdfJsPage>;
  destroy(): Promise<void>;
}

export interface PdfJs {
  getDocument(params: {
    data: Uint8Array;
    isEvalSupported: boolean;
    useWasm: boolean;
    stopAtErrors: boolean;
  }): { readonly promise: Promise<PdfJsDocument>; destroy(): Promise<void> };
}

// A white canvas of a given size, and its JPEG within a byte budget, as the photos get.
export interface Raster<C> {
  create(width: number, height: number): { readonly canvas: C; readonly context: unknown };
  toJpeg(canvas: C, maxBytes: number): Promise<EncodedFile>;
}

// How long a PDF may take to open, and a page to draw: past that, the person is better off
// sending photos than waiting on a sheet whose controls are busy.
export const PDF_TIMEOUTS = { openMs: 20_000, renderMs: 15_000 } as const;

const TIMED_OUT = Symbol('timed out');

// The promise's value, or TIMED_OUT once `ms` have passed; the timer never outlives the race.
async function within<T>(promise: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

const problemOf = (error: unknown): PdfProblem =>
  error instanceof Error && error.name === 'PasswordException' ? 'pdf_encrypted' : 'pdf_unreadable';

const quietly = (run: () => unknown) => {
  try {
    void Promise.resolve(run()).catch(() => {});
  } catch {
    // Freeing what is already gone is no failure.
  }
};

export function createPdfPages<C>(
  pdfjs: PdfJs,
  raster: Raster<C>,
  timeouts: { readonly openMs: number; readonly renderMs: number } = PDF_TIMEOUTS,
): PdfPages {
  return {
    async open(file): Promise<OpenedPdf | PdfProblem> {
      let doc: PdfJsDocument | typeof TIMED_OUT;
      try {
        const data = new Uint8Array(await file.arrayBuffer());
        // No eval and no WebAssembly: the page's CSP allows neither.
        const task = pdfjs.getDocument({
          data,
          isEvalSupported: false,
          useWasm: false,
          stopAtErrors: true,
        });
        doc = await within(task.promise, timeouts.openMs);
        if (doc === TIMED_OUT) {
          quietly(() => task.destroy());
          return 'pdf_too_slow';
        }
      } catch (error) {
        return problemOf(error);
      }
      const opened = doc;
      if (!Number.isInteger(opened.numPages) || opened.numPages < 1) {
        quietly(() => opened.destroy());
        return 'pdf_unreadable';
      }
      return {
        pages: opened.numPages,
        async render(number, maxBytes) {
          const page = await opened.getPage(number);
          const base = page.getViewport({ scale: 1 });
          const { width, height, scale } = fitExactly(base.width, base.height);
          const { canvas, context } = raster.create(width, height);
          const task = page.render({
            canvas,
            canvasContext: context,
            viewport: page.getViewport({ scale }),
          });
          const drawn = await within(task.promise, timeouts.renderMs);
          if (drawn === TIMED_OUT) quietly(() => task.cancel());
          page.cleanup();
          return drawn === TIMED_OUT ? 'pdf_too_slow' : raster.toJpeg(canvas, maxBytes);
        },
        close() {
          quietly(() => opened.destroy());
        },
      };
    },
  };
}
