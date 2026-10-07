import { deflateSync } from 'node:zlib';

// A hand-built PDF of `pages` A4 pages, each with a grey box: enough for a reader to count and
// draw, and clearly fictitious.
export function syntheticPdf(pages: number): Uint8Array {
  const objects: string[] = [];
  const kids = Array.from({ length: pages }, (_, i) => `${3 + i * 2} 0 R`).join(' ');
  objects.push('<</Type/Catalog/Pages 2 0 R>>');
  objects.push(`<</Type/Pages/Kids[${kids}]/Count ${pages}>>`);
  for (let i = 0; i < pages; i += 1) {
    const content = `0.6 g 50 ${700 - i * 50} 300 80 re f`;
    objects.push(`<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents ${4 + i * 2} 0 R>>`);
    objects.push(`<</Length ${content.length}>>\nstream\n${content}\nendstream`);
  }
  let pdf = '%PDF-1.7\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer<</Root 1 0 R/Size ${objects.length + 1}>>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

// One page whose content stream inflates to `megabytes` of drawing operators: a few hundred
// kilobytes on disk that would keep a reader drawing for minutes.
export function pdfBomb(megabytes: number): Uint8Array {
  const operators = Buffer.alloc(megabytes * 1024 * 1024);
  operators.fill('0 0 m 1 1 l S\n');
  const content = deflateSync(operators, { level: 9 });
  const head = new TextEncoder().encode(
    '%PDF-1.7\n1 0 obj\n<</Type/Catalog/Pages 2 0 R>>\nendobj\n' +
      '2 0 obj\n<</Type/Pages/Kids[3 0 R]/Count 1>>\nendobj\n' +
      '3 0 obj\n<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R>>\nendobj\n' +
      `4 0 obj\n<</Filter/FlateDecode/Length ${content.length}>>\nstream\n`,
  );
  const tail = new TextEncoder().encode(
    '\nendstream\nendobj\ntrailer<</Root 1 0 R/Size 5>>\n%%EOF\n',
  );
  return Buffer.concat([head, content, tail]);
}
