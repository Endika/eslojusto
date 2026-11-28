// @vitest-environment node
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createPdfPages,
  PDF_TIMEOUTS,
  type PdfJs,
  type Raster,
} from '../../src/documents/pdf-pages';
import { syntheticPdf } from '../support/synthetic-pdf';

GlobalWorkerOptions.workerSrc = pathToFileURL(
  createRequire(import.meta.url).resolve('pdfjs-dist/legacy/build/pdf.worker.mjs'),
).href;

const pdfFile = (bytes: Uint8Array, name = 'carta.pdf') =>
  new File([bytes as BlobPart], name, { type: 'application/pdf' });

// Records what it is asked to draw instead of drawing it.
function recordingRaster() {
  const made: { width: number; height: number }[] = [];
  const budgets: number[] = [];
  const raster: Raster<{ width: number; height: number }> = {
    create(width, height) {
      made.push({ width, height });
      return { canvas: { width, height }, context: {} };
    },
    async toJpeg(_canvas, maxBytes) {
      budgets.push(maxBytes);
      return { mediaType: 'image/jpeg', data: 'AAAA', bytes: 3 };
    },
  };
  return { raster, made, budgets };
}

describe('the PDF-to-pages adapter, drawing', () => {
  // A one-page document of A4 size that draws nothing.
  const fakePdfjs = (error?: Error): PdfJs => ({
    getDocument: () => ({
      promise: error
        ? Promise.reject(error)
        : Promise.resolve({
            numPages: 1,
            getPage: async () => ({
              getViewport: ({ scale }: { scale: number }) => ({
                width: 595 * scale,
                height: 842 * scale,
              }),
              render: () => ({ promise: Promise.resolve(), cancel: () => {} }),
              cleanup: () => {},
            }),
            destroy: async () => {},
          }),
      destroy: async () => {},
    }),
  });

  it('draws a page with its long side at 1568 px, then encodes it within its budget', async () => {
    const { raster, made, budgets } = recordingRaster();
    const opened = await createPdfPages(fakePdfjs(), raster).open(pdfFile(syntheticPdf(1)));
    if (typeof opened === 'string') throw new Error(opened);
    expect(await opened.render(1, 300_000)).toEqual({
      mediaType: 'image/jpeg',
      data: 'AAAA',
      bytes: 3,
    });
    expect(made).toEqual([{ width: 1108, height: 1568 }]);
    expect(budgets).toEqual([300_000]);
  });

  it('tells a password-protected PDF from a broken one', async () => {
    const password = Object.assign(new Error('No password given'), { name: 'PasswordException' });
    const { raster } = recordingRaster();
    expect(await createPdfPages(fakePdfjs(password), raster).open(pdfFile(syntheticPdf(1)))).toBe(
      'pdf_encrypted',
    );
    expect(
      await createPdfPages(fakePdfjs(new Error('bad')), raster).open(pdfFile(syntheticPdf(1))),
    ).toBe('pdf_unreadable');
  });
});

describe('the PDF-to-pages adapter, in what it asks of pdf.js', () => {
  afterEach(() => vi.useRealTimers());

  const documentOf = (numPages: number, calls: unknown[]) => ({
    numPages,
    getPage: async () => ({
      getViewport: (params: { scale: number }) => ({ width: 595 * params.scale, height: 842 }),
      render: (params: object) => {
        calls.push(['render', params]);
        return { promise: Promise.resolve(), cancel: () => void calls.push('cancel') };
      },
      cleanup: () => {},
    }),
    destroy: async () => void calls.push('destroy'),
  });
  const pdfjsOf = (numPages: number, calls: unknown[]): PdfJs => ({
    getDocument: (params) => {
      calls.push(['getDocument', params]);
      return { promise: Promise.resolve(documentOf(numPages, calls)), destroy: async () => {} };
    },
  });

  it('opens with no eval, no WebAssembly and no tolerance for a damaged file', async () => {
    const calls: unknown[] = [];
    await createPdfPages(pdfjsOf(1, calls), recordingRaster().raster).open(
      pdfFile(syntheticPdf(1)),
    );
    expect(calls[0]).toEqual([
      'getDocument',
      {
        data: expect.any(Uint8Array),
        isEvalSupported: false,
        useWasm: false,
        stopAtErrors: true,
      },
    ]);
  });

  it.each([-1])('answers unreadable for a document of %s pages, and frees it', async (n) => {
    const calls: unknown[] = [];
    const opened = await createPdfPages(pdfjsOf(n, calls), recordingRaster().raster).open(
      pdfFile(syntheticPdf(1)),
    );
    expect(opened).toBe('pdf_unreadable');
    expect(calls).toContain('destroy');
  });

  it('draws onto the canvas at the scale that fits, and cancels nothing that finished', async () => {
    const calls: unknown[] = [];
    const { raster } = recordingRaster();
    const opened = await createPdfPages(pdfjsOf(1, calls), raster).open(pdfFile(syntheticPdf(1)));
    if (typeof opened === 'string') throw new Error(opened);
    await opened.render(1, 100_000);
    const scale = 1568 / 842;
    expect(calls).toContainEqual([
      'render',
      {
        canvas: { width: 1108, height: 1568 },
        canvasContext: {},
        viewport: { width: 595 * scale, height: 842 },
      },
    ]);
    expect(calls).not.toContain('cancel');
  });

  it('leaves no timer running once it has opened and drawn', async () => {
    vi.useFakeTimers();
    const { raster } = recordingRaster();
    const opened = await createPdfPages(pdfjsOf(1, []), raster).open(pdfFile(syntheticPdf(1)));
    if (typeof opened === 'string') throw new Error(opened);
    await opened.render(1, 100_000);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('the PDF-to-pages adapter, against a PDF that never finishes', () => {
  afterEach(() => vi.useRealTimers());

  const never = <T>() => new Promise<T>(() => {});

  it('gives up opening after 20 s and frees the reader', async () => {
    vi.useFakeTimers();
    const destroyed: string[] = [];
    const stuck: PdfJs = {
      getDocument: () => ({
        promise: never(),
        destroy: async () => void destroyed.push('task'),
      }),
    };
    const opening = createPdfPages(stuck, recordingRaster().raster).open(pdfFile(syntheticPdf(1)));
    await vi.advanceTimersByTimeAsync(PDF_TIMEOUTS.openMs);
    expect(await opening).toBe('pdf_too_slow');
    expect(destroyed).toEqual(['task']);
  });

  it('gives up drawing a page after 15 s, and closes the document when asked', async () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    const slowPage: PdfJs = {
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: 1,
          getPage: async () => ({
            getViewport: ({ scale }: { scale: number }) => ({
              width: 595 * scale,
              height: 842 * scale,
            }),
            render: () => ({
              promise: never<undefined>(),
              cancel: () => void calls.push('cancel'),
            }),
            cleanup: () => void calls.push('cleanup'),
          }),
          destroy: async () => void calls.push('destroy'),
        }),
        destroy: async () => {},
      }),
    };
    const { raster, budgets } = recordingRaster();
    const opened = await createPdfPages(slowPage, raster).open(pdfFile(syntheticPdf(1)));
    if (typeof opened === 'string') throw new Error(opened);
    const drawing = opened.render(1, 300_000);
    await vi.advanceTimersByTimeAsync(PDF_TIMEOUTS.renderMs);
    expect(await drawing).toBe('pdf_too_slow');
    expect(calls).toEqual(['cancel', 'cleanup']);
    expect(budgets).toEqual([]);
    opened.close();
    expect(calls).toEqual(['cancel', 'cleanup', 'destroy']);
  });
});
