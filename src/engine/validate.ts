import { compareDates, daysInMonth, addDays, type CivilDate } from './date';
import { minimumHolidays } from './settlement';
import type { FinalPayInput, ContributionPeriod } from './types';

export type InputErrorCode =
  | 'invalid_start_date'
  | 'invalid_end_date'
  | 'end_before_start'
  | 'end_too_far_ahead'
  | 'salary_out_of_range'
  | 'extra_pay_count_out_of_range'
  | 'extra_pay_amount_out_of_range'
  | 'annual_holidays_out_of_range'
  | 'holidays_taken_out_of_range'
  | 'annual_working_holidays_out_of_range'
  | 'working_holidays_taken_out_of_range'
  | 'work_week_out_of_range'
  | 'notice_out_of_range'
  | 'missing_fixed_term_type';

// The UI words each `code` through the dictionary.
export type InputError = {
  readonly field: keyof FinalPayInput;
  readonly code: InputErrorCode;
};

const MAX_SALARY = 1_000_000;
const MAX_DAYS_AHEAD = 365;

const isValidDate = (f: CivilDate): boolean =>
  Number.isInteger(f.y) &&
  Number.isInteger(f.m) &&
  Number.isInteger(f.d) &&
  f.m >= 1 &&
  f.m <= 12 &&
  f.d >= 1 &&
  f.d <= daysInMonth(f.y, f.m);

const isIntInRange = (n: number, min: number, max: number): boolean =>
  Number.isInteger(n) && n >= min && n <= max;

export function validate(e: FinalPayInput, today: CivilDate): readonly InputError[] {
  const errors: InputError[] = [];
  const err = (field: keyof FinalPayInput, code: InputErrorCode) => errors.push({ field, code });

  if (!isValidDate(e.startDate)) err('startDate', 'invalid_start_date');
  if (!isValidDate(e.endDate)) err('endDate', 'invalid_end_date');
  else if (isValidDate(e.startDate) && compareDates(e.endDate, e.startDate) < 0)
    err('endDate', 'end_before_start');
  else if (compareDates(e.endDate, addDays(today, MAX_DAYS_AHEAD)) > 0)
    err('endDate', 'end_too_far_ahead');

  if (!Number.isFinite(e.monthlySalary) || e.monthlySalary <= 0 || e.monthlySalary > MAX_SALARY)
    err('monthlySalary', 'salary_out_of_range');

  const preErte = e.preErteMonthlySalary;
  if (preErte !== undefined && (!Number.isFinite(preErte) || preErte <= 0 || preErte > MAX_SALARY))
    err('preErteMonthlySalary', 'salary_out_of_range');

  if (!isIntInRange(e.extraPayCount, 0, 6)) err('extraPayCount', 'extra_pay_count_out_of_range');

  const extraPayRequired = !e.extraPayProrated && e.extraPayCount > 0;
  if (
    !Number.isFinite(e.extraPayAmount) ||
    e.extraPayAmount > MAX_SALARY ||
    (extraPayRequired ? e.extraPayAmount <= 0 : e.extraPayAmount < 0)
  )
    err('extraPayAmount', 'extra_pay_amount_out_of_range');

  const working = e.holidayUnit === 'working';
  const week = e.workDaysPerWeek;
  const weekValid = week === undefined || isIntInRange(week, 1, 7);
  if (!weekValid) err('workDaysPerWeek', 'work_week_out_of_range');
  // Twice the minimum: 60 calendar days, or as many working days as make them.
  const maxHolidays = 2 * minimumHolidays(e.holidayUnit, weekValid ? week : undefined);
  if (
    !Number.isFinite(e.annualHolidayDays) ||
    e.annualHolidayDays < 0 ||
    e.annualHolidayDays > maxHolidays
  )
    err(
      'annualHolidayDays',
      working ? 'annual_working_holidays_out_of_range' : 'annual_holidays_out_of_range',
    );
  const taken = e.holidayDaysTaken;
  if (taken !== null && (!Number.isFinite(taken) || taken < 0 || taken > maxHolidays))
    err(
      'holidayDaysTaken',
      working ? 'working_holidays_taken_out_of_range' : 'holidays_taken_out_of_range',
    );

  const notice = [
    ['noticeDaysReceived', e.noticeDaysReceived],
    ['agreementNoticeDays', e.agreementNoticeDays],
    ['noticeDaysGiven', e.noticeDaysGiven],
  ] as const;
  for (const [field, value] of notice) {
    if (value !== undefined && (!Number.isFinite(value) || value < 0 || value > 90))
      err(field, 'notice_out_of_range');
  }

  if (e.cause === 'fixed_term_end' && e.fixedTermType === undefined)
    err('fixedTermType', 'missing_fixed_term_type');

  return errors;
}

export type OtherContractErrorCode =
  | 'other_contract_invalid_start_date'
  | 'other_contract_invalid_end_date'
  | 'other_contract_end_before_start'
  | 'other_contract_ends_after_this_one';

export type OtherContractError = {
  readonly field: `otherContracts.${number}.${keyof ContributionPeriod}`;
  readonly row: number;
  readonly code: OtherContractErrorCode;
};

// Separate from `validate` so the final pay review never depends on these optional rows.
export function validateOtherContracts(
  e: FinalPayInput,
  contracts: readonly ContributionPeriod[],
): readonly OtherContractError[] {
  const errors: OtherContractError[] = [];
  const endValid = isValidDate(e.endDate);
  contracts.forEach((o, row) => {
    const err = (key: keyof ContributionPeriod, code: OtherContractErrorCode) =>
      errors.push({ field: `otherContracts.${row}.${key}`, row, code });
    const startValid = isValidDate(o.startDate);
    if (!startValid) err('startDate', 'other_contract_invalid_start_date');
    if (!isValidDate(o.endDate)) err('endDate', 'other_contract_invalid_end_date');
    else if (startValid && compareDates(o.endDate, o.startDate) < 0)
      err('endDate', 'other_contract_end_before_start');
    else if (endValid && compareDates(o.endDate, e.endDate) > 0)
      err('endDate', 'other_contract_ends_after_this_one');
  });
  return errors;
}
