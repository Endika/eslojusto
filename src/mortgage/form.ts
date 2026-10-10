import { parseAmount } from '../calculator/number';
import { pick, triState, tryDate } from '../calculator/review-form';
import { compareDates, type CivilDate } from '../engine/date';
import { scope } from '../engine/mortgage/scope';
import type {
  Clause,
  ClauseLabel,
  Invoice,
  InvoiceKind,
  LoanKind,
  MortgageInput,
  Operation,
  PrepaymentOption,
  RateType,
  Scope,
} from '../engine/mortgage/types';
import {
  validate,
  type MortgageField,
  type ValidationCode,
  type ValidationError,
} from '../engine/mortgage/validate';
import type { MortgageFormField } from './ports';

export { MORTGAGE_FIELDS, type MortgageFormField } from './ports';

// The sheets in order. Step ids are also the URL fragments, so they keep their Spanish names.
export const SHEETS = [
  'hipoteca',
  'titular',
  'escritura',
  'tipo',
  'clausula-gastos',
  'suelo',
  'indice',
  'demora',
  'vencimiento',
  'apertura',
  'otras',
  'facturas',
  'notaria',
  'registro',
  'gestoria',
  'tasacion',
  'impuesto',
  'pago',
  'acuerdo',
  'amortizacion',
  'operacion',
  'condiciones',
  'seguro',
] as const;
export type Sheet = (typeof SHEETS)[number];

// What the first sheet offers: the mortgage the review covers and those that stop at the door.
export const LOAN_KINDS: readonly LoanKind[] = [
  'standard',
  'developer_subrogation',
  'multicurrency',
  'reverse',
  'not_mortgage',
];
export const BORROWERS = ['individual', 'company'] as const;
export const PURPOSES = ['housing', 'business'] as const;
export const RATE_TYPES: readonly RateType[] = ['fixed', 'variable', 'mixed'];
export const EXPENSES_CLAUSE = ['present', 'absent', 'unknown'] as const;
export const OPERATION_KINDS = [
  'none',
  'partial_prepayment',
  'full_prepayment',
  'fixed_rate_novation',
  'creditor_subrogation',
] as const;
export const PREPAYMENT_OPTIONS: readonly PrepaymentOption[] = ['a_015_5y', 'b_025_3y', 'unknown'];

export const SHEET_FIELDS: Readonly<Record<Sheet, readonly MortgageFormField[]>> = {
  hipoteca: ['loanKind'],
  titular: ['borrower', 'purpose'],
  escritura: ['deedOn', 'loanAmount', 'consumer'],
  tipo: ['rateType', 'revisionMonths'],
  'clausula-gastos': ['expensesClause'],
  suelo: ['floor', 'floorPercent'],
  indice: ['irph'],
  demora: ['defaultInterest', 'defaultRate', 'ordinaryRate'],
  vencimiento: ['earlyTermination', 'missedInstalments'],
  apertura: ['openingFee', 'openingFeeAmount', 'duplicateFee'],
  otras: ['roundingUp', 'insuranceRequired'],
  facturas: ['hasInvoices'],
  notaria: ['notaryLoan', 'notaryMixed'],
  registro: ['registryMortgage', 'registryMixed'],
  gestoria: ['agency', 'agencyTax', 'agencyRegistry'],
  tasacion: ['valuation', 'transparencyDeed'],
  impuesto: ['ajdLoan'],
  pago: ['paidOn'],
  acuerdo: ['agreement', 'returned'],
  amortizacion: ['operation'],
  operacion: ['operationOn', 'operationPrincipal', 'operationFee'],
  condiciones: ['prepaymentOption'],
  seguro: ['hadInsurance'],
};

export const sheetOfField = (field: MortgageFormField): Sheet =>
  SHEETS.find((s) => SHEET_FIELDS[s].includes(field)) ?? 'hipoteca';

export type FieldErrorCode =
  | ValidationCode
  | 'missing_value'
  | 'missing_choice'
  | 'invalid_amount'
  | 'invalid_rate'
  | 'invalid_count';

// The UI words `code` through `client.mortgage.error.<code>`.
export interface FieldError {
  readonly field: MortgageFormField;
  readonly code: FieldErrorCode;
}

// The invoices asked one by one, each on its own question. The purchase's own costs are never
// asked: this review does not count them, and an invoice that mixes both is marked as such.
interface InvoiceQuestion {
  readonly kind: InvoiceKind;
  readonly field: MortgageFormField;
  readonly mixed?: MortgageFormField;
  // Left out of the review when blank, rather than listed as not entered.
  readonly optional?: boolean;
}

const INVOICES: readonly InvoiceQuestion[] = [
  { kind: 'notary_loan', field: 'notaryLoan', mixed: 'notaryMixed' },
  { kind: 'registry_mortgage', field: 'registryMortgage', mixed: 'registryMixed' },
  { kind: 'agency', field: 'agency' },
  { kind: 'valuation', field: 'valuation' },
  { kind: 'transparency_deed', field: 'transparencyDeed', optional: true },
  { kind: 'ajd_loan', field: 'ajdLoan' },
];

// The clauses asked, each by its yes, no or «No lo sé».
const CLAUSES: readonly (readonly [ClauseLabel, MortgageFormField])[] = [
  ['floor_clause', 'floor'],
  ['irph', 'irph'],
  ['default_interest', 'defaultInterest'],
  ['early_termination', 'earlyTermination'],
  ['opening_fee', 'openingFee'],
  ['rounding_up', 'roundingUp'],
  ['insurance_required', 'insuranceRequired'],
];

const textOf = (data: FormData, field: MortgageFormField): string | null => {
  const v = data.get(field);
  return typeof v === 'string' ? v : null;
};

// The answers the door reads: what the loan is, who took it and on what. Null until the sheets
// before it have answers that read.
function doorScope(data: FormData): Scope | null {
  const loanKind = pick(textOf(data, 'loanKind'), LOAN_KINDS);
  if (loanKind === null) return null;
  if (loanKind !== 'standard')
    return scope({ borrower: 'individual', purpose: 'housing', loanKind });
  const borrower = pick(textOf(data, 'borrower'), BORROWERS);
  if (borrower === null) return null;
  if (borrower === 'company') return scope({ borrower, purpose: 'housing', loanKind });
  const purpose = pick(textOf(data, 'purpose'), PURPOSES);
  if (purpose === null) return null;
  return scope({ borrower, purpose, loanKind });
}

// The reach of the review once the door's answers read; null until it can be told.
export const formScope = (form: HTMLFormElement): Scope | null => doorScope(new FormData(form));

interface Reading {
  readonly errors: FieldError[];
  // Null while an answer the input needs is missing or unreadable, or the loan is out of scope.
  readonly input: MortgageInput | null;
  // Where each invoice of the input is asked, by its position.
  readonly invoiceFields: readonly MortgageFormField[];
}

// FormData leaves out disabled controls, so a question that does not apply never reaches the
// engine.
function read(form: HTMLFormElement, today: CivilDate): Reading {
  const data = new FormData(form);
  const errors: FieldError[] = [];
  const text = (field: MortgageFormField) => textOf(data, field);
  const asked = (field: MortgageFormField) =>
    form.querySelector(`[name="${field}"]:not(:disabled)`) !== null;
  const fail = (field: MortgageFormField, code: FieldErrorCode) => errors.push({ field, code });

  const choice = <T extends string>(field: MortgageFormField, options: readonly T[]): T | null => {
    if (!asked(field)) return null;
    const v = pick(text(field), options);
    if (v === null) fail(field, 'missing_choice');
    return v;
  };
  // Undefined while not asked or unanswered; «No lo sé» reads as null.
  const answer = (field: MortgageFormField): boolean | null | undefined => {
    if (!asked(field)) return undefined;
    const v = triState(text(field));
    if (v === undefined) fail(field, 'missing_choice');
    return v;
  };
  const date = (field: MortgageFormField, required: boolean, past = false): CivilDate | null => {
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
    field: MortgageFormField,
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
  const amount = (field: MortgageFormField, required = false) =>
    number(field, required, 'invalid_amount');
  const rate = (field: MortgageFormField) => number(field, false, 'invalid_rate');
  const count = (field: MortgageFormField): number | null => {
    const n = number(field, false, 'invalid_count');
    if (n !== null && !Number.isInteger(n)) {
      fail(field, 'invalid_count');
      return null;
    }
    return n;
  };
  const none = { errors, input: null, invoiceFields: [] };

  const loanKind = choice('loanKind', LOAN_KINDS);
  const borrower = choice('borrower', BORROWERS);
  const purpose = choice('purpose', PURPOSES);
  const reach = doorScope(data);
  if (
    reach === null ||
    !reach.inScope ||
    loanKind === null ||
    borrower === null ||
    purpose === null
  )
    return none;

  const deedOn = date('deedOn', true, true);
  const loanAmount = amount('loanAmount');
  const consumer = answer('consumer');
  const rateType = choice('rateType', RATE_TYPES);
  const rateRevisionMonths = count('revisionMonths');
  const expensesClause = choice('expensesClause', EXPENSES_CLAUSE);

  // A clause not asked (a floor on a fixed rate) is left out; one asked carries its answer.
  const clauses: Clause[] = [];
  for (const [label, field] of CLAUSES) {
    const present = answer(field);
    if (present === undefined) continue;
    const yes = present === true;
    // A figure left blank stays out of the clause, as the engine expects.
    const known = <K extends keyof Clause>(key: K, value: Clause[K] | null) =>
      value === null ? {} : { [key]: value };
    const figures = {
      ...(yes && label === 'floor_clause' ? known('floorPercent', rate('floorPercent')) : {}),
      ...(yes && label === 'default_interest'
        ? {
            ...known('defaultRate', rate('defaultRate')),
            ...known('ordinaryRate', rate('ordinaryRate')),
          }
        : {}),
      ...(yes && label === 'early_termination'
        ? known('missedInstalments', count('missedInstalments'))
        : {}),
      ...(yes && label === 'opening_fee'
        ? {
            ...known('feeAmount', amount('openingFeeAmount')),
            ...(answer('duplicateFee') === true ? { duplicateFee: true } : {}),
          }
        : {}),
    };
    clauses.push({ label, present, ...figures });
  }

  // Whether there are invoices opens their sheets; an invoice left blank stays listed as not
  // entered.
  answer('hasInvoices');
  const paidOn = date('paidOn', false, true);
  const invoices: Invoice[] = [];
  const invoiceFields: MortgageFormField[] = [];
  for (const q of INVOICES) {
    const total = amount(q.field);
    if (q.optional === true && total === null) continue;
    const mixed = q.mixed !== undefined && total !== null ? answer(q.mixed) : false;
    const supplied =
      q.kind === 'agency' && total !== null
        ? [amount('agencyTax'), amount('agencyRegistry')].filter((x): x is number => x !== null)
        : [];
    invoices.push({
      kind: q.kind,
      total,
      // Only what the person paid is asked: what the lender paid itself is left blank.
      paidBy: 'me',
      paidOn: total === null ? null : paidOn,
      mixed: mixed === true,
      supplied,
    });
    invoiceFields.push(q.field);
  }
  const agreement = answer('agreement');
  const alreadyReturned = amount('returned');

  const kind = choice('operation', OPERATION_KINDS);
  const operations: Operation[] = [];
  let prepaymentOption: PrepaymentOption | null = null;
  if (kind !== null && kind !== 'none') {
    const on = date('operationOn', true, true);
    const principal = amount('operationPrincipal', true);
    const feeCharged = amount('operationFee', true);
    // Asked only of a variable or mixed rate repaid early; left open, the review works out both.
    prepaymentOption = choice('prepaymentOption', PREPAYMENT_OPTIONS);
    const hadInsurance = kind === 'full_prepayment' ? answer('hadInsurance') : null;
    if (on !== null && principal !== null && feeCharged !== null && hadInsurance !== undefined)
      operations.push({ on, kind, principal, feeCharged, hadInsurance });
  }

  if (
    errors.length > 0 ||
    deedOn === null ||
    consumer === undefined ||
    rateType === null ||
    expensesClause === null ||
    kind === null
  )
    return { errors, input: null, invoiceFields };

  return {
    errors,
    invoiceFields,
    input: {
      deedOn,
      borrower,
      purpose,
      consumer,
      loanKind,
      rateType,
      // The end of a mixed rate's fixed stretch changes no cap this review checks.
      fixedUntil: null,
      rateRevisionMonths,
      loanAmount,
      expensesClause,
      invoices,
      alreadyReturned,
      // Not asked without invoices, when it changes nothing.
      agreementOnExpenses: agreement ?? null,
      prepaymentOption,
      // The deed's own percentages are not asked: the caps come from the law.
      deedPercents: {},
      operations,
      clauses,
    },
  };
}

// Where each of the engine's fields is asked; an invoice's total, by the invoice.
const FIELD_OF: Readonly<Record<Exclude<MortgageField, 'invoices.total'>, MortgageFormField>> = {
  deedOn: 'deedOn',
  fixedUntil: 'rateType',
  rateRevisionMonths: 'revisionMonths',
  loanAmount: 'loanAmount',
  'invoices.paidOn': 'paidOn',
  'invoices.supplied': 'agencyTax',
  alreadyReturned: 'returned',
  'deedPercents.variable': 'prepaymentOption',
  'deedPercents.fixed': 'prepaymentOption',
  'operations.on': 'operationOn',
  'operations.principal': 'operationPrincipal',
  'operations.feeCharged': 'operationFee',
  'clauses.floorPercent': 'floorPercent',
  'clauses.defaultRate': 'defaultRate',
  'clauses.ordinaryRate': 'ordinaryRate',
  'clauses.missedInstalments': 'missedInstalments',
  'clauses.feeAmount': 'openingFeeAmount',
};

const fieldOf = (e: ValidationError, invoiceFields: readonly MortgageFormField[]) =>
  e.field === 'invoices.total' ? (invoiceFields[e.index ?? 0] ?? 'notaryLoan') : FIELD_OF[e.field];

// The engine's checks, each on the question that asks it, once.
export function onQuestions(
  errors: readonly ValidationError[],
  invoiceFields: readonly MortgageFormField[],
): FieldError[] {
  const seen = new Set<string>();
  return errors.flatMap((e) => {
    const field = fieldOf(e, invoiceFields);
    const key = `${field}:${e.code}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ field, code: e.code }];
  });
}

export function sheetErrors(form: HTMLFormElement, sheet: Sheet, today: CivilDate): FieldError[] {
  const r = read(form, today);
  const fields: readonly MortgageFormField[] = SHEET_FIELDS[sheet];
  const own = r.errors.filter((e) => fields.includes(e.field));
  const withError = new Set(r.errors.map((e) => e.field));
  const fromEngine =
    r.input === null
      ? []
      : onQuestions(validate(r.input, today), r.invoiceFields).filter(
          (e) => fields.includes(e.field) && !withError.has(e.field),
        );
  return [...own, ...fromEngine];
}

export interface MortgageForm {
  readonly input: MortgageInput;
  readonly invoiceFields: readonly MortgageFormField[];
}

export function readMortgageForm(
  form: HTMLFormElement,
  today: CivilDate,
): MortgageForm | { readonly errors: readonly FieldError[] } {
  const r = read(form, today);
  if (r.errors.length > 0) return { errors: r.errors };
  // Only a loan outside the review reads without its answers, and the gate stops it first.
  if (r.input === null) return { errors: [{ field: 'loanKind', code: 'missing_choice' }] };
  const errors = onQuestions(validate(r.input, today), r.invoiceFields);
  return errors.length > 0 ? { errors } : { input: r.input, invoiceFields: r.invoiceFields };
}
