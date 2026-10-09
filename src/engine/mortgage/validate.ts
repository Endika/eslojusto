import { addDays, compareDates, daysInMonth, parseDate, type CivilDate } from '../date';
import { round2 } from '../money';
import type { Clause, MortgageInput } from './types';

export type MortgageField =
  | 'deedOn'
  | 'fixedUntil'
  | 'invoices.total'
  | 'invoices.paidOn'
  | 'invoices.supplied'
  | 'alreadyReturned'
  | 'deedPercents.variable'
  | 'deedPercents.fixed'
  | 'operations.on'
  | 'operations.principal'
  | 'operations.feeCharged'
  | 'clauses.floorPercent'
  | 'clauses.defaultRate'
  | 'clauses.ordinaryRate';

export type ValidationCode =
  | 'invalid_date'
  | 'in_future'
  | 'before_table'
  | 'before_deed'
  | 'amount_range'
  | 'percent_range'
  | 'not_agency'
  | 'above_total';

export interface ValidationError {
  readonly field: MortgageField;
  readonly code: ValidationCode;
  // Row of the list the field belongs to; null for a field of its own.
  readonly index: number | null;
}

// Bounds on what a person can type, not legal limits.
const MAX_AMOUNT = 1_000_000;
const MAX_PERCENT = 30;
// The legal interest table starts in 1995, and so does what this review reads.
const FIRST_DEED = parseDate('1995-01-01');
// A provision of funds paid to the notary or the agency may come a little before the deed.
const PAID_BEFORE_DEED_DAYS = 90;

const isRealDate = ({ y, m, d }: CivilDate): boolean =>
  Number.isInteger(y) &&
  Number.isInteger(m) &&
  Number.isInteger(d) &&
  m >= 1 &&
  m <= 12 &&
  d >= 1 &&
  d <= daysInMonth(y, m);

const isAmount = (v: number): boolean => Number.isFinite(v) && v > 0 && v <= MAX_AMOUNT;
// An amount that may be zero, such as a fee not charged.
const isAmountOrZero = (v: number): boolean => v === 0 || isAmount(v);
const isPercent = (v: number): boolean => Number.isFinite(v) && v >= 0 && v <= MAX_PERCENT;

const CLAUSE_RATES = ['floorPercent', 'defaultRate', 'ordinaryRate'] as const;

export function validate(input: MortgageInput, today: CivilDate): readonly ValidationError[] {
  const errors: ValidationError[] = [];
  const fail = (field: MortgageField, code: ValidationCode, index: number | null = null) =>
    errors.push({ field, code, index });
  // A real day that has already happened.
  const past = (field: MortgageField, value: CivilDate, index: number | null = null): boolean => {
    if (!isRealDate(value)) fail(field, 'invalid_date', index);
    else if (compareDates(value, today) > 0) fail(field, 'in_future', index);
    else return true;
    return false;
  };

  let deed: CivilDate | null = null;
  if (past('deedOn', input.deedOn)) {
    if (compareDates(input.deedOn, FIRST_DEED) < 0) fail('deedOn', 'before_table');
    else deed = input.deedOn;
  }
  if (input.fixedUntil !== null && !isRealDate(input.fixedUntil))
    fail('fixedUntil', 'invalid_date');

  input.invoices.forEach((invoice, i) => {
    if (invoice.total !== null && !isAmount(invoice.total))
      fail('invoices.total', 'amount_range', i);
    if (invoice.paidOn !== null && past('invoices.paidOn', invoice.paidOn, i) && deed !== null)
      if (compareDates(invoice.paidOn, addDays(deed, -PAID_BEFORE_DEED_DAYS)) < 0)
        fail('invoices.paidOn', 'before_deed', i);
    if (invoice.supplied.length === 0) return;
    if (invoice.kind !== 'agency') fail('invoices.supplied', 'not_agency', i);
    else if (!invoice.supplied.every(isAmount)) fail('invoices.supplied', 'amount_range', i);
    else if (
      invoice.total !== null &&
      round2(invoice.supplied.reduce((s, x) => s + x, 0)) > invoice.total
    )
      fail('invoices.supplied', 'above_total', i);
  });
  if (input.alreadyReturned !== null && !isAmountOrZero(input.alreadyReturned))
    fail('alreadyReturned', 'amount_range');

  const { variable, fixed } = input.deedPercents;
  if (variable !== undefined && !isPercent(variable))
    fail('deedPercents.variable', 'percent_range');
  if (fixed !== undefined && !isPercent(fixed)) fail('deedPercents.fixed', 'percent_range');

  input.operations.forEach((operation, i) => {
    if (past('operations.on', operation.on, i) && deed !== null)
      if (compareDates(operation.on, deed) < 0) fail('operations.on', 'before_deed', i);
    if (!isAmount(operation.principal)) fail('operations.principal', 'amount_range', i);
    if (!isAmountOrZero(operation.feeCharged)) fail('operations.feeCharged', 'amount_range', i);
  });

  input.clauses.forEach((clause: Clause, i) => {
    for (const key of CLAUSE_RATES) {
      const value = clause[key];
      if (value !== undefined && !isPercent(value)) fail(`clauses.${key}`, 'percent_range', i);
    }
  });

  return errors;
}
