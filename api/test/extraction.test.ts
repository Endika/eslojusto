import { describe, expect, it } from 'vitest';
import { failedChecks, hasLowConfidence, parseExtraction } from '../src/domain/extraction';
import { coherentSettlement, f } from './support/fields';

describe('parseExtraction', () => {
  it('keeps valid fields with their confidence', () => {
    const e = parseExtraction('settlement', coherentSettlement());
    expect(e.fields['holiday_pay']).toEqual({ value: 640.5, confidence: 'high' });
    expect(e.dropped).toBe(0);
  });

  it.each([
    ['an impossible date', 'endDate', f('2026-02-30')],
    ['a date with another format', 'endDate', f('15/09/2026')],
    ['a negative amount', 'severance', f(-10)],
    ['an amount with fractions of a cent', 'severance', f(10.005)],
    ['an amount as text', 'severance', f('1.234,56')],
    ['an amount over the maximum', 'severance', f(1_000_000.01)],
    ['a cause outside the engine', 'cause', f('dismissal')],
    ['an unknown confidence', 'severance', f(100, 'certain' as 'high')],
    ['a bare value', 'severance', 100],
    ['a field with an extra key', 'severance', { value: 100, confidence: 'high', note: 'x' }],
  ])('drops %s and counts it', (_, name, raw) => {
    const e = parseExtraction('settlement', { detectedKind: f('settlement'), [name]: raw });
    expect(e.fields[name]).toBeUndefined();
    expect(e.dropped).toBe(1);
  });

  it('ignores keys outside the schema without counting them as fields', () => {
    const e = parseExtraction('settlement', {
      detectedKind: f('settlement'),
      note: f('anything'),
      employeeName: f('Persona Ficticia'),
    });
    expect(Object.keys(e.fields)).toEqual(['detectedKind']);
  });

  it('only accepts a kind’s own fields', () => {
    const e = parseExtraction('work_history', {
      detectedKind: f('work_history'),
      severance: f(10),
    });
    expect(e.fields['severance']).toBeUndefined();
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
    const e = parseExtraction('work_history', { detectedKind: f('work_history'), contracts: rows });
    expect(e.lists['contracts']).toHaveLength(2 + 53);
    expect(e.lists['contracts']?.[1]).toEqual({
      values: { startDate: '2021-01-01' },
      confidence: 'medium',
    });
    expect(e.dropped).toBe(5 + 7);
  });

  it('returns nothing from something that is not an object', () => {
    for (const input of [null, 'text', [1, 2], 42]) {
      const e = parseExtraction('payslip', input);
      expect(e.fields).toEqual({});
      expect(e.lists).toEqual({});
    }
  });
});

describe('failedChecks', () => {
  it('passes a settlement whose items add up to the total', () => {
    expect(failedChecks(parseExtraction('settlement', coherentSettlement()))).toEqual([]);
  });

  it('flags items that do not add up, within a one-euro tolerance', () => {
    const near = { ...coherentSettlement(), totalAccrued: f(2871.5) };
    const off = { ...coherentSettlement(), totalAccrued: f(2900) };
    expect(failedChecks(parseExtraction('settlement', near))).toEqual([]);
    expect(failedChecks(parseExtraction('settlement', off))).toEqual(['items_do_not_sum']);
  });

  it('counts other gross lines and accepts the notice deduction on either side of the total', () => {
    const withOthers = {
      ...coherentSettlement(),
      otherAccruals: [{ amount: 100, confidence: 'high' }],
      totalAccrued: f(2970.5),
    };
    const deducted = { ...coherentSettlement(), notice_deduction: f(300), totalAccrued: f(2570.5) };
    expect(failedChecks(parseExtraction('settlement', withOthers))).toEqual([]);
    expect(failedChecks(parseExtraction('settlement', deducted))).toEqual([]);
  });

  it('flags an end date before the start date', () => {
    const e = parseExtraction('settlement', {
      ...coherentSettlement(),
      endDate: f('2021-01-01'),
    });
    expect(failedChecks(e)).toEqual(['end_before_start']);
  });

  it('checks payslip periods, totals and proration', () => {
    const payslip = {
      detectedKind: f('payslip'),
      periodStart: f('2026-08-31'),
      periodEnd: f('2026-08-01'),
      startDate: f('2026-09-01'),
      totalAccrued: f(100),
      extraPayProratedAmount: f(150),
      accruals: [{ amount: 90, confidence: 'high' }],
    };
    expect(failedChecks(parseExtraction('payslip', payslip))).toEqual([
      'period_end_before_start',
      'start_after_period_end',
      'items_do_not_sum',
      'proration_exceeds_total',
    ]);
  });

  it('flags a work-history row that ends before it starts', () => {
    const e = parseExtraction('work_history', {
      detectedKind: f('work_history'),
      contracts: [{ startDate: '2020-06-01', endDate: '2020-01-01', confidence: 'high' }],
    });
    expect(failedChecks(e)).toEqual(['contract_end_before_start']);
  });
});

describe('hasLowConfidence', () => {
  it('looks at fields and rows', () => {
    expect(hasLowConfidence(parseExtraction('settlement', coherentSettlement()))).toBe(false);
    expect(hasLowConfidence(parseExtraction('settlement', coherentSettlement('low')))).toBe(true);
    const lowRow = parseExtraction('work_history', {
      detectedKind: f('work_history'),
      contracts: [{ startDate: '2020-06-01', confidence: 'low' }],
    });
    expect(hasLowConfidence(lowRow)).toBe(true);
  });
});
