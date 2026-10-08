import { sans } from './fonts/sans';
import { serif } from './fonts/serif';
import { INK, PdfDocument, SOFT, type Rgb, type TextStyle } from './pdf-writer';
import { ALL_LETTER_FIELDS, type LetterField, type TypedDetails } from './letter';
import type { DocumentModel, PdfMaker } from './ports';

// Loaded only when a person with a pass asks for a PDF: the fonts and the writer stay out of the
// page until then.

const VIOLET: Rgb = [0.478, 0.247, 0.82];
export const STYLES = {
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
        doc.blank(
          block.label,
          STYLES.label,
          doc.width * 0.7,
          block.value,
          STYLES.row,
          block.wrap === true,
        );
        break;
      case 'rule':
        doc.rule(VIOLET, 1.5, 12);
        break;
    }
  }
  return doc.save();
}

// The letter's own fields whose text has a character neither font can draw; their lines stay blank.
export function unprintable(details: TypedDetails): LetterField[] {
  const drawable = (text: string) =>
    [...text.normalize('NFC')].every((c) => {
      const code = String(c.codePointAt(0));
      return code in sans.glyphs && code in serif.glyphs;
    });
  return ALL_LETTER_FIELDS.filter((f) => !drawable(details[f] ?? ''));
}

const asBlob = (bytes: Uint8Array) => new Blob([bytes as BlobPart], { type: 'application/pdf' });

export const pdfMaker: PdfMaker = {
  render: async (model) => asBlob(await renderPdf(model)),
  unprintable,
};
