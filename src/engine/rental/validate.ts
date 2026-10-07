import { addMonthsClamped, compareDates, daysInMonth, toIso, type CivilDate } from '../date';
import { anniversaryIn, isAnniversary } from './anniversary';
import { REGION_CODES, type RentalInput } from './types';

export type RentalInputErrorCode =
  | 'invalid_date'
  | 'signed_in_future'
  | 'start_too_early'
  | 'amount_out_of_range'
  | 'months_out_of_range'
  | 'percent_out_of_range'
  | 'percent_missing'
  | 'unknown_region'
  | 'not_an_anniversary'
  | 'effective_outside_year'
  | 'update_in_future'
  | 'update_repeated'
  | 'charged_before_start'
  | 'notice_date_missing'
  | 'notice_in_future'
  | 'year_out_of_range'
  | 'keys_before_start'
  | 'keys_in_future'
  | 'return_before_keys'
  | 'return_in_future';

// The UI words each `code` through the dictionary; `index` points into a list field.
export interface RentalInputError {
  readonly field: keyof RentalInput;
  readonly index?: number;
  readonly code: RentalInputErrorCode;
}

const MAX_AMOUNT = 1_000_000;
const MAX_MONTHS = 600;

const isValidDate = (f: CivilDate): boolean =>
  Number.isInteger(f.y) &&
  Number.isInteger(f.m) &&
  Number.isInteger(f.d) &&
  f.y >= 1900 &&
  f.y <= 2200 &&
  f.m >= 1 &&
  f.m <= 12 &&
  f.d >= 1 &&
  f.d <= daysInMonth(f.y, f.m);

const isAmount = (n: number): boolean => Number.isFinite(n) && n > 0 && n <= MAX_AMOUNT;
const isIntInRange = (n: number, min: number, max: number): boolean =>
  Number.isInteger(n) && n >= min && n <= max;
const WRITTEN_OR_ELECTRONIC = new Set([
  'letter',
  'burofax',
  'receipt_note',
  'annex',
  'email',
  'messaging',
]);

export function validateRental(e: RentalInput, today: CivilDate): readonly RentalInputError[] {
  const errors: RentalInputError[] = [];
  const err = (field: keyof RentalInput, code: RentalInputErrorCode, index?: number) =>
    errors.push(index === undefined ? { field, code } : { field, index, code });
  const amount = (field: keyof RentalInput, n: number, index?: number) => {
    if (!isAmount(n)) err(field, 'amount_out_of_range', index);
  };

  const signedOk = isValidDate(e.signedOn);
  const startOk = isValidDate(e.startDate);
  if (!signedOk) err('signedOn', 'invalid_date');
  else if (compareDates(e.signedOn, today) > 0) err('signedOn', 'signed_in_future');
  if (!startOk) err('startDate', 'invalid_date');
  else if (signedOk && compareDates(e.startDate, addMonthsClamped(e.signedOn, -12)) < 0)
    err('startDate', 'start_too_early');

  if (!isIntInRange(e.agreedMonths, 1, MAX_MONTHS)) err('agreedMonths', 'months_out_of_range');
  amount('initialRent', e.initialRent);
  if (e.updateClause === 'fixed_percent' && e.fixedPercent === undefined)
    err('fixedPercent', 'percent_missing');
  if (
    e.fixedPercent !== undefined &&
    !(Number.isFinite(e.fixedPercent) && e.fixedPercent >= 0 && e.fixedPercent <= 100)
  )
    err('fixedPercent', 'percent_out_of_range');
  if (!(REGION_CODES as readonly string[]).includes(e.region)) err('region', 'unknown_region');

  e.fees.forEach((f, i) => amount('fees', f.amount, i));
  if (e.deposit !== null) amount('deposit', e.deposit);
  e.guarantees.forEach((g, i) => {
    if (g.amount !== null) amount('guarantees', g.amount, i);
  });
  if (e.advanceMonths !== null && !isIntInRange(e.advanceMonths, 0, MAX_MONTHS))
    err('advanceMonths', 'months_out_of_range');

  const seen = new Set<string>();
  e.updates.forEach((u, i) => {
    amount('updates', u.previousRent, i);
    amount('updates', u.newRent, i);
    if (!isValidDate(u.anniversary) || !isValidDate(u.effectiveOn) || !isValidDate(u.chargedFrom)) {
      err('updates', 'invalid_date', i);
      return;
    }
    const key = `${toIso(u.anniversary)}/${toIso(u.effectiveOn)}`;
    if (seen.has(key)) err('updates', 'update_repeated', i);
    seen.add(key);
    if (startOk) {
      if (!isAnniversary(e.startDate, u.anniversary)) err('updates', 'not_an_anniversary', i);
      else {
        // A rise is its anniversary's update even when applied early or late, so it must fall
        // after the anniversary before and before the next one.
        const year = u.anniversary.y;
        const opens = year - 1 > e.startDate.y ? anniversaryIn(e.startDate, year - 1) : e.startDate;
        if (
          compareDates(u.effectiveOn, opens) <= 0 ||
          compareDates(u.effectiveOn, anniversaryIn(e.startDate, year + 1)) >= 0
        )
          err('updates', 'effective_outside_year', i);
      }
    }
    if (compareDates(u.effectiveOn, today) > 0) err('updates', 'update_in_future', i);
    if (startOk && (u.chargedFrom.y - e.startDate.y) * 12 + u.chargedFrom.m - e.startDate.m < 0)
      err('updates', 'charged_before_start', i);
    if (WRITTEN_OR_ELECTRONIC.has(u.notice)) {
      if (u.noticeOn === null) err('updates', 'notice_date_missing', i);
      else if (!isValidDate(u.noticeOn)) err('updates', 'invalid_date', i);
      else if (compareDates(u.noticeOn, today) > 0) err('updates', 'notice_in_future', i);
    }
  });

  e.charges.forEach((c, i) => {
    if (c.annualAgreed !== null) amount('charges', c.annualAgreed, i);
    for (const { year, amount: charged } of c.charged) {
      if (!isAmount(charged)) err('charges', 'amount_out_of_range', i);
      if (signedOk && !isIntInRange(year, e.signedOn.y - 1, today.y))
        err('charges', 'year_out_of_range', i);
    }
  });

  if (e.moveOut !== null) {
    const { keysReturnedOn, returns, deductions } = e.moveOut;
    if (!isValidDate(keysReturnedOn)) err('moveOut', 'invalid_date');
    else if (startOk && compareDates(keysReturnedOn, e.startDate) < 0)
      err('moveOut', 'keys_before_start');
    else if (compareDates(keysReturnedOn, today) > 0) err('moveOut', 'keys_in_future');
    const keysOk = isValidDate(keysReturnedOn);
    returns.forEach((r, i) => {
      if (!isValidDate(r.on)) err('moveOut', 'invalid_date', i);
      else if (compareDates(r.on, today) > 0) err('moveOut', 'return_in_future', i);
      else if (keysOk && compareDates(r.on, keysReturnedOn) < 0)
        err('moveOut', 'return_before_keys', i);
      amount('moveOut', r.amount, i);
    });
    deductions.forEach((d, i) => amount('moveOut', d.amount, i));
  }
  return errors;
}
