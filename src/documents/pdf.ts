import type { CivilDate } from '../engine/date';
import type { Translate } from '../i18n/client';
import { sans } from './fonts/sans';
import { serif } from './fonts/serif';
import { INK, PdfDocument, SOFT, type Rgb, type TextStyle } from './pdf-writer';
import type { PdfMaker } from './ports';
import { letterModel, reportModel, type DocumentModel } from './report';

// Loaded only when a person with a pass asks for a PDF: the fonts and the writer stay out of the
// page until then.

const VIOLET: Rgb = [0.478, 0.247, 0.82];
const STYLES = {
  title: { font: 'sans', size: 22, bold: true, leading: 28 },
  meta: { font: 'sans', size: 9, color: SOFT },
  heading: { font: 'sans', size: 14, bold: true, leading: 20 },
  subheading: { font: 'sans', size: 11.5, bold: true, leading: 16 },
  text: { font: 'serif', size: 10.5, leading: 15 },
  note: { font: 'serif', size: 9, color: SOFT, leading: 12.5 },
  row: { font: 'sans', size: 10, leading: 15 },
  source: { font: 'sans', size: 8.5, color: VIOLET, leading: 12 },
  label: { font: 'sans', size: 8.5, color: SOFT },
} satisfies Record<string, TextStyle>;

export async function renderPdf(model: DocumentModel): Promise<Uint8Array> {
  const { footer } = model;
  const doc = new PdfDocument(
    { sans, serif },
    model.title,
    footer === null ? undefined : (n, total) => `${footer} · ${n} / ${total}`,
  );
  for (const block of model.blocks) {
    switch (block.type) {
      case 'title':
        doc.paragraph(block.text, STYLES.title, { after: 2 });
        break;
      case 'meta':
        doc.paragraph(block.text, STYLES.meta, { after: 8 });
        break;
      case 'heading':
        doc.space(14);
        doc.paragraph(block.text, STYLES.heading, { after: 2, keepWithNext: 40 });
        doc.rule(VIOLET, 1, 8);
        break;
      case 'subheading':
        doc.space(8);
        doc.paragraph(block.text, STYLES.subheading, { after: 2, keepWithNext: 50 });
        break;
      case 'text':
        doc.paragraph(block.text, STYLES.text, { after: 6 });
        break;
      case 'note':
        doc.paragraph(block.text, STYLES.note, { after: 4 });
        break;
      case 'row':
        doc.row(
          block.label,
          block.value,
          { ...STYLES.row, color: SOFT },
          { ...STYLES.row, color: INK },
        );
        break;
      case 'bullet':
        doc.paragraph(`•  ${block.text}`, STYLES.text, { indent: 8, after: 4 });
        break;
      case 'source':
        doc.paragraph(block.text, STYLES.source, { after: 2, link: block.url });
        break;
      case 'blank':
        doc.blank(block.label, STYLES.label, doc.width * 0.7);
        break;
      case 'rule':
        doc.rule(VIOLET, 1.5, 12);
        break;
    }
  }
  return doc.save();
}

const asBlob = (bytes: Uint8Array) => new Blob([bytes as BlobPart], { type: 'application/pdf' });

export function pdfMaker(tr: Translate, today: () => CivilDate): PdfMaker {
  return {
    report: async (r) => asBlob(await renderPdf(reportModel(r, tr, today()))),
    letter: async (r) => asBlob(await renderPdf(letterModel(r, tr))),
  };
}
