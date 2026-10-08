import { describe, expect, it } from 'vitest';
import { addDays, parseDate } from '../../../src/engine/date';
import { phrase } from '../../../src/engine/employment/calculation';
import { EMPLOYMENT_NORMS } from '../../../src/engine/employment/data/norms';
import { assessHolidaysAndPay } from '../../../src/engine/employment/holidays-pay';
import { round2 } from '../../../src/engine/money';
import { offerPass } from '../../../src/engine/employment/readings';
import type { EmploymentInput, Finding, Holidays } from '../../../src/engine/employment/types';
import { contract } from './input';

const findings = (change: Partial<EmploymentInput>): Finding[] =>
  assessHolidaysAndPay(contract(change), EMPLOYMENT_NORMS).map((a) => {
    if (a.kind !== 'single') throw new Error('expected single findings');
    return a.finding;
  });

const findingFor = (change: Partial<EmploymentInput>, id: Finding['id']): Finding => {
  const found = findings(change).find((f) => f.id === id);
  if (found === undefined) throw new Error(`no finding ${id}`);
  return found;
};

const holidays = (change: Partial<Holidays>): Partial<EmploymentInput> => ({
  holidays: { days: 30, unit: 'calendar', workDaysPerWeek: 5, includedInSalary: false, ...change },
});

describe('holidays (art. 38.1 ET)', () => {
  it('22 working days in a five-day week are to review, with their equivalence', () => {
    expect(findingFor(holidays({ days: 22, unit: 'working' }), 'holidays_30')).toMatchObject({
      status: 'review_it',
      calculation: [
        phrase('holidays.working_days_equivalent', {
          days: { days: 22 },
          week: { integer: 5 },
          calendar: { days: 30 },
        }),
        phrase('holidays.counted_in_calendar_days', { minimum: { days: 30 } }),
      ],
    });
  });

  it('working days without the working week give no equivalence', () => {
    const finding = findingFor(
      holidays({ days: 22, unit: 'working', workDaysPerWeek: null }),
      'holidays_30',
    );
    expect(finding.status).toBe('review_it');
    expect(finding.calculation[0]).toEqual(phrase('holidays.working_days', { days: { days: 22 } }));
  });

  it('thirty working days cover thirty calendar ones', () => {
    expect(findingFor(holidays({ days: 30, unit: 'working' }), 'holidays_30').status).toBe(
      'within_limit',
    );
  });

  it('25 calendar days are below the minimum', () => {
    const finding = findingFor(holidays({ days: 25 }), 'holidays_30');
    expect(finding.status).toBe('below_minimum');
    expect(offerPass([{ kind: 'single', finding }])).toBe(true);
  });

  it('fewer days than the agreement the person names depends on it', () => {
    const agreement = { ...contract().agreement, holidayDays: 32 };
    expect(findingFor({ ...holidays({}), agreement }, 'holidays_30')).toMatchObject({
      status: 'depends_on_agreement',
      basedOnYourAnswer: true,
    });
  });

  it('holidays included in the salary of an open-ended contract are void', () => {
    const finding = findingFor(holidays({ includedInSalary: true }), 'holidays_not_paid_out');
    expect(finding.status).toBe('clause_void');
    expect(finding.calculation).toEqual([
      phrase('holidays.included_in_salary'),
      phrase('clause.partial_nullity'),
    ]);
  });

  it('a fixed-term contract of 90 days is to review: art. 4.1 needs holidays outside it', () => {
    const finding = findingFor(
      {
        ...holidays({ includedInSalary: true }),
        modality: 'production',
        startDate: parseDate('2026-03-01'),
        endDate: parseDate('2026-05-29'),
      },
      'holidays_not_paid_out',
    );
    expect(finding.status).toBe('review_it');
    expect(finding.sources.map((s) => s.id)).toEqual([
      'holidays_not_paid_out',
      'smi_temporary_120',
    ]);
  });

  it('a fixed-term contract of 121 days may not', () => {
    expect(
      findingFor(
        {
          ...holidays({ includedInSalary: true }),
          modality: 'production',
          startDate: parseDate('2026-03-01'),
          endDate: parseDate('2026-06-29'),
        },
        'holidays_not_paid_out',
      ).status,
    ).toBe('clause_void');
  });

  describe('fewer than 30 calendar days against the prorated entitlement', () => {
    // 01-01-2026 to 30-06-2026: 181 days, entitled to 30 × 181 / 365 = 14.88 days.
    const sixMonths = {
      modality: 'production' as const,
      startDate: parseDate('2026-01-01'),
      endDate: parseDate('2026-06-30'),
    };

    it.each([
      [15, 'within_limit'],
      [14, 'review_it'],
      [13, 'below_minimum'],
    ] as const)('%s days in a six-month contract: %s', (days, status) => {
      expect(findingFor({ ...sixMonths, ...holidays({ days }) }, 'holidays_30')).toMatchObject({
        status,
        calculation: [
          phrase('holidays.calendar_days', { days: { days } }),
          phrase('holidays.prorated_entitlement', {
            span: { days: 181 },
            entitled: { days: 14.88 },
          }),
        ],
      });
    });

    it('a figure above the prorated one may be annual: 25 days in six months are to review', () => {
      expect(findingFor({ ...sixMonths, ...holidays({ days: 25 }) }, 'holidays_30')).toMatchObject({
        status: 'review_it',
        calculation: [
          phrase('holidays.calendar_days', { days: { days: 25 } }),
          phrase('holidays.prorated_entitlement', {
            span: { days: 181 },
            entitled: { days: 14.88 },
          }),
          phrase('holidays.may_be_annual'),
        ],
      });
    });

    it('01-11 to 28-02 crosses a year end and prorates whole: 9 of 9.86 days are to review', () => {
      const winter = {
        modality: 'production' as const,
        startDate: parseDate('2026-11-01'),
        endDate: parseDate('2027-02-28'),
      };
      expect(findingFor({ ...winter, ...holidays({ days: 9 }) }, 'holidays_30')).toMatchObject({
        status: 'review_it',
        calculation: [
          phrase('holidays.calendar_days', { days: { days: 9 } }),
          phrase('holidays.prorated_entitlement', {
            span: { days: 120 },
            entitled: { days: 9.86 },
          }),
        ],
      });
    });

    const firstYear = {
      modality: 'permanent' as const,
      startDate: parseDate('2026-07-01'),
      endDate: null,
    };

    it.each([
      ['an open-ended contract started on 01-07', firstYear, 25],
      ['an open-ended contract started on 01-07', firstYear, 20],
      [
        'a fixed-term year from 01-07 to 30-06',
        {
          modality: 'production',
          startDate: parseDate('2026-07-01'),
          endDate: parseDate('2027-06-30'),
        },
        25,
      ],
      [
        'eighteen months across a year end',
        {
          modality: 'production',
          startDate: parseDate('2026-07-01'),
          endDate: parseDate('2027-12-31'),
        },
        20,
      ],
      [
        'a leap year from 01-03-2024 to 28-02-2025',
        {
          modality: 'production',
          startDate: parseDate('2024-03-01'),
          endDate: parseDate('2025-02-28'),
        },
        29,
      ],
      ['a full open-ended year', {}, 29],
    ] as const)('%s owes the whole thirty: %s days are below', (_, term, days) => {
      expect(findingFor({ ...term, ...holidays({ days }) }, 'holidays_30')).toMatchObject({
        status: 'below_minimum',
        calculation: [phrase('holidays.calendar_days', { days: { days } })],
      });
    });

    // 01-03-2026 to 08-06-2026: 100 days, entitled to 8.22 days.
    const hundredDays = { startDate: parseDate('2026-03-01'), endDate: parseDate('2026-06-08') };

    it('an agreement above thirty is prorated too: 35 days give 9.59, above the 8.22 stated', () => {
      const agreement = { ...contract().agreement, holidayDays: 35 };
      expect(
        findingFor(
          { ...hundredDays, modality: 'production', agreement, ...holidays({ days: 8.22 }) },
          'holidays_30',
        ),
      ).toMatchObject({
        status: 'depends_on_agreement',
        basedOnYourAnswer: true,
        calculation: [
          phrase('holidays.calendar_days', { days: { days: 8.22 } }),
          phrase('holidays.prorated_entitlement', {
            span: { days: 100 },
            entitled: { days: 8.22 },
          }),
          phrase('holidays.under_your_agreement_prorated', {
            agreed: { days: 35 },
            entitled: { days: 9.59 },
          }),
        ],
      });
    });

    it('an agreement whose prorated part the figure covers leaves it within the limit', () => {
      const agreement = { ...contract().agreement, holidayDays: 31 };
      expect(
        findingFor(
          { ...hundredDays, modality: 'production', agreement, ...holidays({ days: 9 }) },
          'holidays_30',
        ).status,
      ).toBe('within_limit');
    });

    it.each(['permanent', 'discontinuous'] as const)(
      'a %s contract with an end date still owes the thirty',
      (modality) => {
        expect(
          findingFor({ ...hundredDays, modality, ...holidays({ days: 9 }) }, 'holidays_30'),
        ).toMatchObject({
          status: 'below_minimum',
          calculation: [phrase('holidays.calendar_days', { days: { days: 9 } })],
        });
      },
    );

    it.each(['training_alternance', 'training_practice'] as const)(
      'a %s contract with an end date is temporary and prorates',
      (modality) => {
        const term = { ...hundredDays, modality };
        expect(findingFor({ ...term, ...holidays({ days: 9 }) }, 'holidays_30').status).toBe(
          'within_limit',
        );
        expect(findingFor({ ...term, ...holidays({ days: 7 }) }, 'holidays_30').status).toBe(
          'below_minimum',
        );
      },
    );

    it('an unknown modality with an end date is to review when only proration covers it', () => {
      const term = { ...hundredDays, modality: 'unknown' as const };
      expect(findingFor({ ...term, ...holidays({ days: 9 }) }, 'holidays_30')).toMatchObject({
        status: 'review_it',
        calculation: [
          phrase('holidays.calendar_days', { days: { days: 9 } }),
          phrase('holidays.prorated_entitlement', {
            span: { days: 100 },
            entitled: { days: 8.22 },
          }),
          phrase('holidays.prorated_if_temporary'),
        ],
      });
      expect(findingFor({ ...term, ...holidays({ days: 7 }) }, 'holidays_30').status).toBe(
        'below_minimum',
      );
    });

    it.each(['calendar', 'working'] as const)(
      'no holidays at all, in %s days, are below the minimum',
      (unit) => {
        const finding = findingFor(holidays({ days: 0, unit }), 'holidays_30');
        expect(finding.status).toBe('below_minimum');
        expect(offerPass([{ kind: 'single', finding }])).toBe(true);
      },
    );

    it('no holidays in a short fixed term are below its prorated part', () => {
      expect(
        findingFor(
          { ...hundredDays, modality: 'production', ...holidays({ days: 0 }) },
          'holidays_30',
        ).status,
      ).toBe('below_minimum');
    });

    const eventualOf = (span: number) => {
      const startDate = parseDate('2024-03-01');
      return { modality: 'eventual' as const, startDate, endDate: addDays(startDate, span - 1) };
    };

    it.each([
      [50, 3.11],
      [100, 7.22],
      [200, 15.44],
      [300, 23.66],
    ] as const)(
      'a %s-day span: exactly one day under the prorated figure (%s) is to review',
      (span, edge) => {
        const term = eventualOf(span);
        expect(findingFor({ ...term, ...holidays({ days: edge }) }, 'holidays_30').status).toBe(
          'review_it',
        );
        expect(
          findingFor({ ...term, ...holidays({ days: round2(edge - 0.01) }) }, 'holidays_30').status,
        ).toBe('below_minimum');
      },
    );

    describe('holidays paid with the wage of a short fixed term (art. 4.1 of the decree)', () => {
      // 60 days, entitled to 4.93.
      const sixtyDays = eventualOf(60);

      it.each([0, 2])('%s days are to review, not below the minimum', (days) => {
        const all = findings({ ...sixtyDays, ...holidays({ days, includedInSalary: true }) });
        const holidays30 = all.find((f) => f.id === 'holidays_30');
        expect(holidays30).toMatchObject({
          status: 'review_it',
          calculation: [
            phrase('holidays.calendar_days', { days: { days } }),
            phrase('holidays.prorated_entitlement', {
              span: { days: 60 },
              entitled: { days: 4.93 },
            }),
            phrase('holidays.short_temporary_exception', { days: { days: 120 } }),
          ],
        });
        expect(all.find((f) => f.id === 'holidays_not_paid_out')?.status).toBe('review_it');
        expect(offerPass(all.map((finding) => ({ kind: 'single', finding })))).toBe(false);
      });

      it('without them in the wage, 2 days are below the minimum', () => {
        expect(findingFor({ ...sixtyDays, ...holidays({ days: 2 }) }, 'holidays_30').status).toBe(
          'below_minimum',
        );
      });

      it('an unknown modality of 60 days may be one: both findings are to review', () => {
        const all = findings({
          ...sixtyDays,
          modality: 'unknown',
          ...holidays({ days: 0, includedInSalary: true }),
        });
        expect(all.find((f) => f.id === 'holidays_30')?.status).toBe('review_it');
        expect(all.find((f) => f.id === 'holidays_not_paid_out')?.status).toBe('review_it');
      });

      it.each(['eventual', 'replacement', 'unknown'] as const)(
        'a %s contract without an end date may last 120 days: both findings are to review',
        (modality) => {
          const all = findings({
            modality,
            startDate: parseDate('2024-03-01'),
            endDate: null,
            ...holidays({ days: 0, includedInSalary: true }),
          });
          expect(all.find((f) => f.id === 'holidays_30')?.status).toBe('review_it');
          expect(all.find((f) => f.id === 'holidays_not_paid_out')?.status).toBe('review_it');
        },
      );

      it('an unknown modality over 120 days may not', () => {
        expect(
          findingFor(
            { ...eventualOf(121), modality: 'unknown', ...holidays({ includedInSalary: true }) },
            'holidays_not_paid_out',
          ).status,
        ).toBe('clause_void');
      });
    });

    it.each([
      [12, 45, 12.33],
      [8, 35, 9.59],
    ] as const)(
      '%s days in 100 under an agreement of %s, prorated to %s, depend on it',
      (days, agreed, entitled) => {
        const agreement = { ...contract().agreement, holidayDays: agreed };
        expect(
          findingFor({ ...eventualOf(100), agreement, ...holidays({ days }) }, 'holidays_30'),
        ).toMatchObject({
          status: 'depends_on_agreement',
          calculation: [
            phrase('holidays.calendar_days', { days: { days } }),
            phrase('holidays.prorated_entitlement', {
              span: { days: 100 },
              entitled: { days: 8.22 },
            }),
            phrase('holidays.under_your_agreement_prorated', {
              agreed: { days: agreed },
              entitled: { days: entitled },
            }),
          ],
        });
      },
    );

    it.each([1, 10])(
      'no holidays in a %s-day contract stay within rounding: to review, conservatively',
      (span) => {
        expect(
          findingFor({ ...eventualOf(span), ...holidays({ days: 0 }) }, 'holidays_30').status,
        ).toBe('review_it');
      },
    );

    it('366 days of a leap year count as a full year', () => {
      const leap = {
        modality: 'production' as const,
        startDate: parseDate('2024-01-01'),
        endDate: parseDate('2024-12-31'),
      };
      expect(findingFor({ ...leap, ...holidays({ days: 29 }) }, 'holidays_30').status).toBe(
        'below_minimum',
      );
      expect(findingFor({ ...leap, ...holidays({ days: 30 }) }, 'holidays_30').status).toBe(
        'within_limit',
      );
    });

    it('a fixed-term contract without an end date has an unknown span', () => {
      expect(
        findingFor(
          { modality: 'replacement', endDate: null, ...holidays({ days: 20 }) },
          'holidays_30',
        ),
      ).toMatchObject({
        status: 'review_it',
        calculation: [
          phrase('holidays.calendar_days', { days: { days: 20 } }),
          phrase('holidays.span_unknown'),
        ],
      });
    });
  });

  it('without holidays entered there is nothing to compare', () => {
    expect(findingFor({ holidays: null }, 'holidays_30').status).toBe('not_entered');
  });
});

describe('extra payments (art. 31 ET)', () => {
  it('one payment without proration is to review: the agreement may prorate the other', () => {
    expect(findingFor({ extraPays: { count: 1, prorated: false } }, 'extra_pays')).toMatchObject({
      status: 'review_it',
      calculation: [
        phrase('extra_pays.count', { count: { integer: 1 } }),
        phrase('extra_pays.one_may_be_prorated'),
      ],
    });
  });

  it('no payment at all is below the minimum', () => {
    expect(findingFor({ extraPays: { count: 0, prorated: false } }, 'extra_pays')).toMatchObject({
      status: 'below_minimum',
      amount: null,
    });
  });

  it('two payments are within the rule, their amount set by the agreement', () => {
    expect(findingFor({ extraPays: { count: 2, prorated: false } }, 'extra_pays')).toMatchObject({
      status: 'within_limit',
      calculation: [
        phrase('extra_pays.count', { count: { integer: 2 } }),
        phrase('extra_pays.amount_by_agreement'),
      ],
    });
  });

  it('proration is for the agreement to allow', () => {
    expect(findingFor({ extraPays: { count: 2, prorated: true } }, 'extra_pays').status).toBe(
      'depends_on_agreement',
    );
  });

  it('not entered', () => {
    expect(findingFor({ extraPays: null }, 'extra_pays').status).toBe('not_entered');
  });

  // Art. 4.1 of the decree: the daily minimum of a short fixed-term contract holds the extra pays.
  const shortDayRate: Partial<EmploymentInput> = {
    modality: 'production',
    startDate: parseDate('2026-08-01'),
    endDate: parseDate('2026-10-15'),
    salary: {
      amount: 50,
      period: 'day',
      payments: 12,
      prorated: false,
      breakdown: [],
      inKind: null,
    },
  };

  it('a day-rate contract of up to 120 days needs no extra pays of its own', () => {
    const f = findingFor(
      { ...shortDayRate, extraPays: { count: 0, prorated: false } },
      'extra_pays',
    );
    expect(f).toMatchObject({
      status: 'within_limit',
      calculation: [
        phrase('extra_pays.count', { count: { integer: 0 } }),
        phrase('extra_pays.in_daily_minimum', { days: { days: 120 } }),
      ],
    });
    expect(f.sources.map((s) => s.id)).toContain('smi_temporary_120');
  });

  it('a longer day-rate contract still counts its extra pays', () => {
    expect(
      findingFor(
        {
          ...shortDayRate,
          endDate: parseDate('2027-03-01'),
          extraPays: { count: 0, prorated: false },
        },
        'extra_pays',
      ).status,
    ).toBe('below_minimum');
  });
});
