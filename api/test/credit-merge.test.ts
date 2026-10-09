import { describe, expect, it } from 'vitest';
import { CREDIT_MERGE_RULES, creditMerge } from '../src/domain/credit-merge';
import { CREDIT_SECTIONS } from '../src/domain/credit-schema';
import { parseReading } from '../src/domain/extraction';
import { f, page } from './support/fields';

const pack = (input: Record<string, unknown>, pages: number) =>
  creditMerge(parseReading(input, pages, 'credit'), input);

const row = (values: Record<string, unknown>) => ({ ...values, confidence: 'high' });
const agreementAndInfo = [page(1, 'credit_agreement'), page(2, 'credit_precontract_info')];

describe('creditMerge', () => {
  it('merges every field of every credit document, the information sheet’s date renamed', () => {
    const fields = Object.values(CREDIT_SECTIONS).flatMap((s) => Object.keys(s.fields));
    const merged = new Set(Object.keys(CREDIT_MERGE_RULES));
    for (const name of fields)
      if (name !== 'deliveredOn' && name !== 'representativeExample')
        expect(merged).toContain(name);
    expect(merged).toContain('precontractDeliveredOn');
    expect(merged).not.toContain('representativeExample');
  });

  it('takes the contract’s figures first and flags an information sheet that states others', () => {
    const m = pack(
      {
        pages: agreementAndInfo,
        credit_agreement: { principal: f(10500), declaredApr: f(12) },
        credit_precontract_info: {
          deliveredOn: f('2019-02-01'),
          representativeExample: f(false),
          declaredApr: f(16.61),
          instalmentCount: f(48),
        },
      },
      2,
    );
    expect(m.fields).toEqual({
      principal: { ...f(10500), source: 'credit_agreement' },
      declaredApr: { ...f(12), source: 'credit_agreement' },
      instalmentCount: { ...f(48), source: 'credit_precontract_info' },
      precontractDeliveredOn: { ...f('2019-02-01'), source: 'credit_precontract_info' },
    });
    expect(m.conflicts).toEqual([
      { field: 'declaredApr', sources: ['credit_agreement', 'credit_precontract_info'] },
    ]);
  });

  it('keeps only the delivery date of an information sheet that gives a representative example', () => {
    const m = pack(
      {
        pages: [page(1, 'credit_precontract_info')],
        credit_precontract_info: {
          deliveredOn: f('2024-01-10'),
          representativeExample: f(true),
          principal: f(6000),
          declaredApr: f(9.5),
        },
      },
      1,
    );
    expect(m.fields).toEqual({
      precontractDeliveredOn: { ...f('2024-01-10'), source: 'credit_precontract_info' },
    });
    expect(m.discarded).toBe(0);
  });

  it('takes the end the early repayment statement restates before the contract’s', () => {
    const m = pack(
      {
        pages: [page(1, 'credit_agreement'), page(2, 'early_repayment_statement')],
        credit_agreement: { agreedEndOn: f('2029-01-05') },
        early_repayment_statement: { agreedEndOn: f('2029-01-05'), repaidOn: f('2026-03-05') },
      },
      2,
    );
    expect(m.fields.agreedEndOn).toEqual({
      ...f('2029-01-05'),
      source: 'early_repayment_statement',
    });
    expect(m.conflicts).toEqual([]);
  });

  it('keeps an intermediary’s name for a company only', () => {
    const company = pack(
      {
        pages: [page(1, 'credit_agreement')],
        credit_agreement: {
          intermediaryType: f('company'),
          intermediaryCompanyName: f('Concesionario Ficticio S.L.'),
        },
      },
      1,
    );
    expect(company.fields.intermediaryCompanyName?.value).toBe('Concesionario Ficticio S.L.');
    const person = pack(
      {
        pages: [page(1, 'credit_agreement')],
        credit_agreement: {
          intermediaryType: f('person'),
          intermediaryCompanyName: f('Fulano Inventado'),
        },
      },
      1,
    );
    expect(person.fields.intermediaryCompanyName).toBeUndefined();
    expect(person.discarded).toBe(1);
    const unknown = pack(
      {
        pages: [page(1, 'credit_agreement')],
        credit_agreement: { intermediaryCompanyName: f('Fulano Inventado') },
      },
      1,
    );
    expect(unknown.fields.intermediaryCompanyName).toBeUndefined();
  });

  it('drops a copied text that holds an identifier or tells about health, and keeps the figures', () => {
    const m = pack(
      {
        pages: [page(1, 'credit_agreement')],
        credit_agreement: {
          principal: f(20000),
          earlyRepaymentClauseText: f('Firmado por D. Fulano, DNI 12345678A.'),
          withdrawalClauseText: f('El prestatario declara no padecer enfermedad alguna.'),
          charges: [row({ kind: 'other', concept: 'Cuenta ES0021000418450200051332', amount: 30 })],
        },
      },
      1,
    );
    expect(m.fields).toEqual({ principal: { ...f(20000), source: 'credit_agreement' } });
    expect(m.lists.charges).toEqual([
      { values: { kind: 'other', amount: 30 }, confidence: 'high', source: 'credit_agreement' },
    ]);
    expect(m.discarded).toBe(3);
    expect(JSON.stringify(m)).not.toMatch(/Fulano|12345678A|enfermedad|ES00/);
  });

  it('carries each list with its source, the charges of both contracts together', () => {
    const m = pack(
      {
        pages: [
          page(1, 'credit_agreement'),
          page(2, 'revolving_agreement'),
          page(3, 'amortization_schedule'),
        ],
        credit_agreement: { charges: [row({ kind: 'opening', amount: 761.25, how: 'deducted' })] },
        revolving_agreement: { charges: [row({ kind: 'other', amount: 3 })] },
        amortization_schedule: { schedule: [row({ dueOn: '2019-03-05', amount: 273.35 })] },
      },
      3,
    );
    expect(m.lists.charges?.map((c) => c.source)).toEqual([
      'credit_agreement',
      'revolving_agreement',
    ]);
    expect(m.lists.schedule).toEqual([
      {
        values: { dueOn: '2019-03-05', amount: 273.35 },
        confidence: 'high',
        source: 'amortization_schedule',
      },
    ]);
    expect(m.truncated).toBe(false);
  });

  it('says a list came back at its maximum', () => {
    const schedule = Array.from({ length: 96 }, (_, i) =>
      row({
        dueOn: `${2020 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-05`,
        amount: 300,
      }),
    );
    const m = pack(
      { pages: [page(1, 'amortization_schedule')], amortization_schedule: { schedule } },
      1,
    );
    expect(m.truncated).toBe(true);
  });
});
