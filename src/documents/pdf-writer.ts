// A small PDF writer for text documents: A4 pages, two embedded TrueType subsets (Type0 fonts with
// Identity-H encoding and a ToUnicode map, so text can be copied and searched), wrapped
// paragraphs, rules and link annotations. Everything happens in the browser; nothing is fetched.

export interface EmbeddedFont {
  readonly name: string;
  readonly unitsPerEm: number;
  readonly ascent: number;
  readonly descent: number;
  readonly capHeight: number;
  readonly bbox: readonly [number, number, number, number];
  // Code point → [glyph id in the subset, advance width in font units].
  readonly glyphs: Readonly<Record<string, readonly [number, number]>>;
  // The subset as a TrueType file, base64.
  readonly data: string;
}

export type FontName = 'sans' | 'serif';
export type Rgb = readonly [number, number, number];

export interface TextStyle {
  readonly font: FontName;
  readonly size: number;
  readonly bold?: boolean;
  readonly color?: Rgb;
  readonly leading?: number;
}

export const INK: Rgb = [0.086, 0.075, 0.059];
export const SOFT: Rgb = [0.4, 0.38, 0.35];

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = { top: 64, right: 60, bottom: 72, left: 60 };

// Characters the subsets lack, written as the closest one they have.
const SUBSTITUTES: Readonly<Record<string, string>> = {
  '\u00a0': ' ',
  '\u202f': ' ',
  '\u2009': ' ',
  '\u2011': '-',
  '\u2010': '-',
};
const INVISIBLE = /[\u200e\u200f\u2066-\u2069]/g;

const fmt = (n: number) => (Math.round(n * 100) / 100).toString();
const color = ([r, g, b]: Rgb) => `${fmt(r)} ${fmt(g)} ${fmt(b)}`;

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

const latin1 = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);

// A PDF text string: plain when it is ASCII, otherwise UTF-16BE with its byte-order mark.
export function pdfString(s: string): string {
  if (/^[\x20-\x7e]*$/.test(s)) return `(${s.replace(/[\\()]/g, (c) => `\\${c}`)})`;
  let hex = 'FEFF';
  for (const unit of s.split('').map((c) => c.charCodeAt(0)))
    hex += unit.toString(16).padStart(4, '0').toUpperCase();
  return `<${hex}>`;
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

interface FontState {
  readonly font: EmbeddedFont;
  readonly resource: string;
  // Glyph id → the text it stands for, for the ToUnicode map.
  readonly used: Map<number, string>;
}

interface Link {
  readonly rect: readonly [number, number, number, number];
  readonly url: string;
}

interface Page {
  readonly ops: string[];
  readonly links: Link[];
}

export class PdfDocument {
  readonly width = A4.width - MARGIN.left - MARGIN.right;
  private readonly fonts: Record<FontName, FontState>;
  private readonly pages: Page[] = [];
  private y = 0;

  constructor(
    fonts: Record<FontName, EmbeddedFont>,
    private readonly title: string,
    private readonly footer?: (page: number, total: number) => string,
  ) {
    this.fonts = {
      sans: { font: fonts.sans, resource: 'F1', used: new Map() },
      serif: { font: fonts.serif, resource: 'F2', used: new Map() },
    };
    this.newPage();
  }

  get pageCount(): number {
    return this.pages.length;
  }

  private get page(): Page {
    const page = this.pages[this.pages.length - 1];
    if (!page) throw new Error('No page');
    return page;
  }

  newPage(): void {
    this.pages.push({ ops: [], links: [] });
    this.y = MARGIN.top;
  }

  // The glyph a character is drawn with, and the character that glyph stands for: a character
  // the subset lacks, a code point beyond the BMP among them, is drawn and copied as «?».
  private glyph(state: FontState, ch: string): { glyph: readonly [number, number]; text: string } {
    const g = state.font.glyphs[String(ch.codePointAt(0))];
    if (g) return { glyph: g, text: ch };
    const fallback = state.font.glyphs[String('?'.codePointAt(0))];
    if (!fallback) throw new Error('The font has no fallback glyph');
    return { glyph: fallback, text: '?' };
  }

  private chars(text: string): string[] {
    return [...text.replace(INVISIBLE, '')].map((c) => SUBSTITUTES[c] ?? c);
  }

  measure(text: string, style: TextStyle): number {
    const state = this.fonts[style.font];
    const units = this.chars(text).reduce((sum, c) => sum + this.glyph(state, c).glyph[1], 0);
    return (units / state.font.unitsPerEm) * style.size;
  }

  // Lines no wider than `max`: words break only at plain spaces, so a «1.234,56 €» with its
  // no-break space stays whole; a word longer than a line (a URL) breaks where it must.
  wrap(text: string, style: TextStyle, max: number): string[] {
    const lines: string[] = [];
    for (const paragraph of text.split('\n')) {
      let line = '';
      for (const word of paragraph.split(' ')) {
        const candidate = line ? `${line} ${word}` : word;
        if (this.measure(candidate, style) <= max || !line) {
          line = candidate;
        } else {
          lines.push(line);
          line = word;
        }
        while (this.measure(line, style) > max && line.length > 1) {
          let cut = line.length - 1;
          while (cut > 1 && this.measure(line.slice(0, cut), style) > max) cut--;
          lines.push(line.slice(0, cut));
          line = line.slice(cut);
        }
      }
      lines.push(line);
    }
    return lines;
  }

  private encode(state: FontState, text: string): string {
    let hex = '';
    for (const c of this.chars(text)) {
      const { glyph, text: shown } = this.glyph(state, c);
      const [gid] = glyph;
      if (!state.used.has(gid)) state.used.set(gid, shown);
      hex += gid.toString(16).padStart(4, '0');
    }
    return `<${hex}>`;
  }

  // Draws one line at (x, y from the top of the page) without moving the flow.
  textAt(text: string, x: number, top: number, style: TextStyle, page: Page = this.page): void {
    const state = this.fonts[style.font];
    const ink = color(style.color ?? INK);
    const bold = style.bold ? `2 Tr ${fmt(style.size * 0.035)} w ${ink} RG ` : '';
    const at = `${fmt(MARGIN.left + x)} ${fmt(A4.height - top)}`;
    page.ops.push(
      `BT /${state.resource} ${fmt(style.size)} Tf ${ink} rg ${bold}${at} Td ${this.encode(state, text)} Tj${style.bold ? ' 0 Tr' : ''} ET`,
    );
  }

  private ensure(height: number): void {
    if (this.y + height > A4.height - MARGIN.bottom) this.newPage();
  }

  // A wrapped paragraph in the flow. `keepWithNext` moves it to a new page with room for that much more.
  paragraph(
    text: string,
    style: TextStyle,
    options: { indent?: number; after?: number; link?: string; keepWithNext?: number } = {},
  ): void {
    const indent = options.indent ?? 0;
    const leading = style.leading ?? style.size * 1.4;
    const lines = this.wrap(text, style, this.width - indent);
    this.ensure(Math.min(lines.length, 2) * leading + (options.keepWithNext ?? 0));
    for (const line of lines) {
      this.ensure(leading);
      const top = this.y + style.size;
      this.textAt(line, indent, top, style);
      if (options.link) {
        const w = this.measure(line, style);
        const bottom = A4.height - top - style.size * 0.25;
        this.page.links.push({
          rect: [MARGIN.left + indent, bottom, MARGIN.left + indent + w, bottom + style.size * 1.2],
          url: options.link,
        });
      }
      this.y += leading;
    }
    this.y += options.after ?? 0;
  }

  // Two cells on one line: a label and, aligned to the right edge, its value.
  row(label: string, value: string, style: TextStyle, valueStyle: TextStyle = style): void {
    const leading = style.leading ?? style.size * 1.4;
    const valueWidth = this.measure(value, valueStyle);
    const labelLines = this.wrap(label, style, this.width - valueWidth - 16);
    this.ensure(labelLines.length * leading);
    const top = this.y + style.size;
    this.textAt(value, this.width - valueWidth, top, valueStyle);
    for (const line of labelLines) {
      this.textAt(line, 0, this.y + style.size, style);
      this.y += leading;
    }
  }

  rule(rgb: Rgb = SOFT, weight = 0.5, after = 10): void {
    this.ensure(after);
    const y = A4.height - this.y;
    this.page.ops.push(
      `${color(rgb)} RG ${fmt(weight)} w ${MARGIN.left} ${fmt(y)} m ${fmt(MARGIN.left + this.width)} ${fmt(y)} l S`,
    );
    this.y += after;
  }

  space(points: number): void {
    this.y += points;
  }

  // A blank line to write on by hand, with its label under it. With `wrap`, a long value takes
  // as many lines above it as it needs.
  blank(
    label: string,
    style: TextStyle,
    width = this.width,
    value?: string,
    valueStyle: TextStyle = style,
    wrap = false,
  ): void {
    const lines = value && wrap ? this.wrap(value, valueStyle, width - 4) : null;
    const leading = valueStyle.leading ?? valueStyle.size * 1.4;
    const extra = lines ? (lines.length - 1) * leading : 0;
    this.ensure(42 + extra);
    this.y += 26 + extra;
    if (lines)
      lines.forEach((line, i) =>
        this.textAt(line, 2, this.y - 5 - (lines.length - 1 - i) * leading, valueStyle),
      );
    else if (value) {
      // A long value shrinks to fit on its line rather than cross the margin.
      const room = width - 4;
      const measured = this.measure(value, valueStyle);
      const fitted =
        measured > room ? { ...valueStyle, size: (valueStyle.size * room) / measured } : valueStyle;
      this.textAt(value, 2, this.y - 5, fitted);
    }
    const y = A4.height - this.y;
    this.page.ops.push(
      `${color(SOFT)} RG 0.6 w ${MARGIN.left} ${fmt(y)} m ${fmt(MARGIN.left + width)} ${fmt(y)} l S`,
    );
    this.y += 2;
    this.paragraph(label, style, { after: 4 });
  }

  async save(): Promise<Uint8Array> {
    const total = this.pages.length;
    if (this.footer) {
      const style: TextStyle = { font: 'sans', size: 7.5, color: SOFT };
      this.pages.forEach((page, i) =>
        this.wrap(this.footer?.(i + 1, total) ?? '', style, this.width).forEach((line, j) =>
          this.textAt(line, 0, A4.height - MARGIN.bottom + 30 + j * 10, style, page),
        ),
      );
    }

    const objects: (Uint8Array | string)[] = [];
    const add = (body: Uint8Array | string): number => objects.push(body);
    const stream = async (dict: string, raw: Uint8Array, extra = '') => {
      const packed = await deflate(raw);
      const head = latin1(
        `<< ${dict} /Filter /FlateDecode /Length ${packed.length}${extra} >>\nstream\n`,
      );
      const tail = latin1('\nendstream');
      const body = new Uint8Array(head.length + packed.length + tail.length);
      body.set(head);
      body.set(packed, head.length);
      body.set(tail, head.length + packed.length);
      return body;
    };

    const catalog = add('');
    const pagesId = add('');
    const fontIds: Record<string, number> = {};
    for (const state of Object.values(this.fonts)) {
      const { font } = state;
      const scale = 1000 / font.unitsPerEm;
      const bytes = base64ToBytes(font.data);
      const fileId = add(await stream('', bytes, ` /Length1 ${bytes.length}`));
      const descriptor = add(
        `<< /Type /FontDescriptor /FontName /${font.name} /Flags 32 /FontBBox [${font.bbox.map((n) => Math.round(n * scale)).join(' ')}] /ItalicAngle 0 /Ascent ${Math.round(font.ascent * scale)} /Descent ${Math.round(font.descent * scale)} /CapHeight ${Math.round(font.capHeight * scale)} /StemV 80 /FontFile2 ${fileId} 0 R >>`,
      );
      const widths = Object.values(font.glyphs)
        .map(([gid, w]) => `${gid} [${Math.round(w * scale)}]`)
        .join(' ');
      const cid = add(
        `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${font.name} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${descriptor} 0 R /W [${widths}] /CIDToGIDMap /Identity >>`,
      );
      const entries = [...state.used.entries()]
        .sort(([a], [b]) => a - b)
        .map(([gid, text]) => {
          // UTF-16 code units, so a pair of surrogates stays a valid ToUnicode entry.
          const code = Array.from({ length: text.length }, (_, k) =>
            text.charCodeAt(k).toString(16).padStart(4, '0'),
          ).join('');
          return `<${gid.toString(16).padStart(4, '0')}> <${code}>`;
        });
      const cmap = [
        '/CIDInit /ProcSet findresource begin 12 dict begin begincmap',
        '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def',
        '/CMapName /Adobe-Identity-UCS def /CMapType 2 def',
        '1 begincodespacerange <0000> <FFFF> endcodespacerange',
        ...Array.from({ length: Math.ceil(entries.length / 100) }, (_, i) => {
          const chunk = entries.slice(i * 100, i * 100 + 100);
          return `${chunk.length} beginbfchar\n${chunk.join('\n')}\nendbfchar`;
        }),
        'endcmap CMapName currentdict /CMap defineresource pop end end',
      ].join('\n');
      const toUnicode = add(await stream('', latin1(cmap)));
      fontIds[state.resource] = add(
        `<< /Type /Font /Subtype /Type0 /BaseFont /${font.name} /Encoding /Identity-H /DescendantFonts [${cid} 0 R] /ToUnicode ${toUnicode} 0 R >>`,
      );
    }
    const fontDict = Object.entries(fontIds)
      .map(([name, id]) => `/${name} ${id} 0 R`)
      .join(' ');

    const pageIds: number[] = [];
    for (const page of this.pages) {
      const content = add(await stream('', latin1(page.ops.join('\n'))));
      const annots = page.links.map(
        ({ rect, url }) =>
          `<< /Type /Annot /Subtype /Link /Rect [${rect.map(fmt).join(' ')}] /Border [0 0 0] /A << /S /URI /URI ${pdfString(url)} >> >>`,
      );
      pageIds.push(
        add(
          `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${A4.width} ${A4.height}] /Resources << /Font << ${fontDict} >> >> /Contents ${content} 0 R${annots.length ? ` /Annots [${annots.join(' ')}]` : ''} >>`,
        ),
      );
    }
    objects[pagesId - 1] =
      `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
    objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R /Lang (es-ES) >>`;
    const info = add(`<< /Title ${pdfString(this.title)} /Producer (eslojusto.es) >>`);

    const chunks: Uint8Array[] = [latin1('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n')];
    let offset = chunks[0]?.length ?? 0;
    const offsets: number[] = [];
    objects.forEach((body, i) => {
      offsets.push(offset);
      const head = latin1(`${i + 1} 0 obj\n`);
      const bytes = typeof body === 'string' ? latin1(body) : body;
      const tail = latin1('\nendobj\n');
      chunks.push(head, bytes, tail);
      offset += head.length + bytes.length + tail.length;
    });
    const xref = [
      'xref',
      `0 ${objects.length + 1}`,
      '0000000000 65535 f ',
      ...offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n `),
      'trailer',
      `<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>`,
      'startxref',
      String(offset),
      '%%EOF',
    ].join('\n');
    chunks.push(latin1(`${xref}\n`));
    const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
    let at = 0;
    for (const c of chunks) {
      out.set(c, at);
      at += c.length;
    }
    return out;
  }
}
