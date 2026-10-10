import { describe, expect, it } from 'vitest';
import { parseReading } from '../src/domain/extraction';
import { mortgageMerge } from '../src/domain/mortgage-merge';
import { MAX_CLAUSES } from '../src/domain/mortgage-schema';
import { f, page } from './support/fields';

// Made-up deeds and documents only.

const merged = (input: Record<string, unknown>) =>
  mortgageMerge(
    parseReading(input, (input['pages'] as readonly unknown[]).length, 'mortgage'),
    input,
  );

const clause = (label: string, text: string) => ({ label, text, confidence: 'high' });

describe('merging a mortgage read', () => {
  it('takes the deed’s capital and rate before the FEIN’s, and says when they differ', () => {
    const { fields, conflicts } = merged({
      pages: [page(1, 'mortgage_deed'), page(2, 'fein')],
      mortgage_deed: { deedOn: f('2021-03-04'), principal: f(200000), initialRate: f(1.9) },
      fein: { deliveredOn: f('2021-02-15'), principal: f(210000), initialRate: f(1.9) },
    });
    expect(fields).toMatchObject({
      deedOn: { value: '2021-03-04', source: 'mortgage_deed' },
      principal: { value: 200000, source: 'mortgage_deed' },
      initialRate: { value: 1.9, source: 'mortgage_deed' },
      feinDeliveredOn: { value: '2021-02-15', source: 'fein' },
    });
    expect(conflicts).toEqual([{ field: 'principal', sources: ['mortgage_deed', 'fein'] }]);
  });

  it('names the dates of the FiAE and of the transparency act apart', () => {
    const { fields } = merged({
      pages: [page(1, 'fiae'), page(2, 'transparency_deed')],
      fiae: { deliveredOn: f('2021-02-15') },
      transparency_deed: { actOn: f('2021-03-03'), amountCharged: f(0) },
    });
    expect(fields).toMatchObject({
      fiaeDeliveredOn: { value: '2021-02-15', source: 'fiae' },
      transparencyActOn: { value: '2021-03-03', source: 'transparency_deed' },
      transparencyActCharged: { value: 0, source: 'transparency_deed' },
    });
  });

  it('keeps every invoice row with the kind of document it came from', () => {
    const { lists } = merged({
      pages: [page(1, 'notary_invoice'), page(2, 'valuation_invoice')],
      notary_invoice: {
        notaryInvoices: [
          { concept: 'loan', total: 640.2, confidence: 'high' },
          { concept: 'purchase', total: 810.4, confidence: 'high' },
        ],
      },
      valuation_invoice: { valuationInvoices: [{ total: 363, confidence: 'medium' }] },
    });
    expect(lists.notaryInvoices?.map((r) => [r.values['concept'], r.source])).toEqual([
      ['loan', 'notary_invoice'],
      ['purchase', 'notary_invoice'],
    ]);
    expect(lists.valuationInvoices?.[0]).toMatchObject({
      source: 'valuation_invoice',
      confidence: 'medium',
    });
  });

  it('drops a clause text that names a person, carries a DNI or tells about health, and keeps its label', () => {
    const result = merged({
      pages: [page(1, 'mortgage_deed')],
      mortgage_deed: {
        lenderName: f('Banco Imaginario, S.A.'),
        clauses: [
          clause('expenses_clause', 'Serán de cuenta de la parte prestataria todos los gastos.'),
          clause('early_termination', 'Con la fianza solidaria de Doña Mengana Inventada.'),
          clause('early_termination', 'Responde D.ª Zutana Ficticia como avalista.'),
          clause('insurance_required', 'La parte prestataria, DNI 12345678A, contrata un seguro.'),
          clause('insurance_required', 'Seguro de vida sin enfermedad previa declarada.'),
          clause('early_termination', 'Responde D. [nombre] como fiador.'),
        ],
      },
    });
    expect(result.lists.clauses?.map((r) => r.values['text'])).toEqual([
      'Serán de cuenta de la parte prestataria todos los gastos.',
      undefined,
      undefined,
      undefined,
      undefined,
      'Responde D. [nombre] como fiador.',
    ]);
    expect(result.lists.clauses?.map((r) => r.values['label'])).toEqual([
      'expenses_clause',
      'early_termination',
      'early_termination',
      'insurance_required',
      'insurance_required',
      'early_termination',
    ]);
    expect(result.fields.lenderName?.value).toBe('Banco Imaginario, S.A.');
    expect(result.discarded).toBe(4);
  });

  it('says the clauses were cut when the model sent as many as the list holds', () => {
    const clauses = (n: number) =>
      Array.from({ length: n }, (_, i) => clause('euribor', `Cláusula ficticia ${i + 1}.`));
    const input = (n: number) => ({
      pages: [page(1, 'mortgage_deed')],
      mortgage_deed: { clauses: clauses(n) },
    });
    expect(merged(input(MAX_CLAUSES)).truncated).toBe(true);
    expect(merged(input(MAX_CLAUSES - 1)).truncated).toBe(false);
  });
});
