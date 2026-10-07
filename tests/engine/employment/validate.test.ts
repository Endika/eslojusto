import { describe, expect, it } from 'vitest';
import { parseDate, type CivilDate } from '../../../src/engine/date';
import { validate, validationWarnings } from '../../../src/engine/employment/validate';
import type { EmploymentInput } from '../../../src/engine/employment/types';
import { contract } from './input';

const TODAY = parseDate('2026-10-07');
const errorsOf = (change: Partial<EmploymentInput>) =>
  validate(contract(change), TODAY).map(({ field, index, code }) => [field, index, code]);
const unchecked = (y: number, m: number, d: number): CivilDate => ({ y, m, d });

describe('validate', () => {
  it('accepts the synthetic contract', () => {
    expect(validate(contract(), TODAY)).toEqual([]);
  });

  it('rejects a date that does not exist', () => {
    expect(errorsOf({ startDate: unchecked(2026, 2, 30) })).toEqual([
      ['startDate', null, 'invalid_date'],
    ]);
  });

  it('accepts a contract starting up to a year ahead, not later', () => {
    expect(errorsOf({ startDate: parseDate('2027-10-07') })).toEqual([]);
    expect(errorsOf({ startDate: parseDate('2027-10-08') })).toEqual([
      ['startDate', null, 'too_far_ahead'],
    ]);
  });

  it('rejects an end before the start', () => {
    expect(errorsOf({ endDate: parseDate('2024-02-29') })).toEqual([
      ['endDate', null, 'before_start'],
    ]);
    expect(errorsOf({ endDate: parseDate('2024-03-01') })).toEqual([]);
  });

  it.each([0, -1, 1_000_001, Number.NaN])('rejects a salary of %s', (amount) => {
    expect(errorsOf({ salary: { ...contract().salary, amount } })).toEqual([
      ['salary.amount', null, 'amount_range'],
    ]);
  });

  it('accepts a salary of 1.000.000 €', () => {
    expect(errorsOf({ salary: { ...contract().salary, amount: 1_000_000 } })).toEqual([]);
  });

  it.each([
    [0, false],
    [80, true],
    [80.5, false],
  ])('weekly hours of %s valid: %s', (weekly, valid) => {
    expect(errorsOf({ contractHours: { weekly, annual: null } }).length === 0).toBe(valid);
  });

  it.each([
    [-1, false],
    [0, true],
    [100, true],
    [101, false],
  ])('a remote share of %s %% valid: %s', (remoteShare, valid) => {
    expect(errorsOf({ remoteShare }).length === 0).toBe(valid);
  });

  it.each([
    [0, false],
    [1, true],
    [16, true],
    [17, false],
    [14.5, false],
  ])('%s payments valid: %s', (payments, valid) => {
    expect(errorsOf({ salary: { ...contract().salary, payments } }).length === 0).toBe(valid);
  });

  it('points at the slot whose start and end are the same', () => {
    expect(
      errorsOf({
        schedule: [
          { day: 1, slots: [{ from: '09:00', to: '14:00' }] },
          { day: 2, slots: [{ from: '09:00', to: '09:00' }] },
          { day: 3, slots: [{ from: '25:00', to: '09:00' }] },
        ],
      }),
    ).toEqual([
      ['schedule', 1, 'empty_slot'],
      ['schedule', 2, 'invalid_time'],
    ]);
  });

  it('accepts a night slot that crosses midnight', () => {
    expect(errorsOf({ schedule: [{ day: 5, slots: [{ from: '22:00', to: '06:00' }] }] })).toEqual(
      [],
    );
  });

  it('checks each payslip on its own', () => {
    const payslip = {
      month: '2026-09',
      wholeMonth: true,
      incidents: false,
      salaryInMoney: 1200,
      inKind: 0,
      proratedExtraPay: 0,
      overtimeHours: null,
      complementaryHours: null,
    };
    expect(
      errorsOf({ payslips: [payslip, { ...payslip, month: '2026-13', salaryInMoney: 0 }] }),
    ).toEqual([
      ['payslips.month', 1, 'invalid_month'],
      ['payslips.salaryInMoney', 1, 'amount_range'],
    ]);
  });

  it('checks the periods of the work history', () => {
    expect(
      errorsOf({
        history: [
          {
            startDate: parseDate('2023-01-01'),
            endDate: parseDate('2022-12-31'),
            employer: 'same',
            kind: 'production',
          },
        ],
      }),
    ).toEqual([['history', 0, 'before_start']]);
  });

  it('checks percentages of a training contract', () => {
    expect(
      errorsOf({
        modality: 'training_alternance',
        training: {
          studiesEndedOn: null,
          disability: null,
          planAttached: null,
          effectiveWorkPercent: { year1: 65, year2: 120 },
        },
      }),
    ).toEqual([['training.effectiveWorkPercent', null, 'percent_range']]);
  });

  it.each([
    ['months', 12, true],
    ['months', 13, false],
    ['weeks', 52, true],
    ['weeks', 53, false],
    ['days', 366, true],
    ['days', 367, false],
  ] as const)('a trial of %s %s valid: %s', (unit, amount, valid) => {
    expect(errorsOf({ trial: { amount, unit } }).length === 0).toBe(valid);
  });

  it.each([
    [12, true],
    [13, false],
  ])('an agreement trial of %s months valid: %s', (trialMonths, valid) => {
    expect(errorsOf({ agreement: { ...contract().agreement, trialMonths } }).length === 0).toBe(
      valid,
    );
  });

  it('rejects a signing day over a year ahead of today', () => {
    expect(
      errorsOf({ startDate: parseDate('2027-10-01'), signedOn: parseDate('2027-10-08') }),
    ).toEqual([['signedOn', null, 'too_far_ahead']]);
  });

  it('rejects a signing day more than a year after the start', () => {
    expect(errorsOf({ signedOn: parseDate('2025-03-01') })).toEqual([]);
    expect(errorsOf({ signedOn: parseDate('2025-03-02') })).toEqual([
      ['signedOn', null, 'too_late_after_start'],
    ]);
  });

  it.each([
    ['1999-12', false],
    ['2000-01', true],
    ['2027-12', true],
    ['2028-01', false],
  ])('a payslip of %s valid: %s', (month, valid) => {
    const payslip = {
      month,
      wholeMonth: true,
      incidents: false,
      salaryInMoney: 1200,
      inKind: 0,
      proratedExtraPay: 0,
      overtimeHours: null,
      complementaryHours: null,
    };
    expect(errorsOf({ payslips: [payslip] }).length === 0).toBe(valid);
  });
});

describe('validate holidays', () => {
  const withDays = (days: number): Partial<EmploymentInput> => ({
    holidays: { days, unit: 'calendar', workDaysPerWeek: null, includedInSalary: false },
  });

  it.each([0, 8.22, 366])('accepts %s holiday days', (days) => {
    expect(errorsOf(withDays(days))).toEqual([]);
  });

  it.each([-1, 367, Number.NaN])('rejects %s holiday days', (days) => {
    expect(errorsOf(withDays(days))).toEqual([['holidays.days', null, 'count_range']]);
  });
});

describe('validationWarnings', () => {
  const withBreakdown = (amount: number, base: number) =>
    contract({
      salary: { ...contract().salary, amount, breakdown: [{ kind: 'base', amount: base }] },
    });

  it('warns when the breakdown falls short of the total, without failing', () => {
    const input = withBreakdown(1300, 1100);
    expect(validationWarnings(input)).toEqual([
      { field: 'salary.breakdown', index: null, code: 'breakdown_short_of_total' },
    ]);
    expect(validate(input, parseDate('2026-10-07'))).toEqual([]);
  });

  it('is quiet when the breakdown adds up', () => {
    expect(validationWarnings(withBreakdown(1300, 1300))).toEqual([]);
  });
});
