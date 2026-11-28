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
  it('counts holidays in calendar days against the 30 of art. 9', () => {
    const pay = ending({ holidays: { days: 30, longestStretch: 15, taken: 0 } });
    if (pay?.kind !== 'monthly') throw new Error('expected a monthly pay');
    const holiday = pay.items.find((i) => i.id === 'holiday_pay');
    expect(holiday?.calculation[0]?.key).toBe('holiday_pay.pending');
    expect(holiday?.range?.max).toBeGreaterThan(0);
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

  it('reckons no extra payments, missing or not, for a worker who has none', () => {
    const none = ending({ extraPays: null });
    const zero = ending({
      extraPays: { count: 0, amount: null, prorated: false, accrual: 'semiannual' },
    });
    for (const pay of [none, zero]) {
      if (pay?.kind !== 'monthly') throw new Error('expected a monthly pay');
      expect(pay.extraPayAmountMissing).toBe(false);
      expect(pay.items.map((i) => i.id)).toEqual(['pending_salary', 'holiday_pay']);
    }
  });

  it.each([['takes the 30 days of art. 9 when no holidays are entered', null, 30]])(
    '%s',
    (_name, holidays, days) => {
      const pay = ending({ holidays });
      if (pay?.kind !== 'monthly') throw new Error('expected a monthly pay');
      expect(JSON.stringify(pay.items[1]?.calculation)).toContain(`"anuales":{"days":${days}}`);
    },
  );

  it('works the extra payments with the accrual entered', () => {
    const pay = ending({
      extraPays: { count: 2, amount: 1500, prorated: false, accrual: 'annual' },
    });
    if (pay?.kind !== 'monthly') throw new Error('expected a monthly pay');
    expect(pay.items.find((i) => i.id === 'extra_pay')?.calculation[0]?.key).toBe(
      'extra_pay.annual',
    );
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
