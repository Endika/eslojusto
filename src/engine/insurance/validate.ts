import { addMonthsClamped, compareDates, daysInMonth, type CivilDate } from '../date';
import type { InsuranceInput } from './types';

export type InsuranceField =
  | 'expiresOn'
  | 'notice.receivedOn'
  | 'notice.previousPremium'
  | 'notice.newPremium'
  | 'concludedOn'
  | 'policyReceivedOn';

export type ValidationCode =
  | 'invalid_date'
  | 'too_far_ahead'
  | 'in_future'
  | 'after_expiry'
  | 'before_concluded'
  | 'amount_range';

export interface ValidationError {
  readonly field: InsuranceField;
  readonly code: ValidationCode;
}

// Bounds on what a person can type, not legal limits.
const MAX_PREMIUM = 1_000_000;
// A policy period runs a year at most, so its end is never further ahead than this.
const MONTHS_AHEAD = 24;

const isRealDate = ({ y, m, d }: CivilDate): boolean =>
  Number.isInteger(y) &&
  Number.isInteger(m) &&
  Number.isInteger(d) &&
  m >= 1 &&
  m <= 12 &&
  d >= 1 &&
  d <= daysInMonth(y, m);

const isPremium = (v: number): boolean => Number.isFinite(v) && v > 0 && v <= MAX_PREMIUM;

export function validate(input: InsuranceInput, today: CivilDate): readonly ValidationError[] {
  const errors: ValidationError[] = [];
  const fail = (field: InsuranceField, code: ValidationCode) => errors.push({ field, code });
  // A day that has already happened.
  const past = (field: InsuranceField, date: CivilDate): boolean => {
    if (!isRealDate(date)) fail(field, 'invalid_date');
    else if (compareDates(date, today) > 0) fail(field, 'in_future');
    else return true;
    return false;
  };

  const expiry = input.expiresOn;
  const expiryValid = isRealDate(expiry);
  if (!expiryValid) fail('expiresOn', 'invalid_date');
  else if (compareDates(expiry, addMonthsClamped(today, MONTHS_AHEAD)) > 0)
    fail('expiresOn', 'too_far_ahead');

  const { notice } = input;
  if (notice !== null) {
    if (past('notice.receivedOn', notice.receivedOn) && expiryValid)
      if (compareDates(notice.receivedOn, expiry) > 0) fail('notice.receivedOn', 'after_expiry');
    if (notice.previousPremium !== null && !isPremium(notice.previousPremium))
      fail('notice.previousPremium', 'amount_range');
    if (notice.newPremium !== null && !isPremium(notice.newPremium))
      fail('notice.newPremium', 'amount_range');
  }

  const concluded = input.concludedOn;
  const concludedValid = concluded !== null && past('concludedOn', concluded);
  if (concludedValid && expiryValid && compareDates(concluded, expiry) > 0)
    fail('concludedOn', 'after_expiry');
  const received = input.policyReceivedOn;
  if (received !== null && past('policyReceivedOn', received) && concludedValid)
    if (compareDates(received, concluded) < 0) fail('policyReceivedOn', 'before_concluded');

  return errors;
}
