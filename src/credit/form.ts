import { parseAmount } from '../calculator/number';
import { compareDates, parseDate, type CivilDate } from '../engine/date';
import { MIN_PRINCIPAL, scope } from '../engine/credit/scope';
import type {
  Balloon,
  Card,
  Charge,
  ChargeKind,
  ChargePayment,
  CreditInput,
  CreditProduct,
  EarlyRepayment,
  Instalments,
  LinkedInsurance,
  Scope,
} from '../engine/credit/types';
import {
  validate,
  type CreditField,
  type ValidationCode,
  type ValidationError,
} from '../engine/credit/validate';
import type { CreditFormField } from './ports';

export type { CreditFormField } from './ports';

// The sheets in order. Step ids are also the URL fragments, so they keep their Spanish names.
export const SHEETS = [
  'producto',
  'uso',
  'importe',
  'contrato',
  'interes',
  'tae',
  'cuotas',
  'cuota-final',
  'apertura',
  'otros-gastos',
  'seguro',
  'seguro-pago',
  'tarjeta',
  'comparar',
  'amortizacion',
  'compensacion',
  'fin-pactado',
  'detalles',
  'desistimiento',
] as const;
export type Sheet = (typeof SHEETS)[number];

// What the first sheet offers: the three credits the review covers and two that stop at the door.
export const PRODUCTS = ['personal_loan', 'car_loan', 'revolving', 'mortgage', 'lease'] as const;
export type ProductAnswer = (typeof PRODUCTS)[number];
export const PURPOSES = ['personal', 'business'] as const;
export const RATE_TYPES = ['fixed', 'variable'] as const;
export const CHARGE_PAYMENTS: readonly ChargePayment[] = ['deducted', 'financed', 'paid'];
export const PREMIUM_KINDS = ['single', 'periodic'] as const;
export const COMPARED_APRS = ['recalculated', 'declared'] as const;

export const SHEET_FIELDS: Readonly<Record<Sheet, readonly CreditFormField[]>> = {
  producto: ['product'],
  uso: ['purpose'],
  importe: ['principal', 'cardLimit'],
  contrato: ['agreedOn', 'drawnOn'],
  interes: ['nominalRate', 'rateType'],
  tae: ['aprStated', 'declaredApr', 'declaredTotalPayable'],
  cuotas: ['instalmentCount', 'instalmentAmount', 'firstDueOn'],
  'cuota-final': ['hasBalloon', 'balloonAmount', 'balloonDueOn'],
  apertura: ['openingFee', 'openingHow'],
  'otros-gastos': ['otherFee', 'otherHow'],
  seguro: ['hasInsurance', 'premium', 'premiumKind'],
  'seguro-pago': ['premiumFinanced', 'insuranceRequired'],
  tarjeta: ['annualFee', 'monthlyPayment', 'balance'],
  comparar: ['confirmedApr'],
  amortizacion: ['repaid', 'repaidOn', 'principalRepaid'],
  compensacion: ['compensation', 'interestSettled'],
  'fin-pactado': ['agreedEndOn', 'remainingInterest'],
  detalles: ['paidByInsurance', 'discountLost'],
  desistimiento: ['infoReceived', 'infoReceivedOn'],
};

export const sheetOfField = (field: CreditFormField): Sheet =>
  SHEETS.find((s) => SHEET_FIELDS[s].includes(field)) ?? 'producto';

export type FieldErrorCode =
  | ValidationCode
  | 'missing_value'
  | 'missing_choice'
  | 'invalid_amount'
  | 'invalid_rate'
  | 'invalid_count';

// The UI words `code` through `client.credit.error.<code>`.
export interface FieldError {
  readonly field: CreditFormField;
  readonly code: FieldErrorCode;
}

const LOANS: readonly ProductAnswer[] = ['personal_loan', 'car_loan'];
// Any day: the scope reads it only once the earlier reasons are settled.
const NO_DATE: CivilDate = { y: 1, m: 1, d: 1 };

const pick = <T extends string>(value: string | null, options: readonly T[]): T | null =>
  value !== null && (options as readonly string[]).includes(value) ? (value as T) : null;

// «Sí», «No» and «No lo sé»; undefined while unanswered.
const triState = (value: string | null): boolean | null | undefined =>
  value === 'yes' ? true : value === 'no' ? false : value === 'unknown' ? null : undefined;

const tryDate = (text: string): CivilDate | null => {
  try {
    return parseDate(text);
  } catch {
    return null;
  }
};

const textOf = (data: FormData, field: CreditFormField): string | null => {
  const v = data.get(field);
  return typeof v === 'string' ? v : null;
};

// The answers the door reads: what the credit is, what for, how much and when. Null until the
// sheets before it have answers that read.
function doorScope(data: FormData): Scope | null {
  const product = pick(textOf(data, 'product'), PRODUCTS);
  if (product === null) return null;
  const door = {
    product: 'personal_loan' as CreditProduct,
    purpose: 'personal' as const,
    secured: product === 'mortgage' ? ('mortgage' as const) : ('none' as const),
    leaseWithoutPurchase: product === 'lease',
    principal: MIN_PRINCIPAL,
    agreedOn: NO_DATE,
  };
  if (product === 'mortgage' || product === 'lease') return scope(door);
  const purpose = pick(textOf(data, 'purpose'), PURPOSES);
  if (purpose === null) return null;
  if (purpose === 'business') return scope({ ...door, purpose });
  const principal = parseAmount(
    textOf(data, product === 'revolving' ? 'cardLimit' : 'principal') ?? '',
  );
  if (principal === null || Number.isNaN(principal) || principal <= 0) return null;
  if (principal < MIN_PRINCIPAL) return scope({ ...door, principal });
  const agreedOn = tryDate(textOf(data, 'agreedOn')?.trim() ?? '');
  if (agreedOn === null) return null;
  return scope({ ...door, product, principal, agreedOn });
}

// The reach of the review once the door's answers read: consumer credit under the 2011 law, or a
// revolving card of any date for the indicator alone. Null until it can be told.
export const formScope = (form: HTMLFormElement): Scope | null => doorScope(new FormData(form));

interface Reading {
  readonly errors: FieldError[];
  readonly product: ProductAnswer | null;
  // Null while an answer the input needs is missing or unreadable.
  readonly input: CreditInput | null;
}

// FormData leaves out disabled controls, so a question that does not apply never reaches the
// engine. What depends on the door (a card concluded before the 2011 law is asked only what its
// indicator needs) is decided here, since no single answer switches it.
function read(form: HTMLFormElement, today: CivilDate): Reading {
  const data = new FormData(form);
  const errors: FieldError[] = [];
  const text = (field: CreditFormField) => textOf(data, field);
  const asked = (field: CreditFormField) =>
    form.querySelector(`[name="${field}"]:not(:disabled)`) !== null;
  const fail = (field: CreditFormField, code: FieldErrorCode) => errors.push({ field, code });

  const choice = <T extends string>(field: CreditFormField, options: readonly T[]): T | null => {
    if (!asked(field)) return null;
    const v = pick(text(field), options);
    if (v === null) fail(field, 'missing_choice');
    return v;
  };
  // Undefined while not asked or unanswered; «No lo sé» reads as null.
  const answer = (field: CreditFormField): boolean | null | undefined => {
    if (!asked(field)) return undefined;
    const v = triState(text(field));
    if (v === undefined) fail(field, 'missing_choice');
    return v;
  };
  // A day already gone: what the contract says happened.
  const date = (field: CreditFormField, required: boolean, past = false): CivilDate | null => {
    if (!asked(field)) return null;
    const t = text(field)?.trim() ?? '';
    if (t === '') {
      if (required) fail(field, 'missing_value');
      return null;
    }
    const d = tryDate(t);
    if (d === null) fail(field, 'invalid_date');
    else if (past && compareDates(d, today) > 0) fail(field, 'in_future');
    return d;
  };
  const number = (
    field: CreditFormField,
    required: boolean,
    invalid: FieldErrorCode,
  ): number | null => {
    if (!asked(field)) return null;
    const n = parseAmount(text(field) ?? '');
    if (n === null) {
      if (required) fail(field, 'missing_value');
      return null;
    }
    if (Number.isNaN(n)) {
      fail(field, invalid);
      return null;
    }
    return n;
  };
  const amount = (field: CreditFormField, required: boolean) =>
    number(field, required, 'invalid_amount');
  const rate = (field: CreditFormField, required: boolean) =>
    number(field, required, 'invalid_rate');
  const count = (field: CreditFormField): number | null => {
    const n = number(field, true, 'invalid_count');
    if (n !== null && !Number.isInteger(n)) {
      fail(field, 'invalid_count');
      return null;
    }
    return n;
  };

  const product = choice('product', PRODUCTS);
  const reach = doorScope(data);
  if (product === null || product === 'mortgage' || product === 'lease')
    return { errors, product, input: null };
  const revolving = product === 'revolving';
  const purpose = choice('purpose', PURPOSES);
  const principal = amount(revolving ? 'cardLimit' : 'principal', true);
  const agreedOn = date('agreedOn', true, true);
  const drawnOn = revolving ? agreedOn : date('drawnOn', true, true);
  if (reach === null || !reach.inScope) return { errors, product, input: null };
  // A card concluded before the 2011 law gets only its indicator and its statement arithmetic.
  const full = !reach.indicatorOnly;

  const nominalRate = rate('nominalRate', true);
  const rateType = revolving ? 'fixed' : choice('rateType', RATE_TYPES);
  const aprStated = answer('aprStated');
  const declaredApr = aprStated === true ? rate('declaredApr', true) : null;
  const declaredTotalPayable = amount('declaredTotalPayable', false);

  let instalments: Instalments | null = null;
  let balloon: Balloon | null = null;
  const charges: Charge[] = [];
  let insurance: LinkedInsurance | null = null;
  if (!revolving) {
    const instalmentCount = count('instalmentCount');
    const instalmentAmount = amount('instalmentAmount', true);
    const firstDueOn = date('firstDueOn', true);
    if (instalmentCount !== null && instalmentAmount !== null && firstDueOn !== null)
      instalments = {
        kind: 'regular',
        count: instalmentCount,
        amount: instalmentAmount,
        frequency: 'monthly',
        firstDueOn,
      };

    if (answer('hasBalloon') === true) {
      const balloonAmount = amount('balloonAmount', true);
      const balloonDueOn = date('balloonDueOn', false);
      if (balloonAmount !== null) balloon = { amount: balloonAmount, dueOn: balloonDueOn };
    }

    // A charge left blank was not charged; one entered says how it was paid. Charges are taken as
    // paid the day the money arrives, as they are at the drawdown.
    const charge = (fee: CreditFormField, how: CreditFormField, kind: ChargeKind) => {
      const value = amount(fee, false);
      if (value === null) return;
      const payment = choice(how, CHARGE_PAYMENTS);
      if (payment !== null && drawnOn !== null)
        charges.push({ kind, amount: value, paidOn: drawnOn, how: payment });
    };
    charge('openingFee', 'openingHow', 'opening');
    charge('otherFee', 'otherHow', 'other');

    if (answer('hasInsurance') === true) {
      const premium = amount('premium', true);
      const kind = choice('premiumKind', PREMIUM_KINDS);
      const financed = kind === 'single' ? answer('premiumFinanced') : false;
      const required = answer('insuranceRequired');
      if (premium !== null && kind !== null && financed !== undefined && required !== undefined)
        insurance = {
          premium,
          single: kind === 'single',
          financed: financed === true,
          required,
        };
    }
  }

  let card: Card | null = null;
  if (revolving) {
    const annualFee = amount('annualFee', false) ?? 0;
    const monthlyPayment = amount('monthlyPayment', true);
    const balance = amount('balance', false) ?? 0;
    if (principal !== null && nominalRate !== null && monthlyPayment !== null)
      card = {
        limit: principal,
        nominalRate,
        annualFee,
        minimumPayment: monthlyPayment,
        balance,
      };
  }

  // Without a stated APR, the one worked out from the contract is the only one to compare.
  const compared = full && aprStated === true ? choice('confirmedApr', COMPARED_APRS) : null;
  const confirmedApr = full && (aprStated === false || compared === 'recalculated');

  let earlyRepayment: EarlyRepayment | null = null;
  if (full && !revolving && answer('repaid') === true) {
    const on = date('repaidOn', true, true);
    const principalRepaid = amount('principalRepaid', true);
    const compensationCharged = amount('compensation', true);
    const interestSettled = amount('interestSettled', false);
    const agreedEndOn = date('agreedEndOn', true);
    const remainingInterest = amount('remainingInterest', false);
    const paidByInsurance = answer('paidByInsurance');
    const discountLost = product === 'car_loan' ? answer('discountLost') : null;
    if (
      on !== null &&
      principalRepaid !== null &&
      compensationCharged !== null &&
      agreedEndOn !== null &&
      paidByInsurance !== undefined &&
      paidByInsurance !== null &&
      discountLost !== undefined
    )
      earlyRepayment = {
        on,
        principalRepaid,
        interestSettled,
        compensationCharged,
        paidByInsurance,
        agreedEndOn,
        remainingInterest,
        discountLost,
      };
  }

  let infoReceived: boolean | null = null;
  let infoReceivedOn: CivilDate | null = null;
  if (full) {
    const received = answer('infoReceived');
    infoReceived = received ?? null;
    infoReceivedOn = received === true ? date('infoReceivedOn', false, true) : null;
  }

  if (
    errors.length > 0 ||
    purpose === null ||
    principal === null ||
    agreedOn === null ||
    drawnOn === null ||
    nominalRate === null ||
    rateType === null ||
    aprStated === undefined ||
    aprStated === null ||
    (!revolving && instalments === null) ||
    (revolving && card === null)
  )
    return { errors, product, input: null };

  return {
    errors,
    product,
    input: {
      product,
      purpose,
      secured: 'none',
      leaseWithoutPurchase: false,
      agreedOn,
      drawnOn,
      principal,
      // What reached the account follows from the charges deducted from it.
      netDisbursed: null,
      nominalRate,
      rateType,
      declaredApr,
      declaredTotalPayable: revolving ? null : declaredTotalPayable,
      confirmedApr,
      instalments,
      balloon,
      charges,
      insurance,
      card,
      earlyRepayment,
      infoReceivedOn,
      infoReceived,
      // The checklist of art. 16.2 is not asked here: each mention stays unanswered.
      mentions: {},
    },
  };
}

// Where each of the engine's fields is asked.
function fieldOf(field: CreditField, input: CreditInput): CreditFormField {
  switch (field) {
    case 'principal':
    case 'netDisbursed':
    case 'card.limit':
      return input.product === 'revolving' ? 'cardLimit' : 'principal';
    case 'card.nominalRate':
      return 'nominalRate';
    case 'instalments.count':
    case 'instalments.rows':
      return 'instalmentCount';
    case 'instalments.amount':
      return 'instalmentAmount';
    case 'instalments.firstDueOn':
      return 'firstDueOn';
    case 'balloon':
      return 'balloonAmount';
    case 'balloon.dueOn':
      return 'balloonDueOn';
    case 'charges':
      return input.charges[0]?.kind === 'opening' ? 'openingFee' : 'otherFee';
    case 'insurance.premium':
      return 'premium';
    case 'card.annualFee':
      return 'annualFee';
    case 'card.minimumPayment':
      return 'monthlyPayment';
    case 'card.balance':
      return 'balance';
    case 'earlyRepayment.on':
      return 'repaidOn';
    case 'earlyRepayment.principalRepaid':
      return 'principalRepaid';
    case 'earlyRepayment.interestSettled':
      return 'interestSettled';
    case 'earlyRepayment.compensationCharged':
      return 'compensation';
    case 'earlyRepayment.agreedEndOn':
      return 'agreedEndOn';
    case 'earlyRepayment.remainingInterest':
      return 'remainingInterest';
    default:
      return field;
  }
}

// The engine's checks, each on the question that asks it.
export const onQuestions = (errors: readonly ValidationError[], input: CreditInput): FieldError[] =>
  errors.map(({ field, code }) => ({ field: fieldOf(field, input), code }));

const engineErrors = (input: CreditInput, today: CivilDate): FieldError[] =>
  onQuestions(validate(input, today), input);

export function sheetErrors(form: HTMLFormElement, sheet: Sheet, today: CivilDate): FieldError[] {
  const r = read(form, today);
  const fields: readonly CreditFormField[] = SHEET_FIELDS[sheet];
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

export function readCreditForm(
  form: HTMLFormElement,
  today: CivilDate,
): { readonly input: CreditInput } | { readonly errors: readonly FieldError[] } {
  const r = read(form, today);
  if (r.errors.length > 0) return { errors: r.errors };
  // Only a credit outside the review reads without its figures, and the gate stops it first.
  if (r.input === null) return { errors: [{ field: 'product', code: 'missing_choice' }] };
  const errors = engineErrors(r.input, today);
  return errors.length > 0 ? { errors } : { input: r.input };
}

export const isLoan = (product: string): boolean => (LOANS as readonly string[]).includes(product);
