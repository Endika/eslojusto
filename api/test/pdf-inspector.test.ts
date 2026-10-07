import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ascii85Decode,
  asciiHexDecode,
  MAX_DECODED_BYTES,
  MAX_RAW_OBJECTS,
  pdfInspector,
  stringBytes,
} from '../src/adapters/pdf-inspector';
import { rawPdf, settlementPdf, streamObject } from './support/synthetic';

const fixture = (name: string) =>
  new Uint8Array(readFileSync(new URL(`fixtures/pdf/${name}`, import.meta.url)));

const catalog = '<</Type/Catalog/Pages 2 0 R>>';
const onePageTree = '<</Type/Pages/Kids[3 0 R]/Count 1>>';
const page = (contents = '') => `<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]${contents}>>`;
const text = (s: string) => new TextEncoder().encode(s);

describe('pdfInspector', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([1, 4, 5])('counts the %i pages of a genuine PDF and its text', async (pages) => {
    const facts = await pdfInspector.inspect(await settlementPdf(pages));
    expect(facts?.pages).toBe(pages);
    expect(facts?.textBytes).toBeGreaterThan(200 * pages);
  });

  it('measures the text in a Flate content stream', async () => {
    const content = deflateSync(Buffer.from('BT /F1 12 Tf (Salario 1.250,00) Tj <414243> Tj ET'));
    const pdf = rawPdf([
      catalog,
      onePageTree,
      page('/Contents 4 0 R'),
      streamObject('/Filter/FlateDecode', content),
    ]);
    expect(await pdfInspector.inspect(pdf)).toEqual({ pages: 1, textBytes: 16 + 3 });
  });

  // pypdf and pdfium follow the cross-reference table to 5 pages; a sequential parse sees 1.
  it('refuses a PDF whose page tree is redefined after its last %%EOF', async () => {
    expect(await pdfInspector.inspect(fixture('five-pages-counted-as-one.pdf'))).toBeNull();
  });

  it('refuses an object defined twice in one revision', async () => {
    const pdf = rawPdf([catalog, onePageTree, page(), onePageTree.replace('Count 1', 'Count 1 ')]);
    const doubled = new TextDecoder('latin1')
      .decode(pdf)
      .replace('4 0 obj', '2 0 obj')
      .replace('0 5\n', '0 5\n');
    expect(await pdfInspector.inspect(text(doubled))).toBeNull();
  });

  it('refuses a page tree that disagrees with the page objects in the file', async () => {
    const orphan = rawPdf([catalog, onePageTree, page(), page()]);
    const overcounted = rawPdf([catalog, '<</Type/Pages/Kids[3 0 R]/Count 5>>', page()]);
    expect(await pdfInspector.inspect(orphan)).toBeNull();
    expect(await pdfInspector.inspect(overcounted)).toBeNull();
  });

  it('accepts a later revision that redefines a page, as a signature does', async () => {
    const base = new TextDecoder('latin1').decode(rawPdf([catalog, onePageTree, page()]));
    const update = `3 0 obj\n${page('/Annots[]')}\nendobj\ntrailer<</Root 1 0 R/Size 4/Prev 0>>\n%%EOF\n`;
    const facts = await pdfInspector.inspect(text(base + update));
    expect(facts).toEqual({ pages: 1, textBytes: 0 });
  });

  it('refuses a file with too many objects before parsing it', async () => {
    const filler = Array.from({ length: MAX_RAW_OBJECTS }, () => '[1 2 3]');
    expect(
      await pdfInspector.inspect(rawPdf([catalog, onePageTree, page(), ...filler])),
    ).toBeNull();
  });

  it('refuses text that inflates past the decoding budget', async () => {
    const bomb = deflateSync(Buffer.alloc(MAX_DECODED_BYTES + 1, 0x20));
    const pdf = rawPdf([
      catalog,
      onePageTree,
      page('/Contents 4 0 R'),
      streamObject('/Filter/FlateDecode', bomb),
    ]);
    expect(await pdfInspector.inspect(pdf)).toBeNull();
  });

  it('refuses text behind a filter it cannot measure', async () => {
    const pdf = rawPdf([
      catalog,
      onePageTree,
      page('/Contents 4 0 R'),
      streamObject('/Filter/LZWDecode', text('anything')),
    ]);
    expect(await pdfInspector.inspect(pdf)).toBeNull();
  });

  it('refuses a malformed PDF without a word on the console', async () => {
    const spies = (['log', 'warn', 'error', 'info', 'debug'] as const).map((m) =>
      vi.spyOn(console, m),
    );
    const malformed = text(
      '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 10 10]/Secret (Persona Ficticia 00000000T)>>endobj\n4 0 obj << /Name (Persona Ficticia) ) >> garbage endobj\n5 0 obj <</Length 999>> stream\nnomina ficticia\nendstream endobj\ntrailer<</Root 1 0 R>>\n%%EOF',
    );
    expect(await pdfInspector.inspect(malformed)).toBeNull();
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it('refuses something that is not a PDF', async () => {
    expect(await pdfInspector.inspect(text('%PDF-1.7\nnot really'))).toBeNull();
  });
});

describe('stringBytes', () => {
  it('counts literal and hex strings, escapes and nesting, but not dictionaries or comments', () => {
    expect(stringBytes('(ab\\)c) Tj')).toBe(4);
    expect(stringBytes('(a(b)c) Tj')).toBe(5);
    expect(stringBytes('<00410042> Tj <</A 1>>')).toBe(4);
    expect(stringBytes('% (not text)\n(x) Tj')).toBe(1);
    expect(stringBytes('[(Sala) -20 (rio)] TJ')).toBe(7);
  });
});

describe('ASCII filters', () => {
  it('decode hex', () => {
    expect(Buffer.from(asciiHexDecode(text('48 6f6C61>'))).toString()).toBe('Hola');
    expect(Buffer.from(asciiHexDecode(text('414>'))).toString('hex')).toBe('4140');
  });

  it('decode ASCII85', () => {
    const encoded = '87cURD]i,"Ebo80~>';
    expect(Buffer.from(ascii85Decode(text(encoded))).toString()).toBe('Hello World!');
    expect(Array.from(ascii85Decode(text('z~>')))).toEqual([0, 0, 0, 0]);
  });

  it('refuse characters outside their alphabet', () => {
    expect(() => asciiHexDecode(text('zz>'))).toThrow();
    expect(() => ascii85Decode(text('{~>'))).toThrow();
  });
});
