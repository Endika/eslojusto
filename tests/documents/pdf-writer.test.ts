import { describe, expect, it } from 'vitest';
import {
  PdfDocument,
  drawnChars,
  type EmbeddedFont,
  type TextStyle,
} from '../../src/documents/pdf-writer';
import { streams } from '../support/pdf-streams';

// A half-size glyph for each character, a whole size for «W»; a font file of five bytes.
const fontOf = (chars: string, extra: Partial<EmbeddedFont> = {}): EmbeddedFont => ({
  name: 'Tiny',
  unitsPerEm: 2000,
  ascent: 1800,
  descent: -400,
  capHeight: 1400,
  bbox: [0, -400, 2000, 1800],
  glyphs: Object.fromEntries(
    [...chars].map((c, i): [string, [number, number]] => [
      String(c.codePointAt(0)),
      [i + 1, c === 'W' ? 2000 : 1000],
    ]),
  ),
  data: btoa(String.fromCharCode(1, 2, 3, 4, 5)),
  ...extra,
});
const tiny = fontOf(' abc?W');
const make = (footer?: (page: number, total: number) => string, font = tiny) =>
  new PdfDocument({ sans: font, serif: font }, 'Título', footer);
const S: TextStyle = { font: 'sans', size: 10 };

interface Inside {
  readonly pages: readonly { readonly ops: readonly string[]; readonly links: unknown[] }[];
}
const pagesOf = (doc: PdfDocument) => (doc as unknown as Inside).pages;
// Each text as «font size @x y ×characters»; a line or a rule as it is written.
const placed = (doc: PdfDocument) =>
  pagesOf(doc).map((page) =>
    page.ops.map((op) => {
      const m =
        /^BT \/(F\d) ([\d.]+) Tf [\d. ]+ rg (?:2 Tr [\d.]+ w [\d. ]+ RG )?([\d.]+ [\d.]+) Td <([0-9a-f]*)> Tj(?: 0 Tr)? ET$/.exec(
          op,
        );
      return m ? `${m[1]} ${m[2]} @${m[3]} ×${(m[4] ?? '').length / 4}` : op;
    }),
  );
const lineAt = (y: string, to = '160') => `0.4 0.38 0.35 RG 0.6 w 60 ${y} m ${to} ${y} l S`;
const text = (n: number) => 'abc '.repeat(n).trim();

describe('the characters a text is drawn as', () => {
  it('drops direction marks and writes hard spaces and hyphens as plain ones', () => {
    expect(drawnChars('a‎⁦b c d e‑f‐g')).toEqual([...'ab c d e-f-g']);
  });
});

describe('wrapping a text', () => {
  const wrap = (words: string, max: number) => make().wrap(words, S, max);

  it('breaks at spaces, and keeps a line exactly as wide as the room', () => {
    expect(wrap('aa bb', 25)).toEqual(['aa bb']);
    expect(wrap('aa bb', 24)).toEqual(['aa', 'bb']);
  });
  it('breaks a word longer than the room where it must, but never inside a lone letter', () => {
    expect(wrap('aaaaaaaaaaaa', 22)).toEqual(['aaaa', 'aaaa', 'aaaa']);
    expect(wrap('aaaaaaaaaaaa', 20)).toEqual(['aaaa', 'aaaa', 'aaaa']);
    expect(wrap('aaaaaaaaaaaa', 19)).toEqual(['aaa', 'aaa', 'aaa', 'aaa']);
    expect(wrap('W', 5)).toEqual(['W']);
    expect(wrap('WW', 5)).toEqual(['W', 'W']);
  });
});

describe('where the text lands', () => {
  it('links the words of a paragraph, from the indent to the end of the line', () => {
    const doc = make();
    doc.paragraph('abc', S, { indent: 4, link: 'https://a.test' });
    expect(pagesOf(doc)[0]?.links).toEqual([
      { rect: [64, 765.39, 79, 777.39], url: 'https://a.test' },
    ]);
  });
});

describe('the room a line has', () => {
  const lines = (draw: (doc: PdfDocument) => void) => {
    const doc = make();
    draw(doc);
    return placed(doc)[0]?.map((l) => l.replace(/ @.*×/, ' ×'));
  };

  it('is the width of the page less the indent', () => {
    expect(lines((d) => d.paragraph('a'.repeat(95), S))).toEqual(['F1 10 ×95']);
    expect(lines((d) => d.paragraph('a'.repeat(94), S, { indent: 10 }))).toEqual([
      'F1 10 ×93',
      'F1 10 ×1',
    ]);
    expect(lines((d) => d.paragraph('a'.repeat(93), S, { indent: 10 }))).toEqual(['F1 10 ×93']);
  });
  it('is, for the label of a row, what its value and a gap leave', () => {
    const label = (n: number) => `${'a'.repeat(40)} ${'b'.repeat(n - 41)}`;
    const row = (n: number) => lines((d) => d.row(label(n), 'WWWW', S));
    expect(row(83)).toEqual(['F1 10 ×4', 'F1 10 ×83']);
    expect(row(84)).toEqual(['F1 10 ×4', 'F1 10 ×40', 'F1 10 ×43']);
  });
  it('is, for a long value on a line to write on, the line less four points', () => {
    const value = `${'a'.repeat(9)} ${'b'.repeat(10)}`;
    const wrapped = lines((d) => d.blank('l', S, 100, value, S, true));
    expect(wrapped?.slice(0, 2)).toEqual(['F1 10 ×9', 'F1 10 ×10']);
  });
  it('is never wrapped for a value that is not asked to wrap, but shrunk', () => {
    expect(lines((d) => d.blank('l', S, 100, 'W'.repeat(24)))?.[0]).toBe('F1 4 ×24');
  });
  it('moves on from a row by one and four tenths of its size, when the style has no leading', () => {
    const labels = `${'a'.repeat(60)} ${'b'.repeat(60)}`;
    const doc = make();
    doc.row(labels, 'c', S);
    expect(placed(doc)[0]).toEqual([
      'F1 10 @530.28 767.89 ×1',
      'F1 10 @60 767.89 ×60',
      'F1 10 @60 753.89 ×60',
    ]);
  });
  it('leaves room under a line to write on for what comes next', () => {
    const doc = make();
    doc.blank('lab', S, 100, undefined, S);
    doc.paragraph('abc', S);
    expect(placed(doc)[0]?.at(-1)).toBe('F1 10 @60 721.89 ×3');
  });
});

describe('rules and space', () => {
  it('draws a rule across the page and moves on by what it asks for', () => {
    const doc = make();
    doc.rule();
    doc.paragraph('abc', S);
    doc.rule([0.5, 0.25, 1], 1.5, 12);
    doc.space(7);
    doc.paragraph('abc', S);
    expect(placed(doc)).toEqual([
      [
        '0.4 0.38 0.35 RG 0.5 w 60 777.89 m 535.28 777.89 l S',
        'F1 10 @60 757.89 ×3',
        '0.5 0.25 1 RG 1.5 w 60 753.89 m 535.28 753.89 l S',
        'F1 10 @60 724.89 ×3',
      ],
    ]);
  });
});

describe('where a page ends', () => {
  const afterSpace = (points: number, write: (doc: PdfDocument) => void) => {
    const doc = make();
    doc.space(points);
    write(doc);
    return placed(doc);
  };
  const row = (doc: PdfDocument) =>
    doc.row(`${'a'.repeat(60)} ${'b'.repeat(60)}`, 'c', { ...S, leading: 12 });

  it('keeps a line that just fits, and moves one that is a hair over to the next page', () => {
    expect(afterSpace(691.89, (d) => d.paragraph('abc', S))).toEqual([['F1 10 @60 76 ×3']]);
    expect(afterSpace(691.9, (d) => d.paragraph('abc', S))).toEqual([[], ['F1 10 @60 767.89 ×3']]);
  });
  it('asks room for two lines of a long paragraph, not more, and for a single one’s own', () => {
    expect(afterSpace(685.89, (d) => d.paragraph('abc', S))).toEqual([['F1 10 @60 82 ×3']]);
    expect(afterSpace(636, (d) => d.paragraph('abc', S, { keepWithNext: 60 }))).toEqual([
      [],
      ['F1 10 @60 767.89 ×3'],
    ]);
    expect(afterSpace(630, (d) => d.paragraph('abc', S, { keepWithNext: 60 }))).toEqual([
      ['F1 10 @60 137.89 ×3'],
    ]);
  });
  it('splits a paragraph between pages, a line at a time', () => {
    const [first, second] = afterSpace(520, (d) => d.paragraph(text(40), { ...S, size: 40 }));
    expect(first?.map((l) => l.replace(/ ×\d+$/, ''))).toEqual([
      'F1 40 @60 217.89',
      'F1 40 @60 161.89',
      'F1 40 @60 105.89',
    ]);
    expect(second?.map((l) => l.replace(/ ×\d+$/, ''))).toEqual([
      'F1 40 @60 737.89',
      'F1 40 @60 681.89',
      'F1 40 @60 625.89',
      'F1 40 @60 569.89',
    ]);
  });
  it('moves a rule, and the lines of a row, together to the next page when they would not fit', () => {
    expect(afterSpace(700, (d) => d.rule(undefined, undefined, 60))).toEqual([
      [],
      ['0.4 0.38 0.35 RG 0.5 w 60 777.89 m 535.28 777.89 l S'],
    ]);
    expect(afterSpace(690, row)[0]).toEqual([]);
    expect(afterSpace(660, row)[0]).toHaveLength(3);
  });
});

describe('a line to write on', () => {
  const blank = (value: string | undefined, wrap = false, style: TextStyle = S) => {
    const doc = make();
    doc.blank('lab', { font: 'sans', size: 8 }, 100, value, style, wrap);
    return placed(doc);
  };

  it('is a rule with its label under it, and the value above', () => {
    expect(blank('abc')).toEqual([['F1 10 @62 756.89 ×3', lineAt('751.89'), 'F1 8 @60 741.89 ×3']]);
    expect(blank(undefined)).toEqual([[lineAt('751.89'), 'F1 8 @60 741.89 ×3']]);
  });
  it('wraps a long value over as many lines as it needs, the line below the last', () => {
    expect(blank('abc abc abc abc abc abc', true)).toEqual([
      ['F1 10 @62 756.89 ×19', 'F1 10 @62 742.89 ×3', lineAt('737.89'), 'F1 8 @60 727.89 ×3'],
    ]);
    expect(blank('abc abc abc abc abc abc', true, { ...S, leading: 20 })[0]).toEqual([
      'F1 10 @62 756.89 ×19',
      'F1 10 @62 736.89 ×3',
      lineAt('731.89'),
      'F1 8 @60 721.89 ×3',
    ]);
  });
  it('wants room for its extra lines too before it stays on the page', () => {
    const doc = make();
    doc.space(655);
    doc.blank('lab', S, 100, 'abc abc abc abc abc abc', S, true);
    expect(placed(doc)[0]).toEqual([]);
    const fits = make();
    fits.space(655);
    fits.blank('lab', S, 100, 'abc', S);
    expect(placed(fits)[1]).toBeUndefined();
  });
});

describe('the footer', () => {
  it('wraps a footer line by line, ten points apart', async () => {
    const doc = make(() => `${'a'.repeat(130)} b`);
    await doc.save();
    expect(placed(doc)[0]?.map((l) => l.replace(/ ×\d+$/, ''))).toEqual([
      'F1 7.5 @60 42',
      'F1 7.5 @60 32',
    ]);
  });
  it('writes nothing without one', async () => {
    const doc = make();
    await doc.save();
    expect(placed(doc)).toEqual([[]]);
  });
});

describe('the glyphs of a font', () => {
  it('draws a character the font lacks as its question mark, and fails without one', () => {
    expect(make().measure('é', S)).toBe(make().measure('?', S));
    const without = fontOf(' ab');
    expect(() => make(undefined, without).measure('é', S)).toThrow('no fallback glyph');
  });
  it('copies the first text a glyph stood for, even when others share it', async () => {
    const base = fontOf(' ab');
    const aliased = { ...base, glyphs: { ...base.glyphs, '98': [2, 1000] as const } };
    const doc = make(undefined, aliased);
    doc.paragraph('ba', S);
    const maps = streams(Buffer.from(await doc.save()).toString('latin1')).filter((x) =>
      x.data.includes('beginbfchar'),
    );
    expect(maps[0]?.data).toContain('<0002> <0062>');
    expect(maps[0]?.data).not.toContain('<0002> <0061>');
  });
});

describe('the copy map of a font', () => {
  it('lists the glyphs by number, a hundred to a block', async () => {
    const chars = Array.from({ length: 150 }, (_, i) => String.fromCodePoint(0x100 + i));
    const doc = make(undefined, fontOf(chars.join('')));
    doc.paragraph([...chars].reverse().join(''), S);
    const pdf = Buffer.from(await doc.save()).toString('latin1');
    const map = streams(pdf).find((x) => x.data.includes('beginbfchar'))?.data ?? '';
    const blocks = [...map.matchAll(/(\d+) beginbfchar\n([^]*?)\nendbfchar/g)];
    expect(blocks.map((b) => b[1])).toEqual(['100', '50']);
    const entries = blocks.flatMap((b) => (b[2] ?? '').split('\n'));
    expect(entries[0]).toBe('<0001> <0100>');
    expect(entries[149]).toBe('<0096> <0195>');
    expect(entries).toEqual([...entries].sort());
  });
});

describe('links and astral characters', () => {
  it('lists every link of a page, apart by a space', async () => {
    const doc = make();
    doc.paragraph('abc', S, { link: 'https://a.test' });
    doc.paragraph('abc', S, { link: 'https://b.test' });
    const pdf = Buffer.from(await doc.save()).toString('latin1');
    expect(pdf).toContain('>> >> << /Type /Annot /Subtype /Link');
  });
  it('copies a character beyond the basic plane as its two code units', async () => {
    const doc = make(undefined, fontOf(' \u{1F600}'));
    doc.paragraph('\u{1F600}', S);
    const map = streams(Buffer.from(await doc.save()).toString('latin1')).find((x) =>
      x.data.includes('beginbfchar'),
    );
    expect(map?.data).toContain('<0002> <d83dde00>');
  });
});

describe('the file of a document', () => {
  const save = async (doc: PdfDocument) => Buffer.from(await doc.save()).toString('latin1');
  const bold: TextStyle = { font: 'serif', size: 8, bold: true };

  it('is the same file every time: catalog, fonts, pages, links, info and cross-references', async () => {
    const doc = make((n, total) => `${'a'.repeat(n)}${'b'.repeat(total)}`);
    doc.paragraph('abc', S, { link: 'https://a.test' });
    doc.newPage();
    doc.row('ab', 'c', S, bold);
    const pdf = await save(doc);
    const dictionaries = pdf
      .replace(/\/Length \d+/g, '/Length N')
      .replace(
        /(?:\d{10} 00000 n \n)+/,
        (m) => `${m.split('\n').length - 1} entries of «offset» 00000 n\n`,
      )
      .replace(/startxref\n\d+/, 'startxref\nN')
      .replace(/stream\n[^]*?\nendstream/g, 'stream\n…\nendstream');
    expect(dictionaries).toBe(
      [
        '%PDF-1.7',
        '%âãÏÓ',
        '1 0 obj',
        '<< /Type /Catalog /Pages 2 0 R /Lang (es-ES) >>',
        'endobj',
        '2 0 obj',
        '<< /Type /Pages /Kids [14 0 R 16 0 R] /Count 2 >>',
        'endobj',
        '3 0 obj',
        '<<  /Filter /FlateDecode /Length N /Length1 5 >>',
        'stream',
        '…',
        'endstream',
        'endobj',
        '4 0 obj',
        '<< /Type /FontDescriptor /FontName /Tiny /Flags 32 /FontBBox [0 -200 1000 900] /ItalicAngle 0 /Ascent 900 /Descent -200 /CapHeight 700 /StemV 80 /FontFile2 3 0 R >>',
        'endobj',
        '5 0 obj',
        '<< /Type /Font /Subtype /CIDFontType2 /BaseFont /Tiny /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor 4 0 R /W [1 [500] 5 [500] 6 [1000] 2 [500] 3 [500] 4 [500]] /CIDToGIDMap /Identity >>',
        'endobj',
        '6 0 obj',
        '<<  /Filter /FlateDecode /Length N >>',
        'stream',
        '…',
        'endstream',
        'endobj',
        '7 0 obj',
        '<< /Type /Font /Subtype /Type0 /BaseFont /Tiny /Encoding /Identity-H /DescendantFonts [5 0 R] /ToUnicode 6 0 R >>',
        'endobj',
        '8 0 obj',
        '<<  /Filter /FlateDecode /Length N /Length1 5 >>',
        'stream',
        '…',
        'endstream',
        'endobj',
        '9 0 obj',
        '<< /Type /FontDescriptor /FontName /Tiny /Flags 32 /FontBBox [0 -200 1000 900] /ItalicAngle 0 /Ascent 900 /Descent -200 /CapHeight 700 /StemV 80 /FontFile2 8 0 R >>',
        'endobj',
        '10 0 obj',
        '<< /Type /Font /Subtype /CIDFontType2 /BaseFont /Tiny /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor 9 0 R /W [1 [500] 5 [500] 6 [1000] 2 [500] 3 [500] 4 [500]] /CIDToGIDMap /Identity >>',
        'endobj',
        '11 0 obj',
        '<<  /Filter /FlateDecode /Length N >>',
        'stream',
        '…',
        'endstream',
        'endobj',
        '12 0 obj',
        '<< /Type /Font /Subtype /Type0 /BaseFont /Tiny /Encoding /Identity-H /DescendantFonts [10 0 R] /ToUnicode 11 0 R >>',
        'endobj',
        '13 0 obj',
        '<<  /Filter /FlateDecode /Length N >>',
        'stream',
        '…',
        'endstream',
        'endobj',
        '14 0 obj',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 7 0 R /F2 12 0 R >> >> /Contents 13 0 R /Annots [<< /Type /Annot /Subtype /Link /Rect [60 765.39 75 777.39] /Border [0 0 0] /A << /S /URI /URI (https://a.test) >> >>] >>',
        'endobj',
        '15 0 obj',
        '<<  /Filter /FlateDecode /Length N >>',
        'stream',
        '…',
        'endstream',
        'endobj',
        '16 0 obj',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 7 0 R /F2 12 0 R >> >> /Contents 15 0 R >>',
        'endobj',
        '17 0 obj',
        '<< /Title <FEFF005400ED00740075006C006F> /Producer (eslojusto.es) >>',
        'endobj',
        'xref',
        '0 18',
        '0000000000 65535 f ',
        '17 entries of «offset» 00000 n',
        'trailer',
        '<< /Size 18 /Root 1 0 R /Info 17 0 R >>',
        'startxref',
        'N',
        '%%EOF',
      ].join('\n') + '\n',
    );
    expect(streams(pdf).map((x) => x.data)).toEqual([
      '\x01\x02\x03\x04\x05',
      '/CIDInit /ProcSet findresource begin 12 dict begin begincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def /CMapType 2 def\n1 begincodespacerange <0000> <FFFF> endcodespacerange\n3 beginbfchar\n<0002> <0061>\n<0003> <0062>\n<0004> <0063>\nendbfchar\nendcmap CMapName currentdict /CMap defineresource pop end end',
      '\x01\x02\x03\x04\x05',
      '/CIDInit /ProcSet findresource begin 12 dict begin begincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def /CMapType 2 def\n1 begincodespacerange <0000> <FFFF> endcodespacerange\n1 beginbfchar\n<0004> <0063>\nendbfchar\nendcmap CMapName currentdict /CMap defineresource pop end end',
      [
        'BT /F1 10 Tf 0.09 0.08 0.06 rg 60 767.89 Td <000200030004> Tj ET',
        'BT /F1 7.5 Tf 0.4 0.38 0.35 rg 60 42 Td <000200030003> Tj ET',
      ].join('\n'),
      [
        'BT /F2 8 Tf 0.09 0.08 0.06 rg 2 Tr 0.28 w 0.09 0.08 0.06 RG 531.28 767.89 Td <0004> Tj 0 Tr ET',
        'BT /F1 10 Tf 0.09 0.08 0.06 rg 60 767.89 Td <00020003> Tj ET',
        'BT /F1 7.5 Tf 0.4 0.38 0.35 rg 60 42 Td <0002000200030003> Tj ET',
      ].join('\n'),
    ]);
  });
});
