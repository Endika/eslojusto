import { describe, expect, it } from 'vitest';
import { employmentFailedChecks, employmentIncomplete } from '../src/domain/employment-checks';
import { employmentMerge } from '../src/domain/employment-merge';
import { parseReading } from '../src/domain/extraction';
import { f, page } from './support/fields';

const PAGES = [
  page(1, 'employment_contract'),
  page(2, 'job_offer'),
  page(3, 'payslip'),
  page(4, 'work_history'),
];
const checks = (input: Record<string, unknown>) =>
  employmentFailedChecks(parseReading({ pages: PAGES, ...input }, PAGES.length, 'employment'));
const row = (values: Record<string, unknown>) => ({ ...values, confidence: 'high' });
const line = (month: string, amount: number) =>
  row({ month, concept: 'SALARIO BASE', amount, category: 'salary' });

describe('employmentFailedChecks', () => {
  it('passes a coherent pack', () => {
    expect(
      checks({
        employment_contract: {
          startDate: f('2026-03-01'),
          endDate: f('2026-08-31'),
          salaryAmount: f(1600),
          salaryPeriod: f('month'),
          payments: f(14),
          annualSalaryAmount: f(22400),
          weeklyHours: f(40),
        },
        job_offer: { weeklyHours: f(40) },
        employment_payslips: {
          payslips: [
            row({
              month: '2026-02',
              periodStart: '2026-02-01',
              periodEnd: '2026-02-28',
              totalAccrued: 1600,
            }),
          ],
          lines: [line('2026-02', 1400), line('2026-02', 200.5)],
        },
        employment_work_history: {
          contracts: [row({ startDate: '2024-01-01', endDate: '2024-06-30' })],
        },
      }),
    ).toEqual([]);
  });

  it.each([
    [
      'a contract',
      { employment_contract: { startDate: f('2026-03-01'), endDate: f('2026-02-28') } },
    ],
    [
      'a payslip period',
      {
        employment_payslips: {
          payslips: [row({ month: '2026-03', periodStart: '2026-03-31', periodEnd: '2026-03-01' })],
        },
      },
    ],
    [
      'a work-history row',
      {
        employment_work_history: {
          contracts: [row({ startDate: '2024-06-30', endDate: '2024-01-01' })],
        },
      },
    ],
  ])('finds the end before the start in %s', (_, input) => {
    expect(checks(input)).toContain('end_before_start');
  });

  it.each([
    ['starts after the first', '2026-03-02', '2026-03-31'],
    ['ends before the last day', '2026-03-01', '2026-03-30'],
    ['is another month', '2026-04-01', '2026-04-30'],
  ])('finds a payslip whose period %s', (_, periodStart, periodEnd) => {
    expect(
      checks({
        employment_payslips: { payslips: [row({ month: '2026-03', periodStart, periodEnd })] },
      }),
    ).toEqual(['payslip_not_whole_month']);
  });

  it('knows February and leap years', () => {
    const february = (year: number, last: number) =>
      checks({
        employment_payslips: {
          payslips: [
            row({
              month: `${year}-02`,
              periodStart: `${year}-02-01`,
              periodEnd: `${year}-02-${last}`,
            }),
          ],
        },
      });
    expect(february(2028, 29)).toEqual([]);
    expect(february(2026, 28)).toEqual([]);
    expect(february(2026, 27)).toEqual(['payslip_not_whole_month']);
  });

  it('finds the lines of a month more than 1 € from its gross totals', () => {
    const payslips = (lines: number[], totals: (number | undefined)[]) =>
      checks({
        employment_payslips: {
          payslips: totals.map((totalAccrued) =>
            row({ month: '2026-06', ...(totalAccrued !== undefined && { totalAccrued }) }),
          ),
          lines: lines.map((amount) => line('2026-06', amount)),
        },
      });
    expect(payslips([700, 700], [700, 700])).toEqual([]);
    expect(payslips([700, 701], [1400])).toEqual([]);
    expect(payslips([700, 701.01], [1400])).toEqual(['payslip_lines_do_not_sum']);
    // A payslip of the month without its total: nothing to set the lines against.
    expect(payslips([700, 900], [700, undefined])).toEqual([]);
  });

  it('finds weekly hours over 80 in the contract or the offer', () => {
    expect(checks({ employment_contract: { weeklyHours: f(80) } })).toEqual([]);
    expect(checks({ employment_contract: { weeklyHours: f(80.5) } })).toEqual(['hours_over_week']);
    expect(checks({ job_offer: { weeklyHours: f(90) } })).toEqual(['hours_over_week']);
  });

  it('finds a monthly salary times its payments more than 5 % from the annual one', () => {
    const salary = (salaryPeriod: string, annualSalaryAmount: number) =>
      checks({
        employment_contract: {
          salaryAmount: f(1000),
          salaryPeriod: f(salaryPeriod),
          payments: f(14),
          annualSalaryAmount: f(annualSalaryAmount),
        },
      });
    expect(salary('month', 14_000)).toEqual([]);
    expect(salary('month', 14_700)).toEqual([]);
    expect(salary('month', 12_000)).toEqual(['salary_period_mismatch']);
    expect(salary('day', 12_000)).toEqual([]);
  });
});

describe('employmentIncomplete', () => {
  const incomplete = (input: Record<string, unknown>, readability = 'ok') => {
    const pages = [page(1, 'employment_contract', 1, 'high', undefined, readability as 'ok')];
    const reading = parseReading({ pages, ...input }, 1, 'employment');
    return employmentIncomplete(reading, employmentMerge(reading, input));
  };

  it('doubts a legible contract with neither its start nor its salary', () => {
    expect(incomplete({ employment_contract: { modality: f('permanent') } })).toBe(true);
    expect(incomplete({ employment_contract: { startDate: f('2026-03-01') } })).toBe(false);
    expect(incomplete({ employment_contract: { salaryAmount: f(1600) } })).toBe(false);
  });

  it('does not doubt a contract set aside as unreadable', () => {
    expect(incomplete({}, 'blurry')).toBe(false);
  });
});
