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
  describe('dates', () => {
    it.each([['a day past the month', { y: 2023, m: 2, d: 29 }]])(
      'rejects %s in both dates',
      (_, date) => {
        expect(errorsOf({ startDate: date })).toEqual(one('startDate', 'invalid_start_date'));
        expect(errorsOf({ endDate: date })).toEqual(one('endDate', 'invalid_end_date'));
      },
    );

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
    it.each([0, 1_000_001])('rejects a monthly salary of %f', (monthlySalary) => {
      expect(errorsOf({ monthlySalary })).toEqual(one('monthlySalary', 'salary_out_of_range'));
    });
    it.each([1_000_000])('accepts a monthly salary of %f', (monthlySalary) => {
      expect(errorsOf({ monthlySalary })).toEqual([]);
    });

    it.each([1_000_001])('rejects a pre-ERTE salary of %f', (preErteMonthlySalary) => {
      expect(errorsOf({ preErteMonthlySalary })).toEqual(
        one('preErteMonthlySalary', 'salary_out_of_range'),
      );
    });
    it.each([1_000_000])('accepts a pre-ERTE salary of %s', (preErteMonthlySalary) => {
      expect(errorsOf({ preErteMonthlySalary })).toEqual([]);
    });
  });

  describe('extra pay', () => {
    it.each([-1])('rejects %f extra payments', (extraPayCount) => {
      expect(errorsOf({ extraPayCount })).toEqual(
        one('extraPayCount', 'extra_pay_count_out_of_range'),
      );
    });
    it.each([6])('accepts %i extra payments', (extraPayCount) => {
      expect(errorsOf({ extraPayCount })).toEqual([]);
    });

    const apart = { extraPayProrated: false, extraPayCount: 2 };
    const bad = one('extraPayAmount', 'extra_pay_amount_out_of_range');
    it('asks for an amount above 0 when the payments are apart', () => {
      expect(errorsOf({ ...apart, extraPayAmount: 0 })).toEqual(bad);
      expect(errorsOf({ ...apart, extraPayAmount: 1 })).toEqual([]);
    });
    it.each([-1, 1_000_001])('rejects an amount of %f', (extraPayAmount) => {
      expect(errorsOf({ ...apart, extraPayAmount })).toEqual(bad);
      expect(errorsOf({ extraPayAmount })).toEqual(bad);
    });
    it('accepts the largest amount', () => {
      expect(errorsOf({ ...apart, extraPayAmount: 1_000_000 })).toEqual([]);
    });
  });

  describe('holidays', () => {
    it.each([-1])('rejects %f annual holiday days', (annualHolidayDays) => {
      expect(errorsOf({ annualHolidayDays })).toContainEqual({
        field: 'annualHolidayDays',
        code: 'annual_holidays_out_of_range',
      });
    });
    it.each([0])('accepts %i annual holiday days', (annualHolidayDays) => {
      expect(errorsOf({ annualHolidayDays, holidayDaysTaken: null })).toEqual([]);
    });

    it.each([-1])('rejects %f days taken', (holidayDaysTaken) => {
      expect(errorsOf({ holidayDaysTaken })).toEqual(
        one('holidayDaysTaken', 'holidays_taken_out_of_range'),
      );
    });
  });

  describe('notice days', () => {
    const field = 'agreementNoticeDays' as keyof FinalPayInput;
    it('checks agreementNoticeDays alone', () => {
      for (const value of [NaN, -1, 91])
        expect(errorsOf({ [field]: value })).toEqual(one(field, 'notice_out_of_range'));
      for (const value of [undefined, 0, 90]) expect(errorsOf({ [field]: value })).toEqual([]);
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
