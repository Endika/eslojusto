import { describe, expect, it } from 'vitest';
import { parseDate } from '../../../src/engine/date';
import { assessFinalPay } from '../../../src/engine/household/final-pay';
import { desistimiento, household } from './input';
import { NORMS } from './norms-table';

const d = parseDate;
const ending = (change = {}, termination = {}) =>
  assessFinalPay(
    household({
      termination: desistimiento({ effectiveOn: d('2026-09-21'), ...termination }),
      ...change,
    }),
    NORMS,
  );

describe('final pay of a worker paid monthly', () => {
  it('is nothing without a termination', () => {
    expect(assessFinalPay(household(), NORMS)).toBeNull();
  });

  it('reuses the final-pay items: pending salary, holidays and extra payments', () => {
    const pay = ending();
    expect(pay?.kind).toBe('monthly');
    if (pay?.kind !== 'monthly') return;
    expect(pay.items.map((i) => i.id)).toEqual(['pending_salary', 'holiday_pay', 'extra_pay']);
  });

  it('pays the days of the last month at the monthly salary over 30 or the month length', () => {
    const pay = ending();
    if (pay?.kind !== 'monthly') throw new Error('expected a monthly pay');
    // 21 days of September (30 days): 1.500 × 21 / 30 = 1.050 against 1.500 × 21 / 30 as well.
    expect(pay.items[0]?.range).toEqual({ min: 1050, max: 1050 });
  });

  it('counts holidays in calendar days against the 30 of art. 9', () => {
    const pay = ending({ holidays: { days: 30, longestStretch: 15, taken: 0 } });
    if (pay?.kind !== 'monthly') throw new Error('expected a monthly pay');
    const holiday = pay.items.find((i) => i.id === 'holiday_pay');
    expect(holiday?.calculation[0]?.key).toBe('holiday_pay.pending');
    expect(holiday?.range?.max).toBeGreaterThan(0);
  });

  it('cannot work out holidays without the days taken', () => {
    const pay = ending({ holidays: { days: 30, longestStretch: 15, taken: null } });
    if (pay?.kind !== 'monthly') throw new Error('expected a monthly pay');
    const holiday = pay.items.find((i) => i.id === 'holiday_pay');
    expect(holiday?.range).toBeNull();
    expect(holiday?.missingAnswer).toBe('days_taken');
  });

  it('shares each extra payment over its half-year, the default of art. 8.4', () => {
    const pay = ending({}, { effectiveOn: d('2026-09-21') });
    if (pay?.kind !== 'monthly') throw new Error('expected a monthly pay');
    const extra = pay.items.find((i) => i.id === 'extra_pay');
    expect(extra?.calculation[0]?.key).toBe('extra_pay.semiannual');
    // 1.500 × 83 / 184 days of the second half-year up to 21-09: 676.63.
    expect(extra?.range?.max).toBeCloseTo(676.63, 2);
  });

  it('leaves the extra payments out when they are prorated', () => {
    const pay = ending({
      extraPays: { count: 2, amount: null, prorated: true, accrual: 'semiannual' },
    });
    if (pay?.kind !== 'monthly') throw new Error('expected a monthly pay');
    expect(pay.items.map((i) => i.id)).toEqual(['pending_salary', 'holiday_pay']);
  });

  it('does not work out extra payments apart of an unknown amount', () => {
    const pay = ending({
      extraPays: { count: 2, amount: null, prorated: false, accrual: 'semiannual' },
    });
    if (pay?.kind !== 'monthly') throw new Error('expected a monthly pay');
    expect(pay.extraPayAmountMissing).toBe(true);
    expect(pay.items.map((i) => i.id)).toEqual(['pending_salary', 'holiday_pay']);
  });

  it('cites the household rules, not the Estatuto', () => {
    const pay = ending();
    if (pay?.kind !== 'monthly') throw new Error('expected a monthly pay');
    expect(pay.items.map((i) => i.sources.map((s) => s.citation.split(' (')[0]))).toEqual([
      ['Real Decreto 1620/2011, art. 8.1'],
      ['Real Decreto 1620/2011, art. 9'],
      ['Real Decreto 1620/2011, art. 8.4'],
    ]);
  });

  it('asks for the salary', () => {
    expect(ending({ monthlyCash: null })).toEqual({ kind: 'not_entered' });
  });
});

describe('final pay of an external worker paid by the hour', () => {
  it('has holidays and extra payments inside the hourly price, never claimed apart', () => {
    const pay = ending({ regime: 'hourly_external', hourlyRate: 9.55, monthlyCash: null });
    expect(pay).toMatchObject({
      kind: 'hourly_external',
      includedInHourlyPrice: ['holiday_pay', 'extra_pay'],
      // Art. 8.5 says it of the minimum: above it, the agreement decides.
      agreementMaySetOther: true,
    });
    if (pay?.kind !== 'hourly_external') return;
    expect(pay.source.citation).toContain('art. 8.5');
  });
});
