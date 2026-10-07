import { addMonthsClamped, compareDates, daysInMonth, type CivilDate } from '../date';
import type { EmploymentInput } from './types';

export type EmploymentField =
  | 'startDate'
  | 'endDate'
  | 'signedOn'
  | 'extensions'
  | 'training.studiesEndedOn'
  | 'training.effectiveWorkPercent'
  | 'salary.amount'
  | 'salary.payments'
  | 'salary.breakdown'
  | 'salary.inKind'
  | 'contractHours.weekly'
  | 'contractHours.annual'
  | 'fullTimeHours'
  | 'agreement.categoryAnnualSalary'
  | 'agreement.annualHours'
  | 'agreement.holidayDays'
  | 'agreement.trialMonths'
  | 'payslips.month'
  | 'payslips.salaryInMoney'
  | 'payslips.inKind'
  | 'payslips.proratedExtraPay'
  | 'payslips.hours'
  | 'trial.amount'
  | 'schedule'
  | 'overtimeAgreed.hoursPerYear'
  | 'partTime.complementary'
  | 'partTime.voluntaryPercent'
  | 'remoteShare'
  | 'realWeeklyHours'
  | 'holidays.days'
  | 'holidays.workDaysPerWeek'
  | 'extraPays.count'
  | 'clauses.months'
  | 'history'
  | 'offer.grossAnnual'
  | 'offer.weeklyHours';

export type ValidationCode =
  | 'invalid_date'
  | 'too_far_ahead'
  | 'before_start'
  | 'amount_range'
  | 'hours_range'
  | 'percent_range'
  | 'payments_range'
  | 'count_range'
  | 'invalid_month'
  | 'invalid_time'
  | 'empty_slot';

export interface ValidationError {
  readonly field: EmploymentField;
  // Position in a list field (payslips, schedule, clauses, history); null otherwise.
  readonly index: number | null;
  readonly code: ValidationCode;
}

// Bounds on what a person can type, not legal limits.
const MAX_AMOUNT = 1_000_000;
const MAX_WEEKLY_HOURS = 80;
const WEEKS_IN_YEAR = 52;
const MAX_ANNUAL_HOURS = MAX_WEEKLY_HOURS * WEEKS_IN_YEAR;
const MAX_PAYMENTS = 16;
const MAX_DAYS_IN_YEAR = 366;
// A contract may be reviewed before it starts, up to a year ahead.
const MONTHS_AHEAD = 12;

const isRealDate = ({ y, m, d }: CivilDate): boolean =>
  Number.isInteger(y) &&
  Number.isInteger(m) &&
  Number.isInteger(d) &&
  m >= 1 &&
  m <= 12 &&
  d >= 1 &&
  d <= daysInMonth(y, m);
const inRange = (v: number, min: number, max: number): boolean =>
  Number.isFinite(v) && v >= min && v <= max;
const positiveUpTo = (v: number, max: number): boolean => Number.isFinite(v) && v > 0 && v <= max;
const isCount = (v: number, max = Number.MAX_SAFE_INTEGER): boolean =>
  Number.isInteger(v) && v >= 0 && v <= max;
const isMonth = (s: string): boolean => {
  const match = /^(\d{4})-(\d{2})$/.exec(s);
  return match !== null && inRange(Number(match[2]), 1, 12);
};
const minutesOf = (s: string): number | null => {
  const match = /^(\d{2}):(\d{2})$/.exec(s);
  if (match === null) return null;
  const [h, m] = [Number(match[1]), Number(match[2])];
  return h <= 23 && m <= 59 ? h * 60 + m : null;
};

export function validate(input: EmploymentInput, today: CivilDate): readonly ValidationError[] {
  const errors: ValidationError[] = [];
  const fail = (field: EmploymentField, code: ValidationCode, index: number | null = null) =>
    errors.push({ field, index, code });
  const amount = (field: EmploymentField, v: number | null, index: number | null = null) => {
    if (v !== null && !positiveUpTo(v, MAX_AMOUNT)) fail(field, 'amount_range', index);
  };
  const amountOrZero = (field: EmploymentField, v: number | null, index: number | null = null) => {
    if (v !== null && !inRange(v, 0, MAX_AMOUNT)) fail(field, 'amount_range', index);
  };
  const weekly = (field: EmploymentField, v: number | null) => {
    if (v !== null && !positiveUpTo(v, MAX_WEEKLY_HOURS)) fail(field, 'hours_range');
  };
  const annual = (field: EmploymentField, v: number | null) => {
    if (v !== null && !positiveUpTo(v, MAX_ANNUAL_HOURS)) fail(field, 'hours_range');
  };
  const percent = (field: EmploymentField, v: number | null) => {
    if (v !== null && !inRange(v, 0, 100)) fail(field, 'percent_range');
  };
  const count = (field: EmploymentField, v: number | null, index: number | null = null) => {
    if (v !== null && !isCount(v)) fail(field, 'count_range', index);
  };

  const start = input.startDate;
  if (!isRealDate(start)) fail('startDate', 'invalid_date');
  else if (compareDates(start, addMonthsClamped(today, MONTHS_AHEAD)) > 0)
    fail('startDate', 'too_far_ahead');
  if (input.endDate !== null) {
    if (!isRealDate(input.endDate)) fail('endDate', 'invalid_date');
    else if (isRealDate(start) && compareDates(input.endDate, start) < 0)
      fail('endDate', 'before_start');
  }
  if (input.signedOn !== null && !isRealDate(input.signedOn)) fail('signedOn', 'invalid_date');
  count('extensions', input.extensions);

  if (input.training !== null) {
    const { studiesEndedOn, effectiveWorkPercent } = input.training;
    if (studiesEndedOn !== null && !isRealDate(studiesEndedOn))
      fail('training.studiesEndedOn', 'invalid_date');
    percent('training.effectiveWorkPercent', effectiveWorkPercent.year1);
    percent('training.effectiveWorkPercent', effectiveWorkPercent.year2);
  }

  amount('salary.amount', input.salary.amount);
  if (!isCount(input.salary.payments, MAX_PAYMENTS) || input.salary.payments < 1)
    fail('salary.payments', 'payments_range');
  input.salary.breakdown.forEach((c, i) => amount('salary.breakdown', c.amount, i));
  amountOrZero('salary.inKind', input.salary.inKind);

  weekly('contractHours.weekly', input.contractHours.weekly);
  annual('contractHours.annual', input.contractHours.annual);
  weekly('fullTimeHours', input.fullTimeHours);
  amount('agreement.categoryAnnualSalary', input.agreement.categoryAnnualSalary);
  annual('agreement.annualHours', input.agreement.annualHours);
  count('agreement.holidayDays', input.agreement.holidayDays);
  if (
    input.agreement.trialMonths !== null &&
    !inRange(input.agreement.trialMonths, 0, MAX_DAYS_IN_YEAR)
  )
    fail('agreement.trialMonths', 'count_range');

  input.payslips.forEach((p, i) => {
    if (!isMonth(p.month)) fail('payslips.month', 'invalid_month', i);
    amount('payslips.salaryInMoney', p.salaryInMoney, i);
    amountOrZero('payslips.inKind', p.inKind, i);
    amountOrZero('payslips.proratedExtraPay', p.proratedExtraPay, i);
    for (const hours of [p.overtimeHours, p.complementaryHours])
      if (hours !== null && !inRange(hours, 0, MAX_ANNUAL_HOURS))
        fail('payslips.hours', 'hours_range', i);
  });

  if (input.trial !== null && !positiveUpTo(input.trial.amount, MAX_DAYS_IN_YEAR))
    fail('trial.amount', 'count_range');

  input.schedule?.forEach((day, i) => {
    for (const slot of day.slots) {
      const [from, to] = [minutesOf(slot.from), minutesOf(slot.to)];
      if (from === null || to === null) fail('schedule', 'invalid_time', i);
      else if (from === to) fail('schedule', 'empty_slot', i);
    }
  });

  const overtime = input.overtimeAgreed?.hoursPerYear;
  if (typeof overtime === 'number' && !inRange(overtime, 0, MAX_ANNUAL_HOURS))
    fail('overtimeAgreed.hoursPerYear', 'hours_range');
  if (input.partTime !== null) {
    const { complementary, voluntaryPercent } = input.partTime;
    if (complementary !== null) {
      percent('partTime.complementary', complementary.percent);
      count('partTime.complementary', complementary.noticeDays);
    }
    percent('partTime.voluntaryPercent', voluntaryPercent);
  }
  percent('remoteShare', input.remoteShare);
  weekly('realWeeklyHours', input.realWeeklyHours);

  if (input.holidays !== null) {
    if (!positiveUpTo(input.holidays.days, MAX_DAYS_IN_YEAR)) fail('holidays.days', 'count_range');
    const perWeek = input.holidays.workDaysPerWeek;
    if (perWeek !== null && (!isCount(perWeek, 7) || perWeek < 1))
      fail('holidays.workDaysPerWeek', 'count_range');
  }
  if (input.extraPays !== null) count('extraPays.count', input.extraPays.count);
  input.clauses.forEach((c, i) => count('clauses.months', c.months, i));

  input.history?.forEach((period, i) => {
    if (!isRealDate(period.startDate) || !isRealDate(period.endDate))
      fail('history', 'invalid_date', i);
    else if (compareDates(period.endDate, period.startDate) < 0) fail('history', 'before_start', i);
  });

  if (input.offer !== null) {
    amount('offer.grossAnnual', input.offer.grossAnnual);
    weekly('offer.weeklyHours', input.offer.weeklyHours);
  }
  return errors;
}
