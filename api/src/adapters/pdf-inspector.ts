import { inflateSync } from 'node:zlib';
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  type PDFObject,
} from 'pdf-lib';
import type { PdfFacts, PdfInspector } from '../domain/ports';

// A 4-page payslip has a few hundred objects; past this, parsing costs more than it is worth.
export const MAX_RAW_OBJECTS = 5000;
// Decoded text-bearing streams, all together; a zip bomb stops here.
export const MAX_DECODED_BYTES = 8 * 1024 * 1024;
// Objects pdf-lib may unpack from object streams, which the raw scan can't see into.
export const MAX_PARSED_OBJECTS = 20_000;

const latin1 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('latin1');

// The page count must be the one every reader sees, so anything a parser could read two ways
// is refused: bytes after the last %%EOF, an object defined twice within one revision, or a
// page tree whose /Count disagrees with any page object or /Count in the file.
export function rawProblems(text: string): boolean {
  const eof = text.lastIndexOf('%%EOF');
  if (eof < 0 || text.slice(eof + 5).trim() !== '') return true;
  const revisions = text.split('%%EOF');
  let objects = 0;
  for (const revision of revisions) {
    const seen = new Set<string>();
    for (const m of revision.matchAll(/(?<![\d.])(\d+)\s+(\d+)\s+obj\b/g)) {
      objects += 1;
      const id = `${m[1]} ${m[2]}`;
      if (seen.has(id)) return true;
      seen.add(id);
    }
  }
  return objects > MAX_RAW_OBJECTS;
}

// Every page tree and page object written in the bytes, as a sequential parser would find
// them; an object redefined by a later revision (a signature, say) counts once.
function rawPageCounts(text: string): { readonly maxCount: number; readonly pageObjects: number } {
  let maxCount = 0;
  const pageIds = new Set<string>();
  for (const m of text.matchAll(/(?<![\d.])(\d+)\s+(\d+)\s+obj\b([\s\S]*?)endobj/g)) {
    const body = m[3] ?? '';
    if (/\/Type\s*\/Pages(?![A-Za-z])/.test(body))
      for (const c of body.matchAll(/\/Count\s+(\d+)/g))
        maxCount = Math.max(maxCount, Number(c[1]));
    else if (/\/Type\s*\/Page(?![A-Za-z])/.test(body)) pageIds.add(`${m[1]} ${m[2]}`);
  }
  return { maxCount, pageObjects: pageIds.size };
}

// Bytes inside string operands: what a text extractor can turn into tokens.
export function stringBytes(content: string): number {
  let total = 0;
  for (let i = 0; i < content.length; i += 1) {
    const c = content[i];
    if (c === '%') {
      while (i < content.length && content[i] !== '\n' && content[i] !== '\r') i += 1;
    } else if (c === '(') {
      let depth = 1;
      for (i += 1; i < content.length && depth > 0; i += 1) {
        const d = content[i];
        if (d === '\\') i += 1;
        else if (d === '(') depth += 1;
        else if (d === ')') depth -= 1;
        if (depth > 0) total += 1;
      }
      i -= 1;
    } else if (c === '<' && content[i + 1] !== '<') {
      let digits = 0;
      for (i += 1; i < content.length && content[i] !== '>'; i += 1)
        if (/[0-9A-Fa-f]/.test(content[i] ?? '')) digits += 1;
      total += Math.ceil(digits / 2);
    } else if (c === '<') {
      i += 1;
    }
  }
  return total;
}

// ASCII filters only shrink their input, so they can't hide a stream's size.
export function asciiHexDecode(input: Uint8Array): Uint8Array {
  const digits = latin1(input).split('>')[0]?.replace(/\s+/g, '') ?? '';
  if (/[^0-9A-Fa-f]/.test(digits)) throw new Error('ASCIIHexDecode');
  return Buffer.from(digits.length % 2 ? `${digits}0` : digits, 'hex');
}

export function ascii85Decode(input: Uint8Array): Uint8Array {
  const text = (latin1(input).split('~>')[0] ?? '').replace(/\s+/g, '').replace(/^<~/, '');
  const out: number[] = [];
  let group: number[] = [];
  const flush = (n: number) => {
    let value = 0;
    for (const c of group) value = value * 85 + c;
    const bytes = [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
    out.push(...bytes.slice(0, n));
  };
  for (const ch of text) {
    if (ch === 'z' && group.length === 0) {
      out.push(0, 0, 0, 0);
      continue;
    }
    const c = ch.charCodeAt(0) - 33;
    if (c < 0 || c > 84) throw new Error('ASCII85Decode');
    group.push(c);
    if (group.length === 5) {
      flush(4);
      group = [];
    }
  }
  if (group.length === 1) throw new Error('ASCII85Decode');
  if (group.length > 0) {
    const n = group.length - 1;
    while (group.length < 5) group.push(84);
    flush(n);
  }
  return Uint8Array.from(out);
}

const name = (dict: PDFDict, key: string): string | undefined => {
  const v = dict.get(PDFName.of(key));
  return v instanceof PDFName ? v.decodeText() : undefined;
};

const refsUnder = (dict: PDFDict, keys: readonly string[]): PDFRef[] =>
  keys.map((k) => dict.get(PDFName.of(k))).filter((v): v is PDFRef => v instanceof PDFRef);

function filters(dict: PDFDict): string[] | null {
  const f = dict.get(PDFName.of('Filter'));
  if (f === undefined) return [];
  if (f instanceof PDFName) return [f.decodeText()];
  if (f instanceof PDFArray) {
    const names = f.asArray().map((v) => (v instanceof PDFName ? v.decodeText() : null));
    return names.every((n) => n !== null) ? (names as string[]) : null;
  }
  return null;
}

// Streams Claude reads text from: everything but images, fonts and the file's own plumbing.
function isTextBearing(stream: PDFRawStream, skipped: ReadonlySet<PDFRef>, ref: PDFRef): boolean {
  if (skipped.has(ref)) return false;
  const { dict } = stream;
  const type = name(dict, 'Type');
  if (type && ['XRef', 'ObjStm', 'Metadata', 'EmbeddedFile', 'CMap'].includes(type)) return false;
  if (name(dict, 'Subtype') === 'Image') return false;
  // ICC profiles and font programs.
  return !['N', 'Length1', 'Length2', 'Length3'].some((k) => dict.has(PDFName.of(k)));
}

function textBytes(entries: readonly [PDFRef, PDFObject][]): number | null {
  const skipped = new Set<PDFRef>();
  for (const [, object] of entries) {
    if (!(object instanceof PDFDict)) continue;
    for (const ref of refsUnder(object, ['FontFile', 'FontFile2', 'FontFile3', 'ToUnicode']))
      skipped.add(ref);
  }
  let decoded = 0;
  let total = 0;
  for (const [ref, object] of entries) {
    if (!(object instanceof PDFRawStream) || !isTextBearing(object, skipped, ref)) continue;
    const chain = filters(object.dict);
    if (chain === null) return null;
    let content: Uint8Array = object.contents;
    try {
      for (const filter of chain) {
        if (filter === 'FlateDecode')
          content = inflateSync(content, { maxOutputLength: MAX_DECODED_BYTES - decoded });
        else if (filter === 'ASCII85Decode') content = ascii85Decode(content);
        else if (filter === 'ASCIIHexDecode') content = asciiHexDecode(content);
        // Any other filter on text could hide its size.
        else return null;
      }
    } catch {
      return null;
    }
    decoded += content.length;
    total += stringBytes(latin1(content));
  }
  return total;
}

// pdf-lib reports parse trouble on the console; output there means an ambiguous file, and it
// must never reach the logs.
async function silenced<T>(run: () => Promise<T>): Promise<{ result: T; noisy: boolean }> {
  const methods = ['log', 'warn', 'error', 'info', 'debug'] as const;
  const saved = methods.map((m) => console[m]);
  let noisy = false;
  const capture = () => {
    noisy = true;
  };
  for (const m of methods) console[m] = capture;
  try {
    return { result: await run(), noisy };
  } finally {
    methods.forEach((m, i) => {
      console[m] = saved[i] as (typeof console)[typeof m];
    });
  }
}

async function inspect(bytes: Uint8Array): Promise<PdfFacts | null> {
  const text = latin1(bytes);
  if (rawProblems(text)) return null;
  const doc = await PDFDocument.load(bytes, {
    ignoreEncryption: false,
    throwOnInvalidObject: true,
    updateMetadata: false,
  });
  const pages = doc.getPageCount();
  const count = doc.catalog.Pages().get(PDFName.of('Count'));
  const entries = doc.context.enumerateIndirectObjects();
  if (entries.length > MAX_PARSED_OBJECTS) return null;
  const parsedPageObjects = entries.filter(
    ([, o]) =>
      (o instanceof PDFDict || o instanceof PDFRawStream) &&
      name(o instanceof PDFDict ? o : o.dict, 'Type') === 'Page',
  ).length;
  const raw = rawPageCounts(text);
  if (
    pages === 0 ||
    !(count instanceof PDFNumber) ||
    count.asNumber() !== pages ||
    parsedPageObjects !== pages ||
    raw.maxCount > pages ||
    raw.pageObjects > pages
  )
    return null;
  const bytesOfText = textBytes(entries);
  return bytesOfText === null ? null : { pages, textBytes: bytesOfText };
}

export const pdfInspector: PdfInspector = {
  async inspect(bytes) {
    try {
      const { result, noisy } = await silenced(() => inspect(bytes));
      return noisy ? null : result;
    } catch {
      return null;
    }
  },
};
