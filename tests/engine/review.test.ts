import { describe, expect, it } from 'vitest';
import { exact } from '../../src/engine/money';
import { parseDate as f } from '../../src/engine/date';
import { reviewFinalPay, type EmployerFigures } from '../../src/engine/review';
import type { FinalPayInput } from '../../src/engine/types';

const TODAY = f('2026-10-06');
const base: FinalPayInput = {
  cause: 'unfair_dismissal',
  startDate: f('2010-03-01'),
  endDate: f('2026-09-15'),
  monthlySalary: 2500,
  extraPayProrated: true,
  extraPayCount: 0,
  extraPayAmount: 0,
  extraPayAccrual: 'unknown',
  holidayUnit: 'calendar',
  annualHolidayDays: 30,
  holidayDaysTaken: 10,
};
const withInput = (o: Partial<FinalPayInput>): FinalPayInput => ({ ...base, ...o });

const review = (e: FinalPayInput, c: EmployerFigures = {}) => {
  const r = reviewFinalPay(e, c, TODAY);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.review;
};

describe('reviewFinalPay', () => {
  it('(a) unfair dismissal with 40,000 € severance: below the minimum', () => {
    const p = review(base, { severance: 40000 }).items.find((x) => x.item.id === 'severance');
    expect(p?.status).toBe('below_minimum');
    expect(p?.difference).toBe(7178.08);
  });

  it('holiday days are bounded at twice the minimum: 60 calendar, 44 or 52 working', () => {
    const errors = (o: Partial<FinalPayInput>) => {
      const r = reviewFinalPay(withInput(o), {}, TODAY);
      return r.ok ? [] : r.errors;
    };
    expect(errors({ annualHolidayDays: 45, holidayDaysTaken: 45 })).toEqual([]);
    expect(errors({ holidayUnit: 'working', annualHolidayDays: 44, holidayDaysTaken: 44 })).toEqual(
      [],
    );
    expect(errors({ holidayUnit: 'working', annualHolidayDays: 45, holidayDaysTaken: 45 })).toEqual(
      [
        { field: 'annualHolidayDays', code: 'annual_working_holidays_out_of_range' },
        { field: 'holidayDaysTaken', code: 'working_holidays_taken_out_of_range' },
      ],
    );
    expect(errors({ holidayUnit: 'working', workDaysPerWeek: 6, annualHolidayDays: 52 })).toEqual(
      [],
    );
    expect(errors({ holidayUnit: 'working', workDaysPerWeek: 8 })).toContainEqual({
      field: 'workDaysPerWeek',
      code: 'work_week_out_of_range',
    });
    expect(errors({ annualHolidayDays: 61 })).toEqual([
      { field: 'annualHolidayDays', code: 'annual_holidays_out_of_range' },
    ]);
  });

  it('(b) end before start → error on endDate', () => {
    const r = reviewFinalPay(withInput({ endDate: f('2009-01-01') }), {}, TODAY);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toEqual([{ field: 'endDate', code: 'end_before_start' }]);
    }
  });

  it('(c) fixed-term end with no type → error', () => {
    const r = reviewFinalPay(withInput({ cause: 'fixed_term_end' }), {}, TODAY);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((x) => x.field)).toContain('fixedTermType');
  });

  it('(d) disciplinary dismissal: unfair reference and severance at 0', () => {
    const rev = review(withInput({ cause: 'disciplinary_dismissal' }));
    expect(rev.unfairReference).toBeGreaterThan(0);
    const severance = rev.items.find((x) => x.item.id === 'severance');
    expect(severance?.item.range).toEqual(exact(0));
    expect(severance?.item.zeroReason).toBe('disciplinary_dismissal');
    expect(severance?.item.sources[0]?.id).toBe('et55');
  });

  it('(d2) objective dismissal: the unfair reference at 33 days a year, with its caps', () => {
    const rev = review(
      withInput({
        cause: 'objective_dismissal',
        startDate: f('2024-01-01'),
        endDate: f('2026-06-30'),
        monthlySalary: 3000,
        extraPayProrated: true,
        noticeDaysReceived: 15,
      }),
    );
    // 30 months × 2.75 = 82.5 days × 36,000 / 365 = 8,136.986…, rounded to the cent.
    expect(rev.unfairReference).toBe(8136.99);
  });

  it('(d3) no unfair reference for a cause that is not a dismissal the court could reclassify', () => {
    for (const o of [
      { cause: 'unfair_dismissal' },
      { cause: 'resignation' },
      { cause: 'fixed_term_end', fixedTermType: 'production_circumstances' },
    ] as const)
      expect(review(withInput(o)).unfairReference, o.cause).toBeNull();
  });

  it.each([
    [{ cause: 'resignation' }, 'resignation', 'et49_1d'],
    [{ cause: 'fixed_term_end', fixedTermType: 'replacement' }, 'replacement', 'et49_1c'],
    [{ cause: 'fixed_term_end', fixedTermType: 'training' }, 'training', 'et49_1c'],
    [{ cause: 'fixed_term_end', fixedTermType: 'production_circumstances' }, undefined, 'et49_1c'],
    [{ cause: 'unfair_dismissal' }, undefined, 'et56'],
  ] as const)('zero severance reason for %o', (o, reason, source) => {
    const severance = review(withInput(o)).items.find((x) => x.item.id === 'severance');
    expect(severance?.item.zeroReason).toBe(reason);
    expect(severance?.item.sources[0]?.id).toBe(source);
  });

  it('(e) a correct final pay never comes out below the minimum', () => {
    const inputs: FinalPayInput[] = [
      base,
      withInput({ cause: 'disciplinary_dismissal' }),
      withInput({ cause: 'objective_dismissal', noticeDaysReceived: 5 }),
      withInput({ cause: 'fixed_term_end', fixedTermType: 'production_circumstances' }),
      withInput({ cause: 'fixed_term_end', fixedTermType: 'training', startDate: f('2024-01-10') }),
      withInput({
        cause: 'resignation',
        extraPayProrated: false,
        extraPayCount: 2,
        extraPayAmount: 2500,
        agreementNoticeDays: 15,
        noticeDaysGiven: 3,
      }),
      withInput({
        cause: 'objective_dismissal',
        extraPayProrated: false,
        extraPayCount: 1,
        extraPayAmount: 2500,
      }),
    ];
    for (const e of inputs) {
      const noFigures = review(e);
      const figures: EmployerFigures = {};
      for (const p of noFigures.items) {
        if (p.item.range) figures[p.item.id] = p.item.range.max;
      }
      const rev = review(e, figures);
      expect(rev.items.filter((x) => x.status === 'below_minimum')).toEqual([]);
    }
  });

  it('(f) unchecked always includes net pay', () => {
    for (const e of [base, withInput({ cause: 'resignation' })]) {
      expect(review(e).uncheckedCodes).toContain('net_pay');
    }
  });

  it('additional extra payments only when there are more than two', () => {
    expect(review(base).uncheckedCodes).not.toContain('additional_extra_pay');
    const e = withInput({ extraPayProrated: false, extraPayCount: 3, extraPayAmount: 2500 });
    expect(review(e).uncheckedCodes).toContain('additional_extra_pay');
  });

  it('rejects an end date more than a year ahead', () => {
    const r = reviewFinalPay(withInput({ endDate: f('2028-01-01') }), {}, TODAY);
    expect(r.ok).toBe(false);
  });

  it.each([
    ['2014-02-15', '2015-07-16', 3000, 4610.96],
    ['2012-10-10', '2026-10-09', 1825, 27885],
  ])(
    'severance in the CGPJ zone: %s → %s with %f matches %f',
    (startDate, endDate, monthly, figure) => {
      const rev = review(
        withInput({ startDate: f(startDate), endDate: f(endDate), monthlySalary: monthly }),
        {
          severance: figure,
        },
      );
      const severance = rev.items.find((x) => x.item.id === 'severance');
      expect(severance?.status).toBe('matches');
      expect(severance?.item.range?.min).not.toBe(severance?.item.range?.max);
    },
  );
});

const itemOf = (e: FinalPayInput, id: string, c: EmployerFigures = {}) =>
  review(e, c).items.find((x) => x.item.id === id);

describe('a collective dismissal (ERE)', () => {
  const since1995 = { startDate: f('1995-01-01'), monthlySalary: 3000 };
  const ere = withInput({ ...since1995, cause: 'collective_dismissal' });
  const objective = withInput({ ...since1995, cause: 'objective_dismissal' });

  it('counts the objective minimum, 20 days a year capped at 12 monthly salaries', () => {
    const severance = itemOf(ere, 'severance');
    // Since 1995 the 20 days a year pass 360: 360 × 36,000 / 365.
    expect(severance?.item.range).toEqual(exact(35506.85));
    expect(severance?.item.range).toEqual(itemOf(objective, 'severance')?.item.range);
    expect(severance?.item.calculation[0]?.key).toBe('severance.collective');
    expect(severance?.item.calculation.map((p) => p.key)).toContain('severance.cap');
    expect(severance?.item.sources.map((s) => s.id)).toEqual([
      'et51',
      'et53',
      'cgpjGuide',
      'sts651_2026',
    ]);
  });

  it('marks the figure as a minimum the agreement may improve; an objective one is not', () => {
    expect(itemOf(ere, 'severance')?.item.orMore).toBe('ere_agreement');
    expect(itemOf(objective, 'severance')?.item.orMore).toBeUndefined();
  });

  it('a lower severance than the minimum is below it, as for an objective dismissal', () => {
    expect(itemOf(ere, 'severance', { severance: 30000 })?.status).toBe('below_minimum');
  });

  it('has the 15 days of notice of art. 53.1.c and the unfair reference', () => {
    const notice = itemOf(withInput({ ...ere, noticeDaysReceived: 5 }), 'employer_notice');
    expect(notice?.item.calculation[0]?.vars?.['faltan']).toBe(10);
    expect(notice?.item.sources.map((s) => s.id)).toEqual(['et53', 'et51']);
    expect(review(ere).unfairReference).toBe(review(objective).unfairReference);
  });
});

describe('a cause the person does not know', () => {
  const unknown = withInput({ cause: 'unknown' });

  it('reviews only what does not depend on it, and never the severance', () => {
    const r = review(unknown, { severance: 1000 });
    expect(r.items.map((p) => p.item.id)).toEqual(['pending_salary', 'holiday_pay', 'severance']);
    const severance = r.items.find((p) => p.item.id === 'severance');
    expect(severance?.item.range).toBeNull();
    expect(severance?.item.missingAnswer).toBe('cause');
    expect(severance?.status).toBe('not_checkable');
    expect(r.unfairReference).toBeNull();
  });

  it('keeps the items that do not depend on it as they are', () => {
    const known = review(base).items.find((p) => p.item.id === 'pending_salary');
    expect(review(unknown).items[0]?.item.range).toEqual(known?.item.range);
  });
});

describe('a dismissal during an ERTE', () => {
  const full = withInput({
    startDate: f('2020-01-01'),
    endDate: f('2025-12-31'),
    monthlySalary: 2000,
  });

  it('with a reduced working day: the severance uses the full salary from before', () => {
    const reduced = withInput({
      ...full,
      monthlySalary: 1000,
      erte: 'reduced',
      preErteMonthlySalary: 2000,
    });
    const severance = itemOf(reduced, 'severance');
    // 72 months × 2.75 = 198 days × 24,000 / 365.
    expect(severance?.item.range).toEqual(exact(13019.18));
    expect(severance?.item.range).toEqual(itemOf(full, 'severance')?.item.range);
    expect(severance?.item.calculation[0]).toEqual({
      key: 'severance.erte_reduced',
      vars: { salario: { euros: 2000 } },
    });
    // The month's salary is what was actually earned.
    expect(itemOf(reduced, 'pending_salary')?.item.range).toEqual(exact(1000));
  });

  it('with the contract suspended: the salary of the months worked, not the ERTE payslips', () => {
    const suspended = withInput({
      ...full,
      monthlySalary: 600,
      erte: 'suspended',
      preErteMonthlySalary: 2000,
    });
    const severance = itemOf(suspended, 'severance');
    expect(severance?.item.range).toEqual(itemOf(full, 'severance')?.item.range);
    expect(severance?.item.calculation[0]?.key).toBe('severance.erte_suspended');
  });

  it('without the salary from before: no severance figure, nor a reference', () => {
    const e = withInput({
      ...full,
      cause: 'objective_dismissal',
      monthlySalary: 1000,
      erte: 'reduced',
    });
    const severance = itemOf(e, 'severance', { severance: 100 });
    expect(severance?.item.range).toBeNull();
    expect(severance?.item.missingAnswer).toBe('pre_erte_salary');
    expect(severance?.status).toBe('not_checkable');
    expect(severance?.item.calculation.map((p) => p.key)).toEqual([
      'severance.erte_salary_unknown',
    ]);
    expect(review(e).unfairReference).toBeNull();
  });

  it('the reference for an objective dismissal uses the salary from before too', () => {
    const objective = { ...full, cause: 'objective_dismissal' } as const;
    expect(
      review(
        withInput({
          ...objective,
          monthlySalary: 1000,
          erte: 'reduced',
          preErteMonthlySalary: 2000,
        }),
      ).unfairReference,
    ).toBe(review(withInput(objective)).unfairReference);
  });

  it('«No lo sé» changes no figure', () => {
    expect(itemOf(withInput({ ...full, erte: 'unknown' }), 'severance')?.item).toEqual(
      itemOf(full, 'severance')?.item,
    );
  });

  it('rejects a salary from before out of range', () => {
    const r = reviewFinalPay(withInput({ erte: 'reduced', preErteMonthlySalary: 0 }), {}, TODAY);
    expect(r.ok ? [] : r.errors).toEqual([
      { field: 'preErteMonthlySalary', code: 'salary_out_of_range' },
    ]);
  });
});
