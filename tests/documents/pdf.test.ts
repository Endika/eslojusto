import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { renderPdf } from '../../src/documents/pdf';
import { PdfDocument, pdfString } from '../../src/documents/pdf-writer';
import { sans } from '../../src/documents/fonts/sans';
import { serif } from '../../src/documents/fonts/serif';
import { letterModel, reportModel } from '../../src/documents/report';
import { completed, today, tr } from './fixtures';

const latin1 = (bytes: Uint8Array) => Buffer.from(bytes).toString('latin1');

// Every stream, inflated, with its dictionary.
function streams(pdf: string): { dict: string; data: string }[] {
  const out: { dict: string; data: string }[] = [];
  const re = /<<([^]*?)>>\nstream\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pdf))) {
    const dict = m[1] ?? '';
    const length = Number(/\/Length (\d+)/.exec(dict)?.[1]);
    const start = m.index + m[0].length;
    const raw = Buffer.from(pdf.slice(start, start + length), 'latin1');
    out.push({ dict, data: inflateSync(raw).toString('latin1') });
  }
  return out;
}

// The text a viewer would extract: glyph ids mapped back through each ToUnicode map.
function extractText(pdf: string): string {
  const all = streams(pdf);
  const maps = all
    .filter((s) => s.data.includes('beginbfchar'))
    .map((s) => {
      const map = new Map<string, string>();
      for (const [, gid, code] of s.data.matchAll(/<([0-9a-f]{4})> <([0-9a-f]+)>/g))
        map.set(gid ?? '', String.fromCodePoint(parseInt(code ?? '0', 16)));
      return map;
    });
  const lookup = (gid: string) => maps.map((m) => m.get(gid)).find((c) => c !== undefined) ?? '';
  return all
    .filter((s) => s.data.includes(' Tj'))
    .flatMap((s) => [...s.data.matchAll(/<([0-9a-f]+)> Tj/g)])
    .map(([, hex]) => (hex?.match(/.{4}/g) ?? []).map(lookup).join(''))
    .join('\n');
}

describe('the PDF writer', () => {
  it('writes a valid cross-reference table', async () => {
    const pdf = latin1(await renderPdf(letterModel(completed(), tr)));
    expect(pdf.startsWith('%PDF-1.7')).toBe(true);
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
    const startxref = Number(/startxref\n(\d+)/.exec(pdf)?.[1]);
    expect(pdf.slice(startxref, startxref + 4)).toBe('xref');
    const offsets = [...pdf.slice(startxref).matchAll(/(\d{10}) 00000 n /g)].map((m) =>
      Number(m[1]),
    );
    offsets.forEach((o, i) => expect(pdf.slice(o, o + 12)).toMatch(new RegExp(`^${i + 1} 0 obj`)));
  });

  it('embeds both fonts with a ToUnicode map, so Spanish text can be copied', async () => {
    const pdf = latin1(await renderPdf(reportModel(completed(), tr, today)));
    expect(pdf.match(/\/FontFile2/g)).toHaveLength(2);
    expect(pdf.match(/\/ToUnicode/g)).toHaveLength(2);
    const text = extractText(pdf);
    expect(text).toContain('Revisión de tu finiquito');
    expect(text).toContain('Indemnización');
    expect(text).toContain('40.438,41 €');
    expect(text).toContain('30 días al año');
  });

  it('links each source', async () => {
    const pdf = latin1(await renderPdf(reportModel(completed(), tr, today)));
    expect(pdf).toContain('/URI (https://www.boe.es/buscar/act.php?id=BOE-A-2015-11430#a56)');
  });

  it('breaks long text into lines and pages, and never splits an amount', () => {
    const doc = new PdfDocument({ sans, serif }, 'x');
    const style = { font: 'serif', size: 10 } as const;
    const lines = doc.wrap(`${'palabra '.repeat(40)}1.234,56\u00a0€`, style, 200);
    expect(lines.length).toBeGreaterThan(5);
    for (const line of lines) expect(doc.measure(line, style)).toBeLessThanOrEqual(200);
    expect(lines.some((l) => l.includes('1.234,56\u00a0€'))).toBe(true);
    for (let i = 0; i < 120; i++) doc.paragraph('Una línea.', style);
    expect(doc.pageCount).toBeGreaterThan(1);
  });

  it('writes a character the font lacks as a question mark rather than nothing', () => {
    const doc = new PdfDocument({ sans, serif }, 'x');
    expect(doc.measure('ع', { font: 'sans', size: 10 })).toBe(
      doc.measure('?', { font: 'sans', size: 10 }),
    );
  });

  it('writes titles as PDF strings', () => {
    expect(pdfString('Report (1)')).toBe('(Report \\(1\\))');
    expect(pdfString('Recibí')).toBe('<FEFF0052006500630069006200ED>');
  });
});
