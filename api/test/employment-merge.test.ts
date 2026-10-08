import { describe, expect, it } from 'vitest';
import { EMPLOYMENT_MERGE_RULES, employmentMerge } from '../src/domain/employment-merge';
import { EMPLOYMENT_SECTIONS } from '../src/domain/employment-schema';
import { parseReading } from '../src/domain/extraction';
import { employmentRecord, LARGEST } from './support/employment-largest';
import { f, page } from './support/fields';

const pack = (input: Record<string, unknown>, pages: number) =>
  employmentMerge(parseReading(input, pages, 'employment'), input);

const payslip = (month: string, values: Record<string, unknown> = {}) => ({
  month,
  ...values,
  confidence: 'high',
});

describe('employmentMerge', () => {
  it('merges every contract field, and every offer field under a name of its own', () => {
    const offer = Object.keys(EMPLOYMENT_SECTIONS.job_offer.fields).map(
      (name) => `offer${name[0]?.toUpperCase()}${name.slice(1)}`,
    );
    expect(Object.keys(EMPLOYMENT_MERGE_RULES).sort()).toEqual(
      [...Object.keys(EMPLOYMENT_SECTIONS.employment_contract.fields), ...offer].sort(),
    );
  });

  it('keeps each value with the kind of document it came from', () => {
    const m = pack(
      {
        pages: [page(1, 'employment_contract'), page(2, 'job_offer')],
        employment_contract: { salaryAmount: f(1600), salaryPeriod: f('month') },
        job_offer: { salaryAmount: f(1300), net: f(true) },
      },
      2,
    );
    expect(m.fields).toEqual({
      salaryAmount: { ...f(1600), source: 'employment_contract' },
      salaryPeriod: { ...f('month'), source: 'employment_contract' },
      offerSalaryAmount: { ...f(1300), source: 'job_offer' },
      offerNet: { ...f(true), source: 'job_offer' },
    });
    expect(m.conflicts).toEqual([]);
  });

  it('takes the agreement from the contract, and from the latest payslip when it names none', () => {
    const payslips = {
      payslips: [
        payslip('2026-04', { agreementName: 'Convenio antiguo', category: 'Peón' }),
        payslip('2026-05', { agreementName: 'Convenio de ficción', category: 'Oficial' }),
        payslip('2026-06'),
      ],
    };
    const pages = [page(1, 'employment_contract'), page(2, 'payslip')];
    const fallback = pack({ pages, employment_contract: {}, employment_payslips: payslips }, 2);
    expect(fallback.fields.agreementName).toEqual({
      ...f('Convenio de ficción'),
      source: 'payslip',
    });
    expect(fallback.fields.category).toEqual({ ...f('Oficial'), source: 'payslip' });

    const both = pack(
      {
        pages,
        employment_contract: { agreementName: f('Convenio de ficción'), category: f('Peón') },
        employment_payslips: payslips,
      },
      2,
    );
    expect(both.fields.agreementName?.source).toBe('employment_contract');
    expect(both.conflicts).toEqual([
      { field: 'category', sources: ['employment_contract', 'payslip'] },
    ]);
  });

  it('carries each list with the kind of document it came from', () => {
    const m = pack(
      {
        pages: [page(1, 'payslip', 1, 'high', '2026-03'), page(2, 'work_history')],
        employment_payslips: {
          payslips: [payslip('2026-03', { totalAccrued: 700 })],
          lines: [
            {
              month: '2026-03',
              concept: 'BASE',
              amount: 700,
              category: 'salary',
              confidence: 'high',
            },
          ],
        },
        employment_work_history: { contracts: [] },
      },
      2,
    );
    expect(Object.keys(m.lists)).toEqual(['payslips', 'lines']);
    expect(m.lists.lines?.[0]?.source).toBe('payslip');
    expect(m.truncated).toBe(false);
  });

  it('drops an employer’s name and account code unless they are a company’s', () => {
    const named = (employerType?: string) =>
      pack(
        {
          pages: [page(1, 'employment_contract'), page(2, 'work_history')],
          employment_contract: {
            ...(employerType && { employerType: f(employerType) }),
            companyName: f('Fulanita Inventada Ejemplo'),
          },
          employment_work_history: {
            contracts: [
              {
                startDate: '2024-01-01',
                ...(employerType && { employerType }),
                employerName: 'Fulanita Inventada Ejemplo',
                accountCode: '28/0000000/00',
                confidence: 'high',
              },
            ],
          },
        },
        2,
      );
    for (const m of [named('person'), named()]) {
      expect(JSON.stringify(m)).not.toMatch(/Fulanita|28\/0000000/);
      expect(m.discarded).toBe(3);
    }
    const company = named('company');
    expect(company.fields.companyName?.value).toBe('Fulanita Inventada Ejemplo');
    expect(company.lists.contracts?.[0]?.values).toMatchObject({
      employerName: 'Fulanita Inventada Ejemplo',
      accountCode: '28/0000000/00',
    });
    expect(company.discarded).toBe(0);
  });

  it('drops a copied text that still holds an identifier, and keeps the figures beside it', () => {
    const row = (literal: string) => ({ label: 'waiver', literal, months: 3, confidence: 'high' });
    const m = pack(
      {
        pages: [page(1, 'employment_contract'), page(2, 'payslip'), page(3, 'job_offer')],
        employment_contract: {
          employerType: f('company'),
          companyName: f('Empresa Ficticia S.L., ES00 2100 0418 4502 0005 1332'),
          causeText: f('Sustitución de [nombre], DNI 00000000T, durante su ausencia.'),
          scheduleText: f('De 9:00 a 17:00.'),
          modalityText: f('Temporal; afiliación 28 12345678 90'),
          clauses: [row('Renuncia a las vacaciones.'), row('Contacto: fulano@ejemplo.test')],
          salaryParts: [
            { concept: 'BASE X0000000T', amount: 1000, kind: 'base', confidence: 'high' },
          ],
        },
        employment_payslips: {
          payslips: [payslip('2026-03', { agreementName: 'Convenio 600 123 456' })],
          lines: [
            {
              month: '2026-03',
              concept: 'ANTICIPO 281234567890',
              amount: 50,
              category: 'other',
              confidence: 'high',
            },
          ],
        },
        job_offer: { position: f('Escribe al 600123456') },
      },
      3,
    );
    expect(Object.keys(m.fields).sort()).toEqual(['employerType', 'scheduleText']);
    expect(m.lists.clauses?.map((c) => c.values)).toEqual([
      { label: 'waiver', literal: 'Renuncia a las vacaciones.', months: 3 },
      { label: 'waiver', months: 3 },
    ]);
    expect(m.lists.salaryParts?.[0]?.values).toEqual({ amount: 1000, kind: 'base' });
    expect(m.lists.lines?.[0]?.values).toEqual({ month: '2026-03', amount: 50, category: 'other' });
    expect(m.discarded).toBe(8);
  });

  it('drops a copied text that tells about health, leave, union or debts', () => {
    const m = pack(
      {
        pages: [page(1, 'employment_contract'), page(2, 'payslip')],
        employment_contract: {
          causeText: f('Sustitución de [nombre] durante su incapacidad temporal.'),
          scheduleText: f('De 8:00 a 15:00, con una hora de lactancia.'),
          category: f('Oficial de primera'),
          clauses: [
            { label: 'other', literal: 'Declara una discapacidad del 33 %.', confidence: 'high' },
          ],
        },
        employment_payslips: {
          payslips: [payslip('2026-05', { agreementName: 'Convenio firmado por CCOO y UGT' })],
        },
      },
      2,
    );
    expect(Object.keys(m.fields)).toEqual(['category']);
    expect(m.lists.clauses?.[0]?.values).toEqual({ label: 'other' });
    expect(m.discarded).toBe(4);
  });

  it('keeps a payslip line whose concept tells too much, without its concept and as no doubt', () => {
    const line = (concept: string, amount: number) => ({
      month: '2026-05',
      concept,
      amount,
      category: 'other',
      confidence: 'high',
    });
    const m = pack(
      {
        pages: [page(1, 'payslip')],
        employment_payslips: {
          lines: [
            line('COMPLEMENTO I.T.', 150),
            line('CUOTA SINDICAL', 12),
            line('PLUS DE TRANSPORTE', 80),
          ],
        },
      },
      1,
    );
    expect(m.lists.lines?.map((l) => l.values)).toEqual([
      { month: '2026-05', amount: 150, category: 'other' },
      { month: '2026-05', amount: 12, category: 'other' },
      { month: '2026-05', concept: 'PLUS DE TRANSPORTE', amount: 80, category: 'other' },
    ]);
    expect(m.discarded).toBe(0);
  });

  it('says a list came back at its maximum', () => {
    expect(pack(employmentRecord(), 25).truncated).toBe(true);
    const below = { payslips: 5, lines: 59, contracts: 14, texts: 'typical' } as const;
    const fewer = employmentRecord(below);
    expect(fewer).toMatchObject({ employment_contract: { information: { length: 17 } } });
    expect(pack(fewer, 25).truncated).toBe(false);
  });

  it('counts a list at its maximum even when a row failed validation', () => {
    const shape = { payslips: 5, lines: 60, contracts: 14, texts: 'typical' } as const;
    const record = employmentRecord(shape) as {
      employment_payslips: { lines: Record<string, unknown>[] };
    };
    record.employment_payslips.lines[0] = { month: 'not a month', confidence: 'high' };
    const m = pack(record, 25);
    expect(m.lists.lines).toHaveLength(59);
    expect(m.truncated).toBe(true);
  });

  it('ignores a full list of a section no readable page backs', () => {
    const record = employmentRecord({ ...LARGEST, texts: 'typical' }) as Record<string, unknown>;
    record['pages'] = [page(1, 'employment_contract')];
    expect(pack(record, 1).truncated).toBe(false);
  });
});
