import { describe, expect, it } from 'vitest';
import { conflictLines, recognisedLine } from '../../src/documents/summary';
import { tr } from './fixtures';

describe('recognisedLine', () => {
  it('names each document, counts pages when more than one, and joins the useless ones', () => {
    expect(
      recognisedLine(
        [
          { kind: 'other', pages: 1 },
          { kind: 'settlement_agreement', pages: 2 },
          { kind: 'payslip', pages: 1 },
          { kind: 'work_history', pages: 3 },
          { kind: 'other', pages: 2 },
        ],
        tr,
      ),
    ).toBe(
      'Acuerdo o acta de conciliación (2 páginas) · Nómina · Vida laboral (3 páginas) · 3 páginas sin datos útiles',
    );
    expect(recognisedLine([], tr)).toBe('');
  });
});

describe('conflictLines', () => {
  it('names the field and the document used, and skips anything it cannot word', () => {
    expect(
      conflictLines(
        [
          { field: 'severance', sources: ['settlement_proposal', 'payslip'] },
          { field: 'payslipTotalAccrued', sources: ['payslip'] },
        ],
        tr,
      ),
    ).toEqual([
      'Indemnización: los documentos no dicen lo mismo. Se ha usado lo que pone la propuesta de finiquito; compáralo con los demás.',
    ]);
  });
});
