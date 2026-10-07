import { describe, expect, it } from 'vitest';
import { calculationText } from '../../src/calculator/calculation';
import { phrase } from '../../src/engine/calculation';
import { reviewFinalPay } from '../../src/engine/review';
import { parseDate as f } from '../../src/engine/date';
import type { Cause, FinalPayInput } from '../../src/engine/types';
import { t } from '../../src/i18n';

const es = (key: Parameters<typeof t>[1], vars?: Record<string, string | number>) =>
  t('es', key, vars);

describe('calculation text', () => {
  it('writes each figure in its own format', () => {
    const text = calculationText(
      [
        phrase('severance.fixed_term', {
          dias: { integer: 4383 },
          dias_anuales: 12,
          diario: { euros: 1234.5 },
        }),
        phrase('severance.unfair', { meses: 1000, dias: { days: 1031.5 } }),
      ],
      es,
    );
    expect(text).toBe('4.383 días × 12/365 × 1.234,50 €/día 1000 meses × 2,75 = 1.031,5 días.');
  });

  it('words a nested phrase in place', () => {
    const share = (importe: number) =>
      phrase('extra_pay.share', {
        importe: { euros: importe },
        dias: 1,
        total: 2,
        por_dias: { euros: importe / 2 },
        meses: { days: 0.5 },
        meses_periodo: 6,
        por_meses: { euros: importe / 12 },
      });
    expect(calculationText([phrase('extra_pay.semiannual', { paga: share(600) })], es)).toBe(
      'Devengo semestral: 600,00 € × 1/2 días = 300,00 € o × 0,5/6 meses = 50,00 €, suponiendo que no se ha cobrado nada del periodo abierto.',
    );
  });

  it.each([
    'resignation',
    'fixed_term_end',
    'objective_dismissal',
    'unfair_dismissal',
    'disciplinary_dismissal',
  ] as const)('%s: every item fills every placeholder', (cause: Cause) => {
    const e: FinalPayInput = {
      cause,
      fixedTermType: 'production_circumstances',
      startDate: f('2005-03-15'),
      endDate: f('2026-06-30'),
      monthlySalary: 2000,
      extraPayProrated: false,
      extraPayCount: 1,
      extraPayAmount: 2000,
      extraPayAccrual: 'unknown',
      annualHolidayDays: 30,
      holidayDaysTaken: 3,
      agreementNoticeDays: 15,
    };
    const r = reviewFinalPay(e, {}, f('2026-10-06'));
    if (!r.ok) throw new Error('invalid input');
    for (const { item } of r.review.items)
      expect(calculationText(item.calculation, es), item.id).not.toMatch(/[{}]/);
  });
});
