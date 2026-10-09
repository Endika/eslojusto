import { addDays, compareDates, daysInMonth, type CivilDate } from '../date';
import type { CreditInput } from './types';

export type CreditField =
  | 'agreedOn'
  | 'drawnOn'
  | 'principal'
  | 'netDisbursed'
  | 'nominalRate'
  | 'declaredApr'
  | 'declaredTotalPayable'
  | 'instalments.count'
  | 'instalments.amount'
  | 'instalments.firstDueOn'
  | 'instalments.rows'
  | 'balloon'
  | 'charges'
  | 'insurance.premium'
  | 'card.limit'
  | 'card.nominalRate'
  | 'card.annualFee'
  | 'card.minimumPayment'
  | 'card.balance'
  | 'earlyRepayment.on'
  | 'earlyRepayment.principalRepaid'
  | 'earlyRepayment.interestSettled'
  | 'earlyRepayment.compensationCharged'
  | 'earlyRepayment.agreedEndOn'
  | 'earlyRepayment.remainingInterest'
  | 'infoReceivedOn';

export type ValidationCode =
  | 'invalid_date'
  | 'in_future'
  | 'before_agreed'
  | 'outside_term'
  | 'amount_range'
  | 'rate_range'
  | 'count_range'
  | 'above_principal';

export interface ValidationError {
  readonly field: CreditField;
  readonly code: ValidationCode;
}

// Bounds on what a person can type, not legal limits.
const MAX_AMOUNT = 1_000_000;
const MAX_RATE = 100;
const MAX_INSTALMENTS = 600;
// The money may arrive a little before the contract is dated, never long before.
const DRAWN_BEFORE_DAYS = 30;

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
const isRate = (v: number): boolean => Number.isFinite(v) && v >= 0 && v <= MAX_RATE;
const isCount = (v: number): boolean => Number.isInteger(v) && v >= 1 && v <= MAX_INSTALMENTS;

export function validate(input: CreditInput, today: CivilDate): readonly ValidationError[] {
  const errors: ValidationError[] = [];
  const fail = (field: CreditField, code: ValidationCode) => errors.push({ field, code });
  const date = (field: CreditField, value: CivilDate): boolean => {
    if (isRealDate(value)) return true;
    fail(field, 'invalid_date');
    return false;
  };
  // A day that has already happened.
  const past = (field: CreditField, value: CivilDate): boolean => {
    if (!date(field, value)) return false;
    if (compareDates(value, today) <= 0) return true;
    fail(field, 'in_future');
    return false;
  };
  const amount = (field: CreditField, value: number, check = isAmount) => {
    if (!check(value)) fail(field, 'amount_range');
  };
  const rate = (field: CreditField, value: number) => {
    if (!isRate(value)) fail(field, 'rate_range');
  };

  const agreed = past('agreedOn', input.agreedOn) ? input.agreedOn : null;
  const drawn = past('drawnOn', input.drawnOn) ? input.drawnOn : null;
  if (agreed !== null && drawn !== null)
    if (compareDates(drawn, addDays(agreed, -DRAWN_BEFORE_DAYS)) < 0)
      fail('drawnOn', 'before_agreed');

  amount('principal', input.principal);
  if (input.netDisbursed !== null) {
    amount('netDisbursed', input.netDisbursed);
    if (input.netDisbursed > input.principal) fail('netDisbursed', 'above_principal');
  }
  rate('nominalRate', input.nominalRate);
  if (input.declaredApr !== null) rate('declaredApr', input.declaredApr);
  if (input.declaredTotalPayable !== null)
    amount('declaredTotalPayable', input.declaredTotalPayable);

  const { instalments } = input;
  if (instalments?.kind === 'regular') {
    if (!isCount(instalments.count)) fail('instalments.count', 'count_range');
    amount('instalments.amount', instalments.amount);
    date('instalments.firstDueOn', instalments.firstDueOn);
  } else if (instalments?.kind === 'schedule') {
    const { rows } = instalments;
    if (!isCount(rows.length)) fail('instalments.rows', 'count_range');
    else if (rows.some((r) => !isRealDate(r.dueOn))) fail('instalments.rows', 'invalid_date');
    else if (rows.some((r) => !isAmount(r.amount))) fail('instalments.rows', 'amount_range');
  }
  if (input.balloon !== null) amount('balloon', input.balloon);

  if (input.charges.some((c) => !isRealDate(c.paidOn))) fail('charges', 'invalid_date');
  else if (input.charges.some((c) => !isAmount(c.amount))) fail('charges', 'amount_range');
  if (input.insurance !== null) amount('insurance.premium', input.insurance.premium);

  const { card } = input;
  if (card !== null) {
    amount('card.limit', card.limit);
    rate('card.nominalRate', card.nominalRate);
    amount('card.annualFee', card.annualFee, isAmountOrZero);
    amount('card.minimumPayment', card.minimumPayment);
    amount('card.balance', card.balance, isAmountOrZero);
  }

  const repayment = input.earlyRepayment;
  if (repayment !== null) {
    const end = date('earlyRepayment.agreedEndOn', repayment.agreedEndOn)
      ? repayment.agreedEndOn
      : null;
    if (past('earlyRepayment.on', repayment.on)) {
      const tooEarly = drawn !== null && compareDates(repayment.on, drawn) < 0;
      const tooLate = end !== null && compareDates(repayment.on, end) > 0;
      if (tooEarly || tooLate) fail('earlyRepayment.on', 'outside_term');
    }
    if (drawn !== null && end !== null && compareDates(end, drawn) <= 0)
      fail('earlyRepayment.agreedEndOn', 'outside_term');
    amount('earlyRepayment.principalRepaid', repayment.principalRepaid);
    if (repayment.principalRepaid > input.principal)
      fail('earlyRepayment.principalRepaid', 'above_principal');
    amount('earlyRepayment.compensationCharged', repayment.compensationCharged, isAmountOrZero);
    if (repayment.interestSettled !== null)
      amount('earlyRepayment.interestSettled', repayment.interestSettled, isAmountOrZero);
    if (repayment.remainingInterest !== null)
      amount('earlyRepayment.remainingInterest', repayment.remainingInterest, isAmountOrZero);
  }

  const received = input.infoReceivedOn;
  if (received !== null && past('infoReceivedOn', received) && agreed !== null)
    if (compareDates(received, agreed) < 0) fail('infoReceivedOn', 'before_agreed');

  return errors;
}
