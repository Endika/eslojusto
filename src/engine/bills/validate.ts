import { compareDates, daysInMonth, ordinal, type CivilDate } from '../date';
import { MAX_POWER_KW } from './scope';
import type { ElectricityBillInput, TelecomInput } from './types';

export type ElectricityField =
  | 'issuedOn'
  | 'dueOn'
  | 'readingFrom'
  | 'readingTo'
  | 'billedDays'
  | 'postcode'
  | 'contractedPower'
  | 'maxPowerUsed'
  | 'power'
  | 'energy'
  | 'discounts'
  | 'tollsAndCharges'
  | 'socialBonusFunding'
  | 'socialBonus'
  | 'excessPower'
  | 'electricityTax'
  | 'meter'
  | 'services'
  | 'exitPenalty'
  | 'regularizations'
  | 'vat'
  | 'total';

export type TelecomField =
  | 'commitment.startedOn'
  | 'commitment.months'
  | 'commitment.agreedPenalty'
  | 'exitRequestedOn'
  | 'penaltyCharged'
  | 'handset.value'
  | 'changeNotice.sentOn'
  | 'lines';

export type ValidationCode =
  | 'invalid_date'
  | 'in_future'
  | 'not_after_start'
  | 'days_range'
  | 'kwh_range'
  | 'price_range'
  | 'power_range'
  | 'amount_range'
  | 'count_range'
  | 'postcode';

export interface ValidationError<Field extends string> {
  readonly field: Field;
  readonly code: ValidationCode;
}

// Bounds on what a person can type, not legal limits: a bill covers up to two months, a home uses
// up to 20.000 kWh in one, and no energy price reaches 5 € per kWh.
const MAX_DAYS = 62;
const MAX_KWH = 20_000;
const MAX_ENERGY_PRICE = 5;
const MAX_POWER_PRICE: Readonly<Record<'per_kw_day' | 'per_kw_year', number>> = {
  per_kw_day: 5,
  per_kw_year: 1_000,
};
const MIN_POWER_KW = 0.1;
// A maximeter may read above the contracted power; no household reaches this.
const MAX_USED_KW = 100;
const MAX_AMOUNT = 100_000;
const MAX_MEMBERS = 20;
const MAX_COMMITMENT_MONTHS = 120;

const isRealDate = ({ y, m, d }: CivilDate): boolean =>
  Number.isInteger(y) &&
  Number.isInteger(m) &&
  Number.isInteger(d) &&
  m >= 1 &&
  m <= 12 &&
  d >= 1 &&
  d <= daysInMonth(y, m);

const isAmount = (v: number): boolean => Number.isFinite(v) && v >= 0 && v <= MAX_AMOUNT;
const isSignedAmount = (v: number): boolean => Number.isFinite(v) && Math.abs(v) <= MAX_AMOUNT;
const isDays = (v: number): boolean => Number.isInteger(v) && v >= 1 && v <= MAX_DAYS;
const isKwh = (v: number): boolean => Number.isFinite(v) && v >= 0 && v <= MAX_KWH;
const isPower = (v: number): boolean =>
  Number.isFinite(v) && v >= MIN_POWER_KW && v <= MAX_POWER_KW;
// The scope gate turns away power over 15 kW first; any power is at least a positive number here.
const isAnyPower = (v: number): boolean => Number.isFinite(v) && v > 0;
const inRange = (v: number, max: number): boolean => Number.isFinite(v) && v >= 0 && v <= max;

function collector<Field extends string>(today: CivilDate) {
  const errors: ValidationError<Field>[] = [];
  const fail = (field: Field, code: ValidationCode) => errors.push({ field, code });
  const date = (field: Field, value: CivilDate): boolean => {
    if (isRealDate(value)) return true;
    fail(field, 'invalid_date');
    return false;
  };
  // A day that has already happened.
  const past = (field: Field, value: CivilDate): boolean => {
    if (!date(field, value)) return false;
    if (compareDates(value, today) <= 0) return true;
    fail(field, 'in_future');
    return false;
  };
  const check = (field: Field, ok: boolean, code: ValidationCode) => {
    if (!ok) fail(field, code);
  };
  return { errors, fail, date, past, check };
}

// Checked on a bill that passed the scope gate: the gate turns away power over 15 kW with its own
// explanation before these bounds are read.
export function validateElectricity(
  input: ElectricityBillInput,
  today: CivilDate,
): readonly ValidationError<ElectricityField>[] {
  const { errors, past, date, check } = collector<ElectricityField>(today);

  past('issuedOn', input.issuedOn);
  date('dueOn', input.dueOn);
  const from = date('readingFrom', input.readingFrom) ? input.readingFrom : null;
  const to = past('readingTo', input.readingTo) ? input.readingTo : null;
  if (from !== null && to !== null) {
    const days = ordinal(to) - ordinal(from);
    if (days <= 0) check('readingTo', false, 'not_after_start');
    else check('readingTo', days <= MAX_DAYS, 'days_range');
  }
  if (input.billedDays !== null) check('billedDays', isDays(input.billedDays), 'days_range');
  check('postcode', /^(0[1-9]|[1-4]\d|5[0-2])\d{3}$/.test(input.postcode), 'postcode');

  const { p1, p2 } = input.contractedPower;
  check('contractedPower', isPower(p1) && isPower(p2), 'power_range');
  const used = [input.maxPowerUsed.p1, input.maxPowerUsed.p2].filter((v) => v !== null);
  check(
    'maxPowerUsed',
    used.every((v) => inRange(v, MAX_USED_KW)),
    'power_range',
  );

  for (const line of input.power) {
    check('power', isAnyPower(line.kw), 'power_range');
    check('power', inRange(line.price, MAX_POWER_PRICE[line.unit]), 'price_range');
    if (line.days !== null) check('power', isDays(line.days), 'days_range');
    check('power', isAmount(line.amount), 'amount_range');
  }
  for (const line of input.energy) {
    check('energy', isKwh(line.kwh), 'kwh_range');
    check('energy', inRange(line.price, MAX_ENERGY_PRICE), 'price_range');
    check('energy', isAmount(line.amount), 'amount_range');
  }
  check('discounts', input.discounts.every(isAmount), 'amount_range');
  const tc = input.tollsAndCharges;
  if (tc !== null)
    check(
      'tollsAndCharges',
      [tc.power, tc.energy].every((v) => v === null || isAmount(v)),
      'amount_range',
    );
  if (input.socialBonusFunding !== null)
    check('socialBonusFunding', isAmount(input.socialBonusFunding), 'amount_range');
  const bonus = input.socialBonus;
  if (bonus !== null) {
    check('socialBonus', isAmount(bonus.amount), 'amount_range');
    if (bonus.members !== null)
      check(
        'socialBonus',
        Number.isInteger(bonus.members) && bonus.members >= 1 && bonus.members <= MAX_MEMBERS,
        'count_range',
      );
    for (const kwh of [bonus.discountedKwh, bonus.kwhSoFar])
      if (kwh !== null) check('socialBonus', inRange(kwh, MAX_KWH * 12), 'kwh_range');
  }
  if (input.excessPower !== null)
    check('excessPower', isAmount(input.excessPower.amount), 'amount_range');
  const tax = input.electricityTax;
  if (tax !== null) {
    check('electricityTax', isAmount(tax.amount), 'amount_range');
    if (tax.base !== null) check('electricityTax', isAmount(tax.base), 'amount_range');
    if (tax.percent !== null) check('electricityTax', inRange(tax.percent, 100), 'price_range');
  }
  const meter = input.meter;
  if (meter !== null) {
    check('meter', isAmount(meter.amount), 'amount_range');
    if (meter.days !== null) check('meter', isDays(meter.days), 'days_range');
  }
  check(
    'services',
    input.services.every((s) => isAmount(s.amount)),
    'amount_range',
  );
  if (input.exitPenalty !== null)
    check('exitPenalty', isAmount(input.exitPenalty.amount), 'amount_range');
  check('regularizations', input.regularizations.every(isSignedAmount), 'amount_range');
  const vat = input.vat;
  if (vat !== null) {
    check('vat', isAmount(vat.amount), 'amount_range');
    if (vat.base !== null) check('vat', isAmount(vat.base), 'amount_range');
    if (vat.percent !== null) check('vat', inRange(vat.percent, 100), 'price_range');
  }
  check('total', isSignedAmount(input.total), 'amount_range');
  return errors;
}

export function validateTelecom(
  input: TelecomInput,
  today: CivilDate,
): readonly ValidationError<TelecomField>[] {
  const { errors, past, date, check } = collector<TelecomField>(today);
  const exit = past('exitRequestedOn', input.exitRequestedOn) ? input.exitRequestedOn : null;
  const { commitment } = input;
  if (commitment !== null) {
    if (past('commitment.startedOn', commitment.startedOn) && exit !== null)
      check(
        'commitment.startedOn',
        compareDates(commitment.startedOn, exit) < 0,
        'not_after_start',
      );
    check(
      'commitment.months',
      Number.isInteger(commitment.months) &&
        commitment.months >= 1 &&
        commitment.months <= MAX_COMMITMENT_MONTHS,
      'count_range',
    );
    if (commitment.agreedPenalty !== null)
      check('commitment.agreedPenalty', isAmount(commitment.agreedPenalty), 'amount_range');
  }
  if (input.penaltyCharged !== null)
    check('penaltyCharged', isAmount(input.penaltyCharged), 'amount_range');
  if (input.handset !== null) check('handset.value', isAmount(input.handset.value), 'amount_range');
  const sent = input.changeNotice?.sentOn ?? null;
  if (sent !== null) past('changeNotice.sentOn', sent);
  for (const line of input.lines) {
    if (!date('lines', line.from) || !date('lines', line.to)) continue;
    check('lines', compareDates(line.from, line.to) <= 0, 'not_after_start');
    check('lines', isSignedAmount(line.amount), 'amount_range');
  }
  return errors;
}
