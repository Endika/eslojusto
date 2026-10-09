import { parseAmount } from '../calculator/number';
import { parseDate, type CivilDate } from '../engine/date';
import { scope } from '../engine/insurance/scope';
import type {
  CarCover,
  InsuranceInput,
  InsuranceLine,
  RenewalNotice,
  Scope,
} from '../engine/insurance/types';
import {
  validate,
  type InsuranceField,
  type ValidationCode,
  type ValidationError,
} from '../engine/insurance/validate';

// The sheets in order. Step ids are also the URL fragments, so they keep their Spanish names.
export const SHEETS = [
  'poliza',
  'cobertura',
  'vencimiento',
  'contratacion',
  'condiciones',
  'renovacion',
  'primas',
  'cambios',
] as const;
export type Sheet = (typeof SHEETS)[number];

export const LINES: readonly InsuranceLine[] = [
  'home',
  'car',
  'life',
  'health',
  'funeral',
  'other',
];
export const CAR_COVERS: readonly CarCover[] = ['compulsory_only', 'with_voluntary'];

export const INSURANCE_FIELDS = [
  'line',
  'carCover',
  'mortgageRequired',
  'renews',
  'expiresOn',
  'distance',
  'concludedOn',
  'policyReceived',
  'policyReceivedOn',
  'hasNotice',
  'noticeReceivedOn',
  'previousPremium',
  'newPremium',
  'changes',
] as const;
export type InsuranceFormField = (typeof INSURANCE_FIELDS)[number];

export const SHEET_FIELDS: Readonly<Record<Sheet, readonly InsuranceFormField[]>> = {
  poliza: ['line'],
  cobertura: ['carCover', 'mortgageRequired'],
  vencimiento: ['renews', 'expiresOn'],
  contratacion: ['distance', 'concludedOn'],
  condiciones: ['policyReceived', 'policyReceivedOn'],
  renovacion: ['hasNotice', 'noticeReceivedOn'],
  primas: ['previousPremium', 'newPremium'],
  cambios: ['changes'],
};

export const sheetOfField = (field: InsuranceFormField): Sheet =>
  SHEETS.find((s) => SHEET_FIELDS[s].includes(field)) ?? 'poliza';

export type FieldErrorCode = ValidationCode | 'missing_value' | 'missing_choice' | 'invalid_amount';

// The UI words `code` through `client.insurance.error.<code>`.
export interface FieldError {
  readonly field: InsuranceFormField;
  readonly code: FieldErrorCode;
}

// Where each of the engine's fields is asked.
const FIELD_OF: Readonly<Record<InsuranceField, InsuranceFormField>> = {
  expiresOn: 'expiresOn',
  'notice.receivedOn': 'noticeReceivedOn',
  'notice.previousPremium': 'previousPremium',
  'notice.newPremium': 'newPremium',
  concludedOn: 'concludedOn',
  policyReceivedOn: 'policyReceivedOn',
};

const COVERED: readonly InsuranceLine[] = ['home', 'car'];
const NO_DATE: CivilDate = { y: 1, m: 1, d: 1 };

const pick = <T extends string>(value: string | null, options: readonly T[]): T | null =>
  value !== null && (options as readonly string[]).includes(value) ? (value as T) : null;

// «Sí», «No» and «No lo sé»; undefined while unanswered.
const triState = (value: string | null): boolean | null | undefined =>
  value === 'yes' ? true : value === 'no' ? false : value === 'unknown' ? null : undefined;

interface Reading {
  readonly errors: FieldError[];
  readonly line: InsuranceLine | null;
  readonly expiresOn: CivilDate | null;
  // Null while an answer the input needs is missing or unreadable.
  readonly input: InsuranceInput | null;
}

// FormData leaves out disabled controls, so a question that does not apply never reaches the
// engine.
function read(form: HTMLFormElement): Reading {
  const data = new FormData(form);
  const errors: FieldError[] = [];
  const text = (field: InsuranceFormField): string | null => {
    const v = data.get(field);
    return typeof v === 'string' ? v : null;
  };
  const asked = (field: InsuranceFormField) =>
    form.querySelector(`[name="${field}"]:not(:disabled)`) !== null;
  const fail = (field: InsuranceFormField, code: FieldErrorCode) => errors.push({ field, code });

  const choice = <T extends string>(field: InsuranceFormField, options: readonly T[]): T | null => {
    const v = pick(text(field), options);
    if (v === null) fail(field, 'missing_choice');
    return v;
  };
  // An answer that is not asked reads as «No lo sé», never as a choice the person did not make.
  const answer = (field: InsuranceFormField): boolean | null => {
    if (!asked(field)) return null;
    const v = triState(text(field));
    if (v === undefined) {
      fail(field, 'missing_choice');
      return null;
    }
    return v;
  };
  const date = (field: InsuranceFormField, required: boolean): CivilDate | null => {
    if (!asked(field)) return null;
    const t = text(field)?.trim() ?? '';
    if (t === '') {
      if (required) fail(field, 'missing_value');
      return null;
    }
    try {
      return parseDate(t);
    } catch {
      fail(field, 'invalid_date');
      return null;
    }
  };
  const premium = (field: InsuranceFormField): number | null => {
    if (!asked(field)) return null;
    const n = parseAmount(text(field) ?? '');
    if (n === null) return null;
    if (Number.isNaN(n)) {
      fail(field, 'invalid_amount');
      return null;
    }
    return n;
  };

  const line = choice('line', LINES);
  if (line === null || !COVERED.includes(line))
    return { errors, line, expiresOn: null, input: null };

  const carCover = asked('carCover') ? choice('carCover', CAR_COVERS) : null;
  const mortgageRequired = answer('mortgageRequired');
  const renews = answer('renews');
  const expiresOn = date('expiresOn', true);

  const distance = answer('distance');
  const concludedOn = date('concludedOn', distance === true);
  const policyReceived = answer('policyReceived');
  const policyReceivedOn = date('policyReceivedOn', false);

  let notice: RenewalNotice | null = null;
  const hasNotice = asked('hasNotice') ? triState(text('hasNotice')) : false;
  if (hasNotice === undefined || hasNotice === null) fail('hasNotice', 'missing_choice');
  else if (hasNotice) {
    const receivedOn = date('noticeReceivedOn', true);
    const previousPremium = premium('previousPremium');
    const newPremium = premium('newPremium');
    const changes = answer('changes');
    if (receivedOn) notice = { receivedOn, previousPremium, newPremium, changes };
  }

  const input: InsuranceInput | null =
    expiresOn === null
      ? null
      : {
          line,
          carCover: line === 'car' ? carCover : null,
          mortgageRequired: line === 'home' ? mortgageRequired : null,
          renews,
          expiresOn,
          notice,
          distance,
          concludedOn,
          policyReceived,
          policyReceivedOn: policyReceived === true ? policyReceivedOn : null,
        };
  return { errors, line, expiresOn, input };
}

// The engine's checks, each on the question that asks it.
export const onQuestions = (errors: readonly ValidationError[]): FieldError[] =>
  errors.map(({ field, code }) => ({ field: FIELD_OF[field], code }));

const engineErrors = (input: InsuranceInput, today: CivilDate): FieldError[] =>
  onQuestions(validate(input, today));

// The reach of the review once the policy sheet reads: home and motor only, from the current
// wording of art. 22 LCS. Null until it can be told.
export function formScope(form: HTMLFormElement): Scope | null {
  const r = read(form);
  if (r.line === null) return null;
  // Any other line is outside whatever its dates, so no date is read for it.
  if (!COVERED.includes(r.line)) return scope({ line: r.line, expiresOn: NO_DATE });
  return r.expiresOn === null ? null : scope({ line: r.line, expiresOn: r.expiresOn });
}

export function sheetErrors(form: HTMLFormElement, sheet: Sheet, today: CivilDate): FieldError[] {
  const r = read(form);
  const fields: readonly InsuranceFormField[] = SHEET_FIELDS[sheet];
  const own = r.errors.filter((e) => fields.includes(e.field));
  const withError = new Set(r.errors.map((e) => e.field));
  const fromEngine =
    r.input === null
      ? []
      : engineErrors(r.input, today).filter(
          (e) => fields.includes(e.field) && !withError.has(e.field),
        );
  return [...own, ...fromEngine];
}

export function readInsuranceForm(
  form: HTMLFormElement,
  today: CivilDate,
): { readonly input: InsuranceInput } | { readonly errors: readonly FieldError[] } {
  const r = read(form);
  if (r.errors.length > 0) return { errors: r.errors };
  // Only a line outside the review reads without a date, and the gate stops it before this.
  if (r.input === null) return { errors: [{ field: 'line', code: 'missing_choice' }] };
  const errors = engineErrors(r.input, today);
  return errors.length > 0 ? { errors } : { input: r.input };
}
