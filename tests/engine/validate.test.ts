import { describe, expect, it } from 'vitest';
import { parseDate as f } from '../../src/engine/date';
import type { FinalPayInput } from '../../src/engine/types';
import { validate, type InputError } from '../../src/engine/validate';

const TODAY = f('2026-10-06');
const valid: FinalPayInput = {
  cause: 'unfair_dismissal',
  startDate: f('2020-01-01'),
  endDate: f('2026-09-15'),
  monthlySalary: 2000,
  extraPayProrated: true,
  extraPayCount: 0,
  extraPayAmount: 0,
  extraPayAccrual: 'unknown',
  holidayUnit: 'calendar',
  annualHolidayDays: 30,
  holidayDaysTaken: 10,
};
const errorsOf = (over: Partial<FinalPayInput>): readonly InputError[] =>
  validate({ ...valid, ...over }, TODAY);
const one = (field: InputError['field'], code: InputError['code']) => [{ field, code }];

describe('validate', () => {
  it('accepts a complete, consistent input', () => {
    expect(errorsOf({})).toEqual([]);
  });

  describe('dates', () => {
    it.each([
      ['a month 13', { y: 2020, m: 13, d: 1 }],
      ['a month 0', { y: 2020, m: 0, d: 1 }],
      ['a day 0', { y: 2020, m: 1, d: 0 }],
      ['a day past the month', { y: 2023, m: 2, d: 29 }],
      ['a fractional year', { y: 2020.5, m: 1, d: 1 }],
      ['a fractional month', { y: 2020, m: 1.5, d: 1 }],
      ['a fractional day', { y: 2020, m: 1, d: 1.5 }],
    ])('rejects %s in both dates', (_, date) => {
      expect(errorsOf({ startDate: date })).toEqual(one('startDate', 'invalid_start_date'));
      expect(errorsOf({ endDate: date })).toEqual(one('endDate', 'invalid_end_date'));
    });

    it('does not compare an invalid start with the end', () => {
      expect(errorsOf({ startDate: { y: 2030, m: 13, d: 1 } })).toEqual(
        one('startDate', 'invalid_start_date'),
      );
    });

    it('lets the end fall on the start, not before it', () => {
      expect(errorsOf({ endDate: valid.startDate })).toEqual([]);
      expect(errorsOf({ endDate: f('2019-12-31') })).toEqual(one('endDate', 'end_before_start'));
    });

    it('lets the end be at most a year ahead', () => {
      expect(errorsOf({ endDate: f('2027-10-06') })).toEqual([]);
      expect(errorsOf({ endDate: f('2027-10-07') })).toEqual(one('endDate', 'end_too_far_ahead'));
    });
  });

  describe('money', () => {
    it.each([0, -1, NaN, Infinity, 1_000_001])(
      'rejects a monthly salary of %f',
      (monthlySalary) => {
        expect(errorsOf({ monthlySalary })).toEqual(one('monthlySalary', 'salary_out_of_range'));
      },
    );
    it.each([0.01, 1_000_000])('accepts a monthly salary of %f', (monthlySalary) => {
      expect(errorsOf({ monthlySalary })).toEqual([]);
    });

    it.each([0, -1, NaN, 1_000_001])('rejects a pre-ERTE salary of %f', (preErteMonthlySalary) => {
      expect(errorsOf({ preErteMonthlySalary })).toEqual(
        one('preErteMonthlySalary', 'salary_out_of_range'),
      );
    });
    it.each([1_000_000])('accepts a pre-ERTE salary of %s', (preErteMonthlySalary) => {
      expect(errorsOf({ preErteMonthlySalary })).toEqual([]);
    });
  });

  describe('extra pay', () => {
    it.each([-1, 1.5, 7, NaN])('rejects %f extra payments', (extraPayCount) => {
      expect(errorsOf({ extraPayCount })).toEqual(
        one('extraPayCount', 'extra_pay_count_out_of_range'),
      );
    });
    it.each([0, 6])('accepts %i extra payments', (extraPayCount) => {
      expect(errorsOf({ extraPayCount })).toEqual([]);
    });

    const apart = { extraPayProrated: false, extraPayCount: 2 };
    const bad = one('extraPayAmount', 'extra_pay_amount_out_of_range');
    it('asks for an amount above 0 when the payments are apart', () => {
      expect(errorsOf({ ...apart, extraPayAmount: 0 })).toEqual(bad);
      expect(errorsOf({ ...apart, extraPayAmount: 1 })).toEqual([]);
    });
    it('lets the amount be 0 when prorated or when there are none', () => {
      expect(errorsOf({ extraPayProrated: true, extraPayCount: 2, extraPayAmount: 0 })).toEqual([]);
      expect(errorsOf({ extraPayProrated: false, extraPayCount: 0, extraPayAmount: 0 })).toEqual(
        [],
      );
    });
    it.each([-1, NaN, 1_000_001])('rejects an amount of %f', (extraPayAmount) => {
      expect(errorsOf({ ...apart, extraPayAmount })).toEqual(bad);
      expect(errorsOf({ extraPayAmount })).toEqual(bad);
    });
    it('accepts the largest amount', () => {
      expect(errorsOf({ ...apart, extraPayAmount: 1_000_000 })).toEqual([]);
    });
  });

  describe('holidays', () => {
    it.each([NaN, -1, 61])('rejects %f annual holiday days', (annualHolidayDays) => {
      expect(errorsOf({ annualHolidayDays })).toContainEqual({
        field: 'annualHolidayDays',
        code: 'annual_holidays_out_of_range',
      });
    });
    it.each([0, 60])('accepts %i annual holiday days', (annualHolidayDays) => {
      expect(errorsOf({ annualHolidayDays, holidayDaysTaken: null })).toEqual([]);
    });

    it.each([NaN, -1, 61])('rejects %f days taken', (holidayDaysTaken) => {
      expect(errorsOf({ holidayDaysTaken })).toEqual(
        one('holidayDaysTaken', 'holidays_taken_out_of_range'),
      );
    });
    it.each([null, 0, 60])('accepts %s days taken', (holidayDaysTaken) => {
      expect(errorsOf({ holidayDaysTaken })).toEqual([]);
    });

    it.each([0, 1.5, 8])('rejects a work week of %f days', (workDaysPerWeek) => {
      expect(errorsOf({ holidayUnit: 'working', workDaysPerWeek })).toEqual(
        one('workDaysPerWeek', 'work_week_out_of_range'),
      );
    });
    it.each([1, 7])('accepts a work week of %s days', (workDaysPerWeek) => {
      expect(
        errorsOf({
          holidayUnit: 'working',
          workDaysPerWeek,
          annualHolidayDays: 4,
          holidayDaysTaken: 4,
        }),
      ).toEqual([]);
    });
  });

  describe('notice days', () => {
    const fields = ['noticeDaysReceived', 'agreementNoticeDays', 'noticeDaysGiven'] as const;
    it.each(fields)('checks %s alone', (field) => {
      for (const value of [NaN, -1, 91])
        expect(errorsOf({ [field]: value })).toEqual(one(field, 'notice_out_of_range'));
      for (const value of [undefined, 0, 90]) expect(errorsOf({ [field]: value })).toEqual([]);
    });
    it('reports every field that is out of range', () => {
      expect(
        errorsOf({ noticeDaysReceived: -1, agreementNoticeDays: 91, noticeDaysGiven: 5 }),
      ).toEqual([
        { field: 'noticeDaysReceived', code: 'notice_out_of_range' },
        { field: 'agreementNoticeDays', code: 'notice_out_of_range' },
      ]);
    });
  });

  it('asks which fixed-term contract it was', () => {
    expect(errorsOf({ cause: 'fixed_term_end' })).toEqual(
      one('fixedTermType', 'missing_fixed_term_type'),
    );
    expect(errorsOf({ cause: 'fixed_term_end', fixedTermType: 'training' })).toEqual([]);
    expect(errorsOf({ cause: 'resignation' })).toEqual([]);
  });
});
