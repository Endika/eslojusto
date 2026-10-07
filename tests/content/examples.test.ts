import { describe, expect, it } from 'vitest';
import * as x from '../../src/content/examples';
import { parseDate } from '../../src/engine/date';
import { reviewFinalPay } from '../../src/engine/review';
import { computeSeverance } from '../../src/engine/severance';
import type { FinalPayInput } from '../../src/engine/types';
import {
  amounts,
  contractContributedDays,
  durationForDays,
  estimateBenefit,
} from '../../src/engine/unemployment';

// The figures on the case pages, checked twice: against the engine run here on inputs written out
// in full, and against values worked by hand (the same as the guide of /finiquito/), so neither a
// slip in the examples module nor a change in the engine goes by unseen.

const person = {
  monthlySalary: 1500,
  extraPayProrated: false,
  extraPayCount: 2,
  extraPayAmount: 1500,
  extraPayAccrual: 'semiannual',
  holidayUnit: 'working',
  annualHolidayDays: 22,
} as const;

const reviewed = (e: FinalPayInput, figures = {}) => {
  const r = reviewFinalPay(e, figures, e.endDate);
  if (!r.ok) throw new Error('invalid');
  return r.review;
};
const range = (r: ReturnType<typeof reviewed>, id: string) =>
  r.items.find((p) => p.item.id === id)?.item.range;

describe('the worked examples match the engine', () => {
  it('baja voluntaria: every item, the notice deduction included', () => {
    const r = reviewed({
      ...person,
      cause: 'resignation',
      startDate: parseDate('2023-03-01'),
      endDate: parseDate('2026-10-15'),
      holidayDaysTaken: 10,
      agreementNoticeDays: 15,
      noticeDaysGiven: 0,
    });
    expect(x.resignation).toEqual(r);
    expect(range(r, 'pending_salary')).toEqual({ min: 725.81, max: 750 });
    expect(range(r, 'extra_pay')?.min).toBe(872.28);
    expect(range(r, 'severance')).toEqual({ min: 0, max: 0 });
    expect(range(r, 'notice_deduction')).toEqual({ min: 0, max: 863.01 });
  });

  it('despido improcedente: after and before 2012, with the months each stretch counted', () => {
    const after = computeSeverance({
      cause: 'unfair_dismissal',
      startDate: parseDate('2018-05-03'),
      endDate: parseDate('2026-07-20'),
      annualSalary: 21000,
    });
    expect(x.unfairAfter2012).toEqual(after);
    expect(after.amount).toBe(15663.7);
    expect(x.severanceMonths(after.calculation)).toEqual([99]);
    expect(x.unfairBefore2012.amount).toBe(33024.66);
    expect(x.unfairBefore2012.salaryDays).toBe(574);
    expect(x.severanceMonths(x.unfairBefore2012.calculation)).toEqual([24, 176]);
  });

  it('despido objetivo: 165 days, the notice owed and the unfair reference', () => {
    const r = reviewed({
      ...person,
      cause: 'objective_dismissal',
      startDate: parseDate('2018-05-03'),
      endDate: parseDate('2026-07-20'),
      holidayDaysTaken: 10,
      noticeDaysReceived: 0,
    });
    expect(x.objective).toEqual(r);
    expect(range(r, 'severance')).toEqual({ min: 9493.15, max: 9493.15 });
    expect(range(r, 'employer_notice')).toEqual({ min: 750, max: 863.01 });
    expect(r.unfairReference).toBe(15663.7);
  });

  it('fin de contrato: 12 days a year, within the legal maximum of art. 15.2 ET', () => {
    expect(x.fixedTerms.map((f) => [f.label, f.severance?.min, f.limit])).toEqual([
      ['3 meses', 174.02, 'legal'],
      ['6 meses', 346.15, 'legal'],
      ['12 meses', 690.41, 'sector_agreement'],
    ]);
  });

  it('by seniority: the final pay stops growing after a year, the severance does not', () => {
    const [threeMonths, , oneYear, threeYears] = x.bySeniority;
    expect(oneYear?.finalPay).toEqual(threeYears?.finalPay);
    expect(threeMonths?.finalPay.min).toBeLessThan(oneYear?.finalPay.min ?? 0);
    expect(oneYear?.fixedTerm).toBe(690.41);
    expect(oneYear?.fixedTermLimit).toBe('sector_agreement');
    // A contract for production circumstances can't last three years: no figure, only a note.
    expect(threeYears?.fixedTermLimit).toBe('over');
    expect(threeYears?.fixedTerm).toBeNull();
    for (const row of x.bySeniority) {
      const start = x.SENIORITY.find(([label]) => label === row.label)?.[1] ?? '';
      const severance = (cause: 'unfair_dismissal' | 'objective_dismissal') =>
        computeSeverance({
          cause,
          startDate: parseDate(start),
          endDate: parseDate('2026-09-30'),
          annualSalary: 21000,
        }).amount;
      expect(row.unfair).toBe(severance('unfair_dismissal'));
      expect(row.objective).toBe(severance('objective_dismissal'));
    }
  });

  it('firmar no conforme: an offer of 300 € leaves holidays 201,74 € short', () => {
    const holidays = x.notAgreed.items.find((p) => p.item.id === 'holiday_pay');
    expect(holidays?.status).toBe('below_minimum');
    expect(holidays?.difference).toBe(201.74);
  });

  it('paro: the amounts by salary are the engine’s, with the caps of 2026', () => {
    for (const { salary, base, children } of x.benefitBySalary) {
      expect(base).toBe(Math.min(5101.2, Math.floor(((salary * 14) / 12) * 100) / 100));
      expect(children).toEqual([amounts(base, 0), amounts(base, 1), amounts(base, 2)]);
    }
    expect(x.benefitBySalary.map((b) => b.children.map((c) => c.c1))).toEqual([
      [1061.66, 1061.66, 1061.66],
      [1225, 1225, 1225],
      [1225, 1400, 1470],
    ]);
  });

  it('paro por tiempo trabajado: the scale and the examples', () => {
    expect(x.BENEFIT_SCALE[0]).toEqual([360, 120]);
    expect(x.BENEFIT_SCALE.at(-1)).toEqual([2160, 720]);
    for (const { label, days, benefitDays } of x.durationByTime) {
      const start = x.WORKED.find(([l]) => l === label)?.[1] ?? '';
      expect(days).toBe(contractContributedDays(parseDate(start), parseDate('2026-08-31')));
      expect(benefitDays).toBe(durationForDays(days));
    }
    expect(x.durationByTime.map((d) => d.benefitDays)).toEqual([0, 120, 240, 360, 720]);
  });

  it('paro: no benefit after a resignation, a disciplinary dismissal gives it', () => {
    expect(x.benefitAfterResignation.entitled).toBe('no');
    expect(x.benefitAfterDismissal).toMatchObject({ entitled: 'yes', duration: { days: 360 } });
    const disciplinary = estimateBenefit(
      {
        ...person,
        cause: 'disciplinary_dismissal',
        startDate: parseDate('2022-06-01'),
        endDate: parseDate('2026-09-30'),
        holidayDaysTaken: 0,
      },
      0,
    );
    expect(x.disciplinary).toEqual(disciplinary);
    expect(x.entitledByCause).toEqual([
      { cause: 'disciplinary_dismissal', entitled: 'yes' },
      { cause: 'unfair_dismissal', entitled: 'yes' },
      { cause: 'objective_dismissal', entitled: 'yes' },
      { cause: 'fixed_term_end', entitled: 'yes' },
      { cause: 'resignation', entitled: 'no' },
    ]);
  });
});
