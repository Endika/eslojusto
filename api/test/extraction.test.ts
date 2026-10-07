import { describe, expect, it } from 'vitest';
import { failedChecks, hasLowConfidence, parseReading } from '../src/domain/extraction';
import { LIMITS } from '../src/domain/documents';
import { coherentSettlement, f, page, proposal } from './support/fields';

const withProposal = (fields: Record<string, unknown>) => ({
  pages: [page(1, 'settlement_proposal')],
  settlement_proposal: fields,
});

describe('parseReading', () => {
  it('keeps valid pages and fields with their confidence', () => {
    const r = parseReading(coherentSettlement(), 1);
    expect(r.pages).toEqual([page(1, 'settlement_proposal')]);
    expect(r.sections.settlement_proposal?.fields['holiday_pay']).toEqual(f(640.5));
    expect(r.dropped).toBe(0);
    expect(r.unclassified).toBe(0);
  });

  it.each([
    ['an impossible date', 'endDate', f('2026-02-30')],
    ['a date with another format', 'endDate', f('15/09/2026')],
    ['a negative amount', 'severance', f(-10)],
    ['an amount with fractions of a cent', 'severance', f(10.005)],
    ['an amount as text', 'severance', f('1.234,56')],
    ['an amount over the maximum', 'severance', f(1_000_000.01)],
    ['a cause outside the engine', 'cause', f('dismissal')],
    ['days that are not whole', 'holidayDaysTaken', f(2.5)],
    ['more days than a year has', 'annualHolidayDays', f(400)],
    ['an unknown confidence', 'severance', f(100, 'certain' as 'high')],
    ['a bare value', 'severance', 100],
    ['a field with an extra key', 'severance', { value: 100, confidence: 'high', note: 'x' }],
  ])('drops %s and counts it', (_, name, raw) => {
    const r = parseReading(withProposal({ [name]: raw }), 1);
    expect(r.sections.settlement_proposal?.fields[name]).toBeUndefined();
    expect(r.dropped).toBe(1);
  });

  it('ignores keys outside the schema without counting them as fields', () => {
    const r = parseReading(
      { ...withProposal({ note: f('anything'), employeeName: f('Persona Ficticia') }), extra: 1 },
      1,
    );
    expect(r.sections.settlement_proposal?.fields).toEqual({});
    expect(Object.keys(r.sections)).toEqual(['settlement_proposal']);
  });

  it('only accepts a section’s own fields', () => {
    const r = parseReading(
      {
        pages: [page(1, 'company_certificate')],
        company_certificate: { severance: f(10), endDate: f('2026-09-15') },
      },
      1,
    );
    expect(r.sections.company_certificate?.fields).toEqual({ endDate: f('2026-09-15') });
  });

  it.each([
    ['a page beyond the attached ones', page(3, 'payslip')],
    ['an unknown kind', page(1, 'contract')],
    ['a page number that is not whole', { ...page(1, 'payslip'), page: 1.5 }],
    ['a document number out of range', page(1, 'payslip', LIMITS.maxImages + 1)],
    ['a month that is not one', page(1, 'payslip', 1, 'high', '2026-13')],
    ['a page with an extra key', { ...page(1, 'payslip'), note: 'x' }],
    [
      'a page without its readability',
      { page: 1, kind: 'payslip', document: 1, confidence: 'high' },
    ],
    ['an unknown readability', { ...page(1, 'payslip'), readability: f('illegible') }],
    ['a readability without a confidence', { ...page(1, 'payslip'), readability: { value: 'ok' } }],
    [
      'a readability with an extra key',
      { ...page(1, 'payslip'), readability: { ...f('ok'), language: 'ca' } },
    ],
  ])('drops %s and leaves the page unclassified', (_, raw) => {
    const r = parseReading({ pages: [raw] }, 2);
    expect(r.pages).toEqual([]);
    expect(r.dropped).toBe(1);
    expect(r.unclassified).toBe(2);
  });

  it('transcribes nothing from a page set aside, whatever the model copied from it', () => {
    const r = parseReading(
      {
        pages: [
          page(1, 'settlement_proposal', 1, 'high', undefined, 'blurry'),
          page(2, 'dismissal_letter'),
        ],
        settlement_proposal: proposal(),
        dismissal_letter: { endDate: f('2026-09-15') },
      },
      2,
    );
    expect(Object.keys(r.sections)).toEqual(['dismissal_letter']);
    expect(r.pages[0]?.readability).toEqual(f('blurry'));
    expect(r.dropped).toBe(1);
  });

  it('keeps the first reading of a page given twice and drops the second', () => {
    const r = parseReading({ pages: [page(1, 'payslip'), page(1, 'other')] }, 1);
    expect(r.pages.map((p) => p.kind)).toEqual(['payslip']);
    expect(r.dropped).toBe(1);
  });

  it('orders pages and keeps a payslip’s month', () => {
    const r = parseReading(
      { pages: [page(2, 'other'), page(1, 'payslip', 1, 'medium', '2026-08')] },
      2,
    );
    expect(r.pages).toEqual([page(1, 'payslip', 1, 'medium', '2026-08'), page(2, 'other')]);
  });

  it('keeps valid rows, drops invalid ones and anything past the maximum', () => {
    const rows = [
      { startDate: '2020-01-01', endDate: '2020-06-30', confidence: 'high' },
      { startDate: '2021-01-01', confidence: 'medium' },
      { endDate: '2021-06-30', confidence: 'high' },
      { startDate: '2021-13-01', confidence: 'high' },
      { startDate: '2022-01-01' },
      { startDate: '2022-01-01', confidence: 'high', employer: 'Empresa Inventada' },
      'not a row',
      ...Array.from({ length: 60 }, () => ({ startDate: '2023-01-01', confidence: 'high' })),
    ];
    const r = parseReading(
      { pages: [page(1, 'work_history')], work_history: { contracts: rows } },
      1,
    );
    const contracts = r.sections.work_history?.lists['contracts'];
    expect(contracts).toHaveLength(2 + 53);
    expect(contracts?.[1]).toEqual({ values: { startDate: '2021-01-01' }, confidence: 'medium' });
    expect(r.dropped).toBe(5 + 7);
  });

  it('counts a section that is not an object as dropped', () => {
    expect(parseReading({ pages: [], dismissal_letter: 'text' }, 0).dropped).toBe(1);
  });

  it('returns nothing from something that is not an object', () => {
    for (const input of [null, 'text', [1, 2], 42]) {
      const r = parseReading(input, 3);
      expect(r.pages).toEqual([]);
      expect(r.sections).toEqual({});
      expect(r.unclassified).toBe(3);
    }
  });
});

describe('the monthly payslip', () => {
  it('keeps the period, the proration and every line with its concept and category', () => {
    const r = parseReading(
      {
        pages: [page(1, 'payslip', 1, 'high', '2026-06')],
        monthly_payslip: {
          periodStart: f('2026-06-01'),
          periodEnd: f('2026-06-30'),
          totalAccrued: f(3500),
          extraPayProrated: f(false),
          lines: [
            { concept: 'SALARIO BASE', amount: 2000, category: 'salary', confidence: 'high' },
            { concept: 'PAGA EXTRA', amount: 1500, category: 'extra_pay', confidence: 'high' },
          ],
        },
      },
      1,
    );
    expect(r.dropped).toBe(0);
    expect(r.sections.monthly_payslip?.fields).toMatchObject({ extraPayProrated: f(false) });
    expect(r.sections.monthly_payslip?.lists['lines']?.[1]).toEqual({
      values: { concept: 'PAGA EXTRA', amount: 1500, category: 'extra_pay' },
      confidence: 'high',
    });
  });

  it.each([
    ['no category', { concept: 'X', amount: 1, confidence: 'high' }],
    ['an unknown category', { concept: 'X', amount: 1, category: 'bonus', confidence: 'high' }],
    ['an empty concept', { concept: '', amount: 1, category: 'salary', confidence: 'high' }],
    [
      'a concept longer than any line',
      { concept: 'X'.repeat(81), amount: 1, category: 'salary', confidence: 'high' },
    ],
  ])('drops a line with %s', (_, raw) => {
    const r = parseReading({ pages: [page(1, 'payslip')], final_payslip: { lines: [raw] } }, 1);
    expect(r.sections.final_payslip?.lists['lines']).toEqual([]);
    expect(r.dropped).toBe(1);
  });
});

describe('failedChecks', () => {
  it('passes a settlement whose items add up to the total', () => {
    expect(failedChecks(parseReading(coherentSettlement(), 1))).toEqual([]);
  });

  it('flags items that do not add up, within a one-euro tolerance', () => {
    const near = withProposal({ ...proposal(), totalGross: f(2871.5) });
    const off = withProposal({ ...proposal(), totalGross: f(2900) });
    expect(failedChecks(parseReading(near, 1))).toEqual([]);
    expect(failedChecks(parseReading(off, 1))).toEqual(['items_do_not_sum']);
  });

  it('checks the items only against a gross total, never a net one', () => {
    // A net total has deductions off and may hold tax-exempt severance: no sum to check.
    const netOnly = withProposal({ ...proposal(), totalGross: undefined, totalNet: f(7000) });
    delete (netOnly.settlement_proposal as Record<string, unknown>)['totalGross'];
    expect(failedChecks(parseReading(netOnly, 1))).toEqual([]);
    const grossOff = withProposal({ ...proposal(), totalGross: f(9000), totalNet: f(2500) });
    expect(failedChecks(parseReading(grossOff, 1))).toEqual(['items_do_not_sum']);
  });

  it('counts other gross lines and accepts the notice deduction on either side of the total', () => {
    const withOthers = withProposal({
      ...proposal(),
      otherAccruals: [{ amount: 100, confidence: 'high' }],
      totalGross: f(2970.5),
    });
    const deducted = withProposal({
      ...proposal(),
      notice_deduction: f(300),
      totalGross: f(2570.5),
    });
    expect(failedChecks(parseReading(withOthers, 1))).toEqual([]);
    expect(failedChecks(parseReading(deducted, 1))).toEqual([]);
  });

  it('checks that a payslip’s lines add up to its total', () => {
    const final = (totalAccrued: number) =>
      parseReading(
        {
          pages: [page(1, 'payslip')],
          final_payslip: {
            totalAccrued: f(totalAccrued),
            lines: [
              { concept: 'SALARIO', amount: 1000, category: 'salary', confidence: 'high' },
              { concept: 'INDEMNIZACION', amount: 500, category: 'severance', confidence: 'high' },
            ],
          },
        },
        1,
      );
    expect(failedChecks(final(1500.5))).toEqual([]);
    expect(failedChecks(final(2000))).toEqual(['items_do_not_sum']);
  });

  it('flags an end date before the start date', () => {
    const r = parseReading(withProposal({ ...proposal(), endDate: f('2021-01-01') }), 1);
    expect(failedChecks(r)).toEqual(['end_before_start']);
  });

  it('checks payslip periods, totals and proration', () => {
    const r = parseReading(
      {
        pages: [page(1, 'payslip')],
        monthly_payslip: {
          periodStart: f('2026-08-31'),
          periodEnd: f('2026-08-01'),
          startDate: f('2026-09-01'),
          totalAccrued: f(100),
          extraPayProratedAmount: f(150),
          lines: [{ concept: 'SALARIO', amount: 90, category: 'salary', confidence: 'high' }],
        },
      },
      1,
    );
    expect(failedChecks(r)).toEqual([
      'period_end_before_start',
      'start_after_period_end',
      'items_do_not_sum',
      'proration_exceeds_total',
    ]);
  });

  it('flags a work-history row that ends before it starts', () => {
    const r = parseReading(
      {
        pages: [page(1, 'work_history')],
        work_history: {
          contracts: [{ startDate: '2020-06-01', endDate: '2020-01-01', confidence: 'high' }],
        },
      },
      1,
    );
    expect(failedChecks(r)).toEqual(['contract_end_before_start']);
  });
});

describe('hasLowConfidence', () => {
  it('looks at pages, fields and rows', () => {
    expect(hasLowConfidence(parseReading(coherentSettlement(), 1))).toBe(false);
    expect(hasLowConfidence(parseReading(coherentSettlement('low'), 1))).toBe(true);
    expect(hasLowConfidence(parseReading({ pages: [page(1, 'other', 1, 'low')] }, 1))).toBe(true);
    const unsureWhy = { ...page(1, 'other'), readability: f('dark', 'low') };
    expect(hasLowConfidence(parseReading({ pages: [unsureWhy] }, 1))).toBe(true);
    const lowRow = parseReading(
      {
        pages: [page(1, 'work_history')],
        work_history: { contracts: [{ startDate: '2020-06-01', confidence: 'low' }] },
      },
      1,
    );
    expect(hasLowConfidence(lowRow)).toBe(true);
  });
});
