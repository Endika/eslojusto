import { describe, expect, it } from 'vitest';
import { parseDate } from '../../../src/engine/date';
import { phrase } from '../../../src/engine/employment/calculation';
import { EMPLOYMENT_NORMS } from '../../../src/engine/employment/data/norms';
import { assessHolidaysAndPay } from '../../../src/engine/employment/holidays-pay';
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

  it('a fixed-term contract of 90 days may include them', () => {
    const finding = findingFor(
      {
        ...holidays({ includedInSalary: true }),
        modality: 'production',
        startDate: parseDate('2026-03-01'),
        endDate: parseDate('2026-05-29'),
      },
      'holidays_not_paid_out',
    );
    expect(finding.status).toBe('within_limit');
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

  it('without holidays entered there is nothing to compare', () => {
    expect(findingFor({ holidays: null }, 'holidays_30').status).toBe('not_entered');
  });
});

describe('extra payments (art. 31 ET)', () => {
  it('one payment without proration is below the minimum', () => {
    expect(findingFor({ extraPays: { count: 1, prorated: false } }, 'extra_pays')).toMatchObject({
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
});
