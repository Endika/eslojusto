import { PDFDocument } from 'pdf-lib';
import type { PdfInspector } from '../domain/ports';

export const pdfInspector: PdfInspector = {
  async countPages(bytes) {
    try {
      // Owner-password restrictions are common on payroll PDFs and don't hide the page tree.
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
      return doc.getPageCount();
    } catch {
      return null;
    }
  },
};
