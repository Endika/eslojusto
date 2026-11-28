import { inflateSync } from 'node:zlib';

// Every stream of a PDF, inflated, with its dictionary.
export function streams(pdf: string): { dict: string; data: string }[] {
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
