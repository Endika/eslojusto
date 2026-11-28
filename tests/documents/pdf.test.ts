import { afterEach, describe, expect, it, vi } from 'vitest';
import { pdfMaker, renderPdf, STYLES, unprintable } from '../../src/documents/pdf';
import { PdfDocument, pdfString } from '../../src/documents/pdf-writer';
import type { Block } from '../../src/documents/ports';
import { streams } from '../support/pdf-streams';
import { sans } from '../../src/documents/fonts/sans';
import { serif } from '../../src/documents/fonts/serif';
import { letterModel, reportModel } from '../../src/documents/report';
import { completed, today, tr, unfairDismissal } from './fixtures';

const latin1 = (bytes: Uint8Array) => Buffer.from(bytes).toString('latin1');

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
    expect(text).toContain('30 días naturales al año');
  });

  it('writes the letter details the person added on their lines', async () => {
    const pdf = latin1(
      await renderPdf(
        letterModel(completed(), tr, {
          name: 'Alex Ejemplo Núñez',
          id: '12345678Z',
          company: 'Empresa Ficticia SL',
          place: 'Logroño',
          date: { y: 2026, m: 10, d: 7 },
        }),
      ),
    );
    const text = extractText(pdf);
    expect(text).toContain('Alex Ejemplo Núñez');
    expect(text).toContain('12345678Z');
    expect(text).toContain('Empresa Ficticia SL');
    expect(text).toContain('En Logroño, a 7 de octubre de 2026');
  });

  it('a long value shrinks to its line instead of crossing the margin', async () => {
    const long = 'W'.repeat(80);
    const doc = new PdfDocument({ sans, serif }, 'x');
    const line = doc.width * 0.7;
    expect(doc.measure(long, { font: 'sans', size: 10 })).toBeGreaterThan(line);
    const pdf = latin1(
      await renderPdf({
        title: 'x',
        footer: null,
        blocks: [{ type: 'blank', label: 'Nombre y apellidos', value: long }],
      }),
    );
    const sizes = streams(pdf).flatMap((st) =>
      [...st.data.matchAll(/ ([\d.]+) Tf /g)].map((m) => Number(m[1])),
    );
    // The label at 8.5, the value at whatever size fits its line.
    const value = Math.min(...sizes.filter((x) => x !== 8.5));
    expect(value).toBeLessThan(10);
    expect(doc.measure(long, { font: 'sans', size: value })).toBeLessThanOrEqual(line);
    expect(extractText(pdf)).toContain(long);
  });

  it('both letters carry their own body in the PDF text', async () => {
    const items = extractText(latin1(await renderPdf(letterModel(completed(), tr))));
    expect(items).toContain('hago constar que no estoy conforme con estas cantidades');
    expect(items).toContain('Indemnización: la propuesta recoge');
    const general = extractText(
      latin1(await renderPdf(letterModel(completed(unfairDismissal, { severance: 41000 }), tr))),
    );
    expect(general).toContain('sin mostrar mi conformidad con su contenido');
    expect(general).not.toContain('la propuesta recoge');
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

  it('a missing character copies as «?», never as the character that first used the glyph', async () => {
    const doc = new PdfDocument({ sans, serif }, 'x');
    doc.paragraph('ع 😀 ¿Qué? ok', { font: 'sans', size: 10 });
    const pdf = latin1(await doc.save());
    const text = extractText(pdf);
    expect(text).toBe('? ? ¿Qué? ok');
    expect(pdf).not.toMatch(/<[0-9a-f]{4}> <[0-9a-f]{5,}>/);
  });

  it('writes titles as PDF strings', () => {
    expect(pdfString('Report (1)')).toBe('(Report \\(1\\))');
    expect(pdfString('Recibí')).toBe('<FEFF0052006500630069006200ED>');
  });
});

describe('how each block is laid out', () => {
  afterEach(() => vi.restoreAllMocks());

  const VIOLET = [0.478, 0.247, 0.82];
  const width = new PdfDocument({ sans, serif }, 'x').width;

  const laidOut = async (block: Block) => {
    const calls: unknown[][] = [];
    for (const method of ['paragraph', 'space', 'rule', 'row', 'blank'] as const)
      vi.spyOn(PdfDocument.prototype, method).mockImplementation(((...args: unknown[]) => {
        calls.push([method, ...args]);
      }) as never);
    await renderPdf({ title: 'x', footer: null, blocks: [block] });
    return calls;
  };

  it.each<[Block, unknown[][]]>([
    [{ type: 'title', text: 'T' }, [['paragraph', 'T', STYLES.title, { after: 2 }]]],
    [{ type: 'meta', text: 'M' }, [['paragraph', 'M', STYLES.meta, { after: 8 }]]],
    [
      { type: 'heading', text: 'H' },
      [
        ['space', 14],
        ['paragraph', 'H', STYLES.heading, { after: 2, keepWithNext: 40 }],
        ['rule', VIOLET, 1, 8],
      ],
    ],
    [
      { type: 'subheading', text: 'S' },
      [
        ['space', 8],
        ['paragraph', 'S', STYLES.subheading, { after: 2, keepWithNext: 50 }],
      ],
    ],
    [{ type: 'text', text: 'X' }, [['paragraph', 'X', STYLES.text, { after: 6 }]]],
    [{ type: 'note', text: 'N' }, [['paragraph', 'N', STYLES.note, { after: 4 }]]],
    [{ type: 'bullet', text: 'B' }, [['paragraph', '•  B', STYLES.text, { indent: 8, after: 4 }]]],
    [
      { type: 'source', text: 'U', url: 'https://a.test' },
      [['paragraph', 'U', STYLES.source, { after: 2, link: 'https://a.test' }]],
    ],
    [
      { type: 'blank', label: 'L', value: 'v', wrap: true },
      [['blank', 'L', STYLES.label, width * 0.7, 'v', STYLES.row, true]],
    ],
    [{ type: 'rule' }, [['rule', VIOLET, 1.5, 12]]],
  ])('%j', async (block, expected) => {
    expect(await laidOut(block)).toEqual(expected);
  });
});

describe('the footer of each page', () => {
  const text = async (footer: string | null) =>
    extractText(
      latin1(await renderPdf({ title: 'x', footer, blocks: [{ type: 'text', text: 'hola' }] })),
    );

  it('numbers the pages after its text, when it has one', async () => {
    expect(await text('Pie de página')).toContain('Pie de página · 1 / 1');
    expect(await text(null)).toBe('hola');
  });
});

describe('a character only one font can draw', () => {
  it('is flagged, whichever font lacks it', () => {
    for (const [has, lacks] of [
      [sans, serif],
      [serif, sans],
    ] as const) {
      const original = has.glyphs;
      Object.assign(has, { glyphs: { ...original, '1078': [1, 500] } });
      try {
        expect(unprintable({ name: 'ж', id: '', company: '', place: '' })).toEqual(['name']);
      } finally {
        Object.assign(has, { glyphs: original });
      }
      expect(lacks.glyphs).not.toHaveProperty('1078');
    }
  });
});

describe('the PDF as a download', () => {
  it('is a PDF blob', async () => {
    const blob = await pdfMaker.render({
      title: 'x',
      footer: null,
      blocks: [{ type: 'text', text: 'hola' }],
    });
    expect(blob.type).toBe('application/pdf');
    expect(latin1(new Uint8Array(await blob.arrayBuffer())).startsWith('%PDF-1.7')).toBe(true);
  });
});
