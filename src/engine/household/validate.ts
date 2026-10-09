import { addMonthsClamped, compareDates, daysInMonth, type CivilDate } from '../date';
import type { HouseholdInput } from './types';

export type HouseholdField =
  | 'startDate'
  | 'payYear'
  | 'weeklyHours'
  | 'monthlyCash'
  | 'inKindMonthly'
  | 'extraPays.count'
  | 'extraPays.amount'
  | 'hourlyRate'
  | 'shortestRestHours'
  | 'weeklyRestHours'
  | 'holidays.days'
  | 'holidays.longestStretch'
  | 'holidays.taken'
  | 'termination.noticeGivenOn'
  | 'termination.effectiveOn'
  | 'termination.noticeTime'
  | 'termination.severanceOffered'
  | 'termination.substitutePaid';

export type ValidationCode =
  | 'invalid_date'
  | 'too_far_ahead'
  | 'before_start'
  | 'after_end'
  | 'amount_range'
  | 'hours_range'
  | 'count_range'
  | 'year_range'
  | 'invalid_time'
  | 'regime_mismatch';

export interface ValidationError {
  readonly field: HouseholdField;
  readonly code: ValidationCode;
}

// Bounds on what a person can type, not legal limits.
const MAX_AMOUNT = 1_000_000;
const MAX_WEEKLY_HOURS = 80;
const HOURS_IN_WEEK = 168;
const MAX_DAYS_IN_YEAR = 366;
const MAX_EXTRA_PAYS = 4;
const MAX_HOURLY = 1000;
const FIRST_YEAR = 2000;
// A review may look at a year ahead of today.
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
const isCount = (v: number, max: number): boolean => Number.isInteger(v) && v >= 0 && v <= max;

// A time of day, as minutes since midnight; null when it is not a real 'HH:MM'.
export function minutesOf(s: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(s);
  if (match === null) return null;
  const [h, m] = [Number(match[1]), Number(match[2])];
  return h <= 23 && m <= 59 ? h * 60 + m : null;
}

export function validate(input: HouseholdInput, today: CivilDate): readonly ValidationError[] {
  const errors: ValidationError[] = [];
  const fail = (field: HouseholdField, code: ValidationCode) => errors.push({ field, code });
  const amount = (field: HouseholdField, v: number | null) => {
    if (v !== null && !positiveUpTo(v, MAX_AMOUNT)) fail(field, 'amount_range');
  };
  const amountOrZero = (field: HouseholdField, v: number | null) => {
    if (v !== null && !inRange(v, 0, MAX_AMOUNT)) fail(field, 'amount_range');
  };
  const hours = (field: HouseholdField, v: number | null, max: number) => {
    if (v !== null && !positiveUpTo(v, max)) fail(field, 'hours_range');
  };
  const ahead = addMonthsClamped(today, MONTHS_AHEAD);

  const start = input.startDate;
  if (!isRealDate(start)) fail('startDate', 'invalid_date');
  else if (compareDates(start, ahead) > 0) fail('startDate', 'too_far_ahead');
  if (!isCount(input.payYear, today.y + 1) || input.payYear < FIRST_YEAR)
    fail('payYear', 'year_range');

  hours('weeklyHours', input.weeklyHours, MAX_WEEKLY_HOURS);
  amount('monthlyCash', input.monthlyCash);
  amountOrZero('inKindMonthly', input.inKindMonthly);
  if (input.hourlyRate !== null && !positiveUpTo(input.hourlyRate, MAX_HOURLY))
    fail('hourlyRate', 'amount_range');
  if (input.regime === 'hourly_external' && input.liveIn) fail('hourlyRate', 'regime_mismatch');
  if (input.extraPays !== null) {
    if (!isCount(input.extraPays.count, MAX_EXTRA_PAYS)) fail('extraPays.count', 'count_range');
    amount('extraPays.amount', input.extraPays.amount);
  }
  hours('shortestRestHours', input.shortestRestHours, 24);
  hours('weeklyRestHours', input.weeklyRestHours, HOURS_IN_WEEK);
  if (input.holidays !== null) {
    const { days, longestStretch, taken } = input.holidays;
    if (!isCount(days, MAX_DAYS_IN_YEAR)) fail('holidays.days', 'count_range');
    if (longestStretch !== null && !isCount(longestStretch, MAX_DAYS_IN_YEAR))
      fail('holidays.longestStretch', 'count_range');
    if (taken !== null && !isCount(taken, MAX_DAYS_IN_YEAR)) fail('holidays.taken', 'count_range');
  }

  const t = input.termination;
  if (t !== null) {
    if (!isRealDate(t.effectiveOn)) fail('termination.effectiveOn', 'invalid_date');
    else if (isRealDate(start) && compareDates(t.effectiveOn, start) < 0)
      fail('termination.effectiveOn', 'before_start');
    else if (compareDates(t.effectiveOn, ahead) > 0)
      fail('termination.effectiveOn', 'too_far_ahead');
    if (t.noticeGivenOn !== null) {
      if (!isRealDate(t.noticeGivenOn)) fail('termination.noticeGivenOn', 'invalid_date');
      else if (isRealDate(start) && compareDates(t.noticeGivenOn, start) < 0)
        fail('termination.noticeGivenOn', 'before_start');
      else if (isRealDate(t.effectiveOn) && compareDates(t.noticeGivenOn, t.effectiveOn) > 0)
        fail('termination.noticeGivenOn', 'after_end');
    }
    if (t.noticeTime !== null && minutesOf(t.noticeTime) === null)
      fail('termination.noticeTime', 'invalid_time');
    amountOrZero('termination.severanceOffered', t.severanceOffered);
    amountOrZero('termination.substitutePaid', t.substitutePaid);
  }
  return errors;
}
