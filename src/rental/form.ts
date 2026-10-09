import { compareDates, parseDate, type CivilDate } from '../engine/date';
import { anniversaryIn } from '../engine/rental/anniversary';
import {
  REGION_CODES,
  type Charge,
  type ChargeKind,
  type ContractType,
  type DeductionKind,
  type Fee,
  type FeeKind,
  type Guarantee,
  type GuaranteeKind,
  type MoveOut,
  type NoticeForm,
  type RegionCode,
  type RentalInput,
  type RentUpdateInput,
  type UpdateClause,
} from '../engine/rental/types';
import {
  validateRental,
  type RentalInputError,
  type RentalInputErrorCode,
} from '../engine/rental/validate';
import { parseAmount } from '../calculator/number';
import type { RentalField } from './ports';
import { ROW_LISTS, parseRowField, rowField, type RowList } from './rows';

// The sheets in order. Each fits a phone's screen, so a long topic takes more than one; the
// charges come last because the move-out's follow-up sheet is asked only after leaving.
export const SHEETS = [
  'contrato',
  'fechas',
  'casero',
  'gran-tenedor',
  'vivienda',
  'entrada',
  'garantias',
  'pagos',
  'renta',
  'actualizacion',
  'subidas',
  'salida',
  'fianza',
  'gastos',
] as const;
export type Sheet = (typeof SHEETS)[number];

export const CONTRACT_TYPES: readonly ContractType[] = [
  'main_home',
  'seasonal',
  'room',
  'other_use',
  'protected',
  'old_rent',
];
export const UPDATE_CLAUSES: readonly UpdateClause[] = [
  'none',
  'irav',
  'ipc',
  'igc',
  'unspecified_index',
  'fixed_percent',
  'other',
];
export const GUARANTEE_KINDS: readonly GuaranteeKind[] = [
  'cash',
  'bank_guarantee',
  'insurance',
  'other',
];
export const FEE_KINDS: readonly FeeKind[] = [
  'agency_fee',
  'formalisation',
  'solvency_check',
  'reservation',
  'management',
  'other',
];
// The two names the law gives a fee; any other asks whether it was requested in writing.
export const NAMED_FEES: readonly FeeKind[] = ['agency_fee', 'formalisation'];
export const NOTICE_FORMS: readonly NoticeForm[] = [
  'letter',
  'burofax',
  'receipt_note',
  'annex',
  'email',
  'messaging',
  'verbal',
  'none',
];
// A notice that carries a date: in writing or by electronic means.
export const DATED_NOTICES: readonly NoticeForm[] = [
  'letter',
  'burofax',
  'receipt_note',
  'annex',
  'email',
  'messaging',
];
export const CHARGE_KINDS: readonly ChargeKind[] = ['community', 'property_tax', 'waste', 'other'];
export const DEDUCTION_KINDS: readonly DeductionKind[] = [
  'damage',
  'cleaning',
  'unpaid_rent',
  'unpaid_bills',
  'wear',
  'other',
];

export type FieldErrorCode =
  RentalInputErrorCode | 'missing_value' | 'missing_choice' | 'invalid_amount' | 'invalid_number';

// The UI words `code` through `client.rental.error.<code>`.
export interface FieldError {
  readonly field: string;
  readonly code: FieldErrorCode;
}

// The questions each sheet asks; a row list counts by its name.
export const SHEET_FIELDS: Record<Sheet, readonly RentalField[]> = {
  contrato: ['contractType'],
  fechas: ['signedOn', 'startDate'],
  casero: ['landlordType'],
  'gran-tenedor': ['largeLandlord'],
  vivienda: ['region', 'stressedZone'],
  entrada: ['deposit', 'advanceMonths'],
  garantias: ['hasGuarantees', 'guarantees'],
  pagos: ['hasFees', 'fees'],
  renta: ['initialRent', 'agreedMonths'],
  actualizacion: ['updateClause', 'fixedPercent'],
  subidas: ['hasUpdates', 'updates'],
  salida: ['movedOut', 'keysReturnedOn'],
  fianza: ['returns', 'deductions'],
  gastos: ['hasCharges', 'charges'],
};

// «fees.0.amount» belongs to «fees».
export const baseField = (field: string): string => field.split('.')[0] ?? field;

export const sheetOfField = (field: string): Sheet =>
  SHEETS.find((s) => (SHEET_FIELDS[s] as readonly string[]).includes(baseField(field))) ??
  'contrato';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

const DEFAULTS: RentalInput = {
  contractType: 'main_home',
  signedOn: { y: 2020, m: 1, d: 1 },
  startDate: { y: 2020, m: 1, d: 1 },
  landlordType: 'person',
  largeLandlord: null,
  agreedMonths: 12,
  initialRent: 1000,
  updateClause: 'none',
  region: 'MD',
  stressedZone: null,
  fees: [],
  deposit: null,
  guarantees: [],
  advanceMonths: null,
  updates: [],
  charges: [],
  moveOut: null,
};

// Where each item of a list in the input sits on screen, so an engine error lands on its row.
export type RowsOnScreen = Readonly<Record<RowList, readonly (readonly number[])[]>>;

interface Reading {
  readonly partial: Partial<Mutable<RentalInput>>;
  readonly errors: FieldError[];
  readonly rows: RowsOnScreen;
}

// LAU amounts the engine accepts: above zero and up to a million.
const MAX_AMOUNT = 1_000_000;

const pick = <T extends string>(value: string | null, options: readonly T[]): T | null =>
  value !== null && (options as readonly string[]).includes(value) ? (value as T) : null;

const triState = (value: string | null): boolean | null | undefined =>
  value === 'yes' ? true : value === 'no' ? false : value === 'unknown' ? null : undefined;

// FormData leaves out disabled controls, so a question that does not apply never reaches the engine.
function read(form: HTMLFormElement): Reading {
  const data = new FormData(form);
  const partial: Partial<Mutable<RentalInput>> = {};
  const errors: FieldError[] = [];
  const text = (field: string): string | null => {
    const v = data.get(field);
    return typeof v === 'string' ? v : null;
  };
  // Whether the question is asked: some control of it is on and enabled.
  const asked = (field: string) => form.querySelector(`[name="${field}"]:not(:disabled)`) !== null;
  const fail = (field: string, code: FieldErrorCode) => errors.push({ field, code });

  const choice = <T extends string>(field: string, options: readonly T[]): T | null => {
    const v = pick(text(field), options);
    if (v === null) fail(field, 'missing_choice');
    return v;
  };
  const date = (field: string, required: boolean): CivilDate | null => {
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
  const amount = (field: string, required: boolean): number | null => {
    const n = parseAmount(text(field) ?? '');
    if (n === null) {
      if (required) fail(field, 'missing_value');
      return null;
    }
    if (Number.isNaN(n)) fail(field, 'invalid_amount');
    else if (n <= 0 || n > MAX_AMOUNT) fail(field, 'amount_out_of_range');
    else return n;
    return null;
  };
  const whole = (field: string, required: boolean): number | null => {
    const n = parseAmount(text(field) ?? '');
    if (n === null) {
      if (required) fail(field, 'missing_value');
      return null;
    }
    if (Number.isNaN(n) || !Number.isInteger(n)) fail(field, 'invalid_number');
    else return n;
    return null;
  };
  const answer = (field: string): boolean | null | undefined => {
    const v = triState(text(field));
    if (v === undefined) fail(field, 'missing_choice');
    return v;
  };
  const enabledRows = (list: RowList): number[] =>
    [...form.querySelectorAll<HTMLElement>(`[data-rows="${list}"] [data-row]`)]
      .filter((row) => row.querySelector(`[name^="${list}."]:not(:disabled)`) !== null)
      .map((row) => Number(row.dataset['row']));
  const rows: Record<RowList, number[][]> = Object.fromEntries(
    ROW_LISTS.map((list) => [list, []]),
  ) as unknown as Record<RowList, number[][]>;

  const contractType = choice('contractType', CONTRACT_TYPES);
  if (contractType) partial.contractType = contractType;
  const signedOn = date('signedOn', true);
  if (signedOn) partial.signedOn = signedOn;
  const startDate = date('startDate', true);
  if (startDate) partial.startDate = startDate;

  if (asked('landlordType')) {
    const landlord = choice('landlordType', ['person', 'company'] as const);
    if (landlord) partial.landlordType = landlord;
  }
  if (asked('largeLandlord')) {
    const large = answer('largeLandlord');
    if (large !== undefined) partial.largeLandlord = large;
  }
  if (asked('region')) {
    const region = pick<RegionCode>(text('region'), REGION_CODES);
    if (region) partial.region = region;
    else fail('region', 'missing_choice');
  }
  if (asked('stressedZone')) {
    const zone = answer('stressedZone');
    if (zone !== undefined) partial.stressedZone = zone;
  }

  if (asked('deposit')) partial.deposit = amount('deposit', false);
  if (asked('advanceMonths')) partial.advanceMonths = whole('advanceMonths', false);

  if (text('hasGuarantees') === 'yes') {
    const guarantees: Guarantee[] = [];
    for (const i of enabledRows('guarantees')) {
      const field = (key: string) => rowField('guarantees', i, key);
      const kind = choice(field('kind'), GUARANTEE_KINDS);
      const value = amount(field('amount'), kind === 'cash');
      if (kind && (value !== null || kind !== 'cash')) {
        guarantees.push({ kind, amount: value });
        rows.guarantees.push([i]);
      }
    }
    partial.guarantees = guarantees;
  } else if (asked('hasGuarantees')) partial.guarantees = [];

  if (text('hasFees') === 'yes') {
    const fees: Fee[] = [];
    for (const i of enabledRows('fees')) {
      const field = (key: string) => rowField('fees', i, key);
      const kind = choice(field('kind'), FEE_KINDS);
      const value = amount(field('amount'), true);
      const later = answer(field('deductedLater'));
      const requested = asked(field('requestedInWriting'))
        ? answer(field('requestedInWriting'))
        : null;
      if (kind && value !== null && typeof later === 'boolean' && requested !== undefined) {
        fees.push({ kind, amount: value, deductedLater: later, requestedInWriting: requested });
        rows.fees.push([i]);
      }
    }
    partial.fees = fees;
  } else if (asked('hasFees')) partial.fees = [];

  if (asked('initialRent')) {
    const rent = amount('initialRent', true);
    if (rent !== null) partial.initialRent = rent;
  }
  if (asked('agreedMonths')) {
    const months = whole('agreedMonths', true);
    if (months !== null) partial.agreedMonths = months;
  }
  if (asked('updateClause')) {
    const clause = choice('updateClause', UPDATE_CLAUSES);
    if (clause) partial.updateClause = clause;
  }
  if (data.has('fixedPercent')) {
    const n = parseAmount(text('fixedPercent') ?? '');
    if (n === null) fail('fixedPercent', 'missing_value');
    else if (Number.isNaN(n)) fail('fixedPercent', 'invalid_amount');
    else partial.fixedPercent = n;
  }

  if (text('hasUpdates') === 'yes') {
    const updates: RentUpdateInput[] = [];
    for (const i of enabledRows('updates')) {
      const field = (key: string) => rowField('updates', i, key);
      const year = whole(field('year'), true);
      const previousRent = amount(field('previousRent'), true);
      const newRent = amount(field('newRent'), true);
      const chargedFrom = date(field('chargedFrom'), true);
      const notice = choice(field('notice'), NOTICE_FORMS);
      const dated = notice !== null && DATED_NOTICES.includes(notice);
      const noticeOn = dated ? date(field('noticeOn'), true) : null;
      const verbally = text(field('agreedInWriting')) === 'verbal';
      const agreed = verbally ? false : answer(field('agreedInWriting'));
      const start = partial.startDate;
      if (year !== null && (year < 1900 || year > 2200)) fail(field('year'), 'invalid_number');
      else if (
        year !== null &&
        previousRent !== null &&
        newRent !== null &&
        chargedFrom &&
        notice &&
        (!dated || noticeOn) &&
        agreed !== undefined &&
        start
      ) {
        const anniversary = anniversaryIn(start, year);
        // A rise charged before its anniversary took effect early; one charged on or after it
        // took effect on the anniversary, and the months after it count from the first charged.
        const effectiveOn = compareDates(chargedFrom, anniversary) < 0 ? chargedFrom : anniversary;
        updates.push({
          anniversary,
          effectiveOn,
          previousRent,
          newRent,
          chargedFrom,
          notice,
          noticeOn,
          agreedInWriting: agreed,
          ...(verbally ? { agreedVerbally: true } : {}),
        });
        rows.updates.push([i]);
      }
    }
    partial.updates = updates;
  } else if (asked('hasUpdates')) partial.updates = [];

  if (text('hasCharges') === 'yes') {
    // One charge per concept: its first row says what the contract fixes, every row one year.
    const groups = new Map<ChargeKind, { charge: Mutable<Charge>; rows: number[] } | null>();
    for (const i of enabledRows('charges')) {
      const field = (key: string) => rowField('charges', i, key);
      const kind = choice(field('kind'), CHARGE_KINDS);
      const year = whole(field('year'), true);
      const charged = amount(field('amount'), true);
      if (!kind) continue;
      if (!groups.has(kind)) {
        const inContract = answer(field('inContract'));
        const agreed = amount(field('annualAgreed'), false);
        groups.set(
          kind,
          typeof inContract === 'boolean'
            ? { charge: { kind, inContract, annualAgreed: agreed, charged: [] }, rows: [] }
            : null,
        );
      }
      const group = groups.get(kind);
      if (!group || year === null || charged === null) continue;
      group.charge.charged = [...group.charge.charged, { year, amount: charged }];
      group.rows.push(i);
    }
    const read = [...groups.values()].filter(
      (g): g is NonNullable<typeof g> => g !== null && g.rows.length > 0,
    );
    partial.charges = read.map((g) => g.charge);
    rows.charges.push(...read.map((g) => g.rows));
  } else if (asked('hasCharges')) partial.charges = [];

  if (text('movedOut') === 'yes') {
    const keys = date('keysReturnedOn', true);
    const returns: { on: CivilDate; amount: number }[] = [];
    for (const i of enabledRows('returns')) {
      const on = date(rowField('returns', i, 'on'), true);
      const value = amount(rowField('returns', i, 'amount'), true);
      if (on && value !== null) {
        returns.push({ on, amount: value });
        rows.returns.push([i]);
      }
    }
    const deductions: { amount: number; kind: DeductionKind }[] = [];
    for (const i of enabledRows('deductions')) {
      const kind = choice(rowField('deductions', i, 'kind'), DEDUCTION_KINDS);
      const value = amount(rowField('deductions', i, 'amount'), true);
      if (kind && value !== null) {
        deductions.push({ kind, amount: value });
        rows.deductions.push([i]);
      }
    }
    if (keys) partial.moveOut = { keysReturnedOn: keys, returns, deductions } satisfies MoveOut;
  } else if (asked('movedOut')) {
    if (text('movedOut') !== 'no') fail('movedOut', 'missing_choice');
    partial.moveOut = null;
  }

  return { partial, errors, rows };
}

const complete = (partial: Partial<RentalInput>): RentalInput => ({ ...DEFAULTS, ...partial });

// The contract sheet alone, for the gate: null until its three answers read.
export function contractAnswers(
  form: HTMLFormElement,
): Pick<RentalInput, 'contractType' | 'signedOn' | 'startDate'> | null {
  const { partial } = read(form);
  const { contractType, signedOn, startDate } = partial;
  return contractType && signedOn && startDate ? { contractType, signedOn, startDate } : null;
}

const rowOf = (rows: RowsOnScreen, list: RowList, index: number | undefined): number =>
  rows[list][index ?? 0]?.[0] ?? index ?? 0;

// Puts an engine error on the field that asked for it.
export function fieldOfError(
  e: RentalInputError,
  rows: RowsOnScreen,
  input: RentalInput,
  today: CivilDate,
): string {
  const { field, index, code } = e;
  switch (field) {
    case 'fees':
    case 'guarantees':
      return rowField(field, rowOf(rows, field, index), 'amount');
    case 'updates': {
      const row = rowOf(rows, 'updates', index);
      const u = input.updates[index ?? 0];
      if (code === 'notice_date_missing' || code === 'notice_in_future')
        return rowField('updates', row, 'noticeOn');
      if (code === 'amount_out_of_range') return rowField('updates', row, 'newRent');
      if (
        code === 'effective_outside_year' ||
        code === 'charged_before_start' ||
        (code === 'update_in_future' && u !== undefined && compareDates(u.chargedFrom, today) > 0)
      )
        return rowField('updates', row, 'chargedFrom');
      return rowField('updates', row, 'year');
    }
    case 'charges': {
      const group = rows.charges[index ?? 0] ?? [index ?? 0];
      const charge = input.charges[index ?? 0];
      if (code === 'year_out_of_range' && charge) {
        const k = charge.charged.findIndex(
          ({ year }) => year < input.signedOn.y - 1 || year > today.y,
        );
        return rowField('charges', group[k] ?? group[0] ?? 0, 'year');
      }
      return rowField('charges', group[0] ?? 0, code === 'amount_out_of_range' ? 'amount' : 'year');
    }
    case 'moveOut':
      return index === undefined
        ? 'keysReturnedOn'
        : rowField('returns', rowOf(rows, 'returns', index), 'on');
    default:
      return field;
  }
}

// The engine's checks for whatever the form already says, on the fields that asked.
function engineErrors(r: Reading, today: CivilDate): FieldError[] {
  const input = complete(r.partial);
  return validateRental(input, today)
    .filter((e) => e.field in r.partial)
    .map((e) => ({ field: fieldOfError(e, r.rows, input, today), code: e.code }));
}

export function sheetErrors(form: HTMLFormElement, sheet: Sheet, today: CivilDate): FieldError[] {
  const r = read(form);
  const fields: readonly string[] = SHEET_FIELDS[sheet];
  const own = r.errors.filter((e) => fields.includes(baseField(e.field)));
  const withError = new Set(own.map((e) => e.field));
  const fromEngine = engineErrors(r, today).filter(
    (e) => fields.includes(baseField(e.field)) && !withError.has(e.field),
  );
  return [...own, ...fromEngine];
}

export function readRentalForm(
  form: HTMLFormElement,
  today: CivilDate,
): { readonly input: RentalInput } | { readonly errors: readonly FieldError[] } {
  const r = read(form);
  if (r.errors.length > 0) return { errors: r.errors };
  const errors = engineErrors(r, today);
  if (errors.length > 0) return { errors };
  return { input: complete(r.partial) };
}

// The list a row field belongs to, for focusing the right sheet.
export const listOfField = (field: string): RowList | null => parseRowField(field)?.list ?? null;
