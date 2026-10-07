import { compareDates, daysInMonth, addDays, type CivilDate } from './date';
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
  | 'notice_out_of_range'
  | 'missing_fixed_term_type';

// `code` is what the UI translates; `message` is the same text in Spanish, for the engine's callers.
export type InputError = {
  readonly field: keyof FinalPayInput;
  readonly code: InputErrorCode;
  readonly message: string;
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
  const err = (field: keyof FinalPayInput, code: InputErrorCode, message: string) =>
    errors.push({ field, code, message });

  if (!isValidDate(e.startDate))
    err('startDate', 'invalid_start_date', 'La fecha de alta no es válida');
  if (!isValidDate(e.endDate)) err('endDate', 'invalid_end_date', 'La fecha de baja no es válida');
  else if (isValidDate(e.startDate) && compareDates(e.endDate, e.startDate) < 0)
    err('endDate', 'end_before_start', 'La fecha de baja es anterior a la de alta');
  else if (compareDates(e.endDate, addDays(today, MAX_DAYS_AHEAD)) > 0)
    err(
      'endDate',
      'end_too_far_ahead',
      'La fecha de baja no puede estar a más de un año en el futuro',
    );

  if (!Number.isFinite(e.monthlySalary) || e.monthlySalary <= 0 || e.monthlySalary > MAX_SALARY)
    err(
      'monthlySalary',
      'salary_out_of_range',
      'El salario mensual debe ser mayor que 0 y no pasar de 1.000.000 €',
    );

  if (!isIntInRange(e.extraPayCount, 0, 6))
    err(
      'extraPayCount',
      'extra_pay_count_out_of_range',
      'El número de pagas debe estar entre 0 y 6',
    );

  const extraPayRequired = !e.extraPayProrated && e.extraPayCount > 0;
  if (
    !Number.isFinite(e.extraPayAmount) ||
    e.extraPayAmount > MAX_SALARY ||
    (extraPayRequired ? e.extraPayAmount <= 0 : e.extraPayAmount < 0)
  )
    err(
      'extraPayAmount',
      'extra_pay_amount_out_of_range',
      'El importe de la paga extra debe ser mayor que 0 y no pasar de 1.000.000 €',
    );

  if (!Number.isFinite(e.annualHolidayDays) || e.annualHolidayDays < 0 || e.annualHolidayDays > 60)
    err(
      'annualHolidayDays',
      'annual_holidays_out_of_range',
      'Los días de vacaciones al año deben estar entre 0 y 60',
    );
  const taken = e.holidayDaysTaken;
  if (taken !== null && (!Number.isFinite(taken) || taken < 0 || taken > 60))
    err(
      'holidayDaysTaken',
      'holidays_taken_out_of_range',
      'Los días de vacaciones disfrutados deben estar entre 0 y 60',
    );

  const notice = [
    ['noticeDaysReceived', e.noticeDaysReceived],
    ['agreementNoticeDays', e.agreementNoticeDays],
    ['noticeDaysGiven', e.noticeDaysGiven],
  ] as const;
  for (const [field, value] of notice) {
    if (value !== undefined && (!Number.isFinite(value) || value < 0 || value > 90))
      err(field, 'notice_out_of_range', 'Los días de preaviso deben estar entre 0 y 90');
  }

  if (e.cause === 'fixed_term_end' && e.fixedTermType === undefined)
    err('fixedTermType', 'missing_fixed_term_type', 'Indica el tipo de contrato temporal');

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
  readonly message: string;
};

// Separate from `validate` so the final pay review never depends on these optional rows.
export function validateOtherContracts(
  e: FinalPayInput,
  contracts: readonly ContributionPeriod[],
): readonly OtherContractError[] {
  const errors: OtherContractError[] = [];
  const endValid = isValidDate(e.endDate);
  contracts.forEach((o, row) => {
    const err = (key: keyof ContributionPeriod, code: OtherContractErrorCode, message: string) =>
      errors.push({ field: `otherContracts.${row}.${key}`, row, code, message });
    const startValid = isValidDate(o.startDate);
    if (!startValid)
      err(
        'startDate',
        'other_contract_invalid_start_date',
        'La fecha de alta de este contrato no es válida',
      );
    if (!isValidDate(o.endDate))
      err(
        'endDate',
        'other_contract_invalid_end_date',
        'La fecha de baja de este contrato no es válida',
      );
    else if (startValid && compareDates(o.endDate, o.startDate) < 0)
      err(
        'endDate',
        'other_contract_end_before_start',
        'La fecha de baja de este contrato es anterior a la de alta',
      );
    else if (endValid && compareDates(o.endDate, e.endDate) > 0)
      err(
        'endDate',
        'other_contract_ends_after_this_one',
        'La fecha de baja de este contrato es posterior a la del contrato que estás revisando',
      );
  });
  return errors;
}
