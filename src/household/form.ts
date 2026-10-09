import { addDays, parseDate, type CivilDate } from '../engine/date';
import type {
  DesistimientoCause,
  HouseholdInput,
  HouseholdRegime,
  HouseholdTermination,
} from '../engine/household/types';
import { validate, type HouseholdField as EngineField } from '../engine/household/validate';
import type { Accrual } from '../engine/types';
import { parseAmount } from '../calculator/number';
import type { HouseholdEnding, HouseholdField } from './ports';

// The ending comes before the pay, so the last sheet, the one that asks to review, is always asked.
export const SHEETS = [
  'trabajo',
  'fechas',
  'desistimiento',
  'escrito',
  'indemnizacion',
  'preaviso',
  'noche',
  'sueldo',
  'pagas',
  'pagas-cuando',
  'jornada',
  'descansos',
  'vacaciones',
] as const;
export type Sheet = (typeof SHEETS)[number];

export const WORKS = ['hourly_external', 'monthly', 'live_in'] as const;
export type Work = (typeof WORKS)[number];
export const ENDINGS = [
  'working',
  'desistimiento',
  'et_cause',
  'unknown',
] as const satisfies readonly HouseholdEnding[];
export type Ending = (typeof ENDINGS)[number];
export const CAUSES: readonly DesistimientoCause[] = [
  'income_drop_or_expense_rise',
  'family_needs_change',
  'loss_of_trust',
  'other',
  'none',
];
export const ACCRUALS: readonly Accrual[] = ['semiannual', 'annual', 'unknown'];

// The hour a «sí» or a «no» on the night notice stands for: the engine reads a time of day, the
// form asks only whether it fell between 17:00 and 08:00, so no typed time ever exists.
export const NIGHT_TIME = '22:00';
export const DAY_TIME = '12:00';

export type FieldErrorCode =
  | 'invalid_date'
  | 'too_far_ahead'
  | 'before_start'
  | 'after_end'
  | 'amount_range'
  | 'hours_range'
  | 'count_range'
  | 'invalid_time'
  | 'year_range'
  | 'regime_mismatch'
  | 'notice_before_start'
  | 'missing_value'
  | 'missing_choice'
  | 'invalid_amount'
  | 'invalid_number';

// The UI words `code` through `client.household.error.<code>`.
export interface FieldError {
  readonly field: string;
  readonly code: FieldErrorCode;
}

// The questions each sheet asks.
export const SHEET_FIELDS: Record<Sheet, readonly HouseholdField[]> = {
  trabajo: ['work', 'startDate'],
  fechas: ['ending', 'endDate'],
  sueldo: ['monthlyPay', 'hourlyRate', 'monthlyAverage', 'inKind'],
  pagas: ['extraCount', 'extraProrated', 'extraAmount'],
  'pagas-cuando': ['extraAccrual'],
  jornada: ['weeklyHours', 'weeklyRest'],
  descansos: ['shortestRest', 'restMadeUp'],
  vacaciones: ['holidayDays', 'holidayStretch', 'holidayTaken'],
  desistimiento: ['cause'],
  escrito: ['inWriting'],
  indemnizacion: ['severanceAvailable', 'severanceOffered'],
  preaviso: ['noticeDays', 'substitutePaid'],
  noche: ['nightNotice', 'seriousBreach'],
};

export const sheetOfField = (field: string): Sheet =>
  SHEETS.find((s) => (SHEET_FIELDS[s] as readonly string[]).includes(field)) ?? 'trabajo';

// Where the engine's field sits in the form.
const FORM_FIELD: Record<EngineField, HouseholdField> = {
  startDate: 'startDate',
  payYear: 'endDate',
  weeklyHours: 'weeklyHours',
  monthlyCash: 'monthlyPay',
  inKindMonthly: 'inKind',
  'extraPays.count': 'extraCount',
  'extraPays.amount': 'extraAmount',
  hourlyRate: 'hourlyRate',
  shortestRestHours: 'shortestRest',
  weeklyRestHours: 'weeklyRest',
  'holidays.days': 'holidayDays',
  'holidays.longestStretch': 'holidayStretch',
  'holidays.taken': 'holidayTaken',
  'termination.noticeGivenOn': 'noticeDays',
  'termination.effectiveOn': 'endDate',
  'termination.noticeTime': 'nightNotice',
  'termination.severanceOffered': 'severanceOffered',
  'termination.substitutePaid': 'substitutePaid',
};

// Bounds on what a person can type, not legal limits: the engine's own are the ones that count.
const MAX_AMOUNT = 1_000_000;
const MAX_DAYS = 366;
const HOURS_IN_WEEK = 168;

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

interface Reading {
  readonly input: HouseholdInput;
  readonly errors: FieldError[];
  // The questions read cleanly: an engine error is only shown on one of them.
  readonly read: ReadonlySet<string>;
}

const pick = <T extends string>(value: string | null, options: readonly T[]): T | null =>
  value !== null && (options as readonly string[]).includes(value) ? (value as T) : null;

const triState = (value: string | null): boolean | null | undefined =>
  value === 'yes' ? true : value === 'no' ? false : value === 'unknown' ? null : undefined;

// FormData leaves out disabled controls, so a question that does not apply never reaches the engine.
function read(form: HTMLFormElement, today: CivilDate): Reading {
  const data = new FormData(form);
  const errors: FieldError[] = [];
  const done = new Set<string>();
  const text = (field: string): string | null => {
    const v = data.get(field);
    return typeof v === 'string' ? v : null;
  };
  const asked = (field: string) => form.querySelector(`[name="${field}"]:not(:disabled)`) !== null;
  const fail = (field: string, code: FieldErrorCode) => errors.push({ field, code });
  const ok = <T>(field: string, value: T): T => {
    done.add(field);
    return value;
  };

  const choice = <T extends string>(field: string, options: readonly T[]): T | null => {
    const v = pick(text(field), options);
    if (v === null) fail(field, 'missing_choice');
    else done.add(field);
    return v;
  };
  const date = (field: string, required: boolean): CivilDate | null => {
    const t = text(field)?.trim() ?? '';
    if (t === '') {
      if (required) fail(field, 'missing_value');
      return null;
    }
    try {
      return ok(field, parseDate(t));
    } catch {
      fail(field, 'invalid_date');
      return null;
    }
  };
  const figure = (field: string, required: boolean): number | null => {
    const n = parseAmount(text(field) ?? '');
    if (n === null) {
      if (required) fail(field, 'missing_value');
      return null;
    }
    if (Number.isNaN(n)) fail(field, 'invalid_amount');
    else if (n < 0 || n > MAX_AMOUNT) fail(field, 'amount_range');
    else return ok(field, n);
    return null;
  };
  const hours = (field: string): number | null => {
    const n = parseAmount(text(field) ?? '');
    if (n === null) return null;
    if (Number.isNaN(n) || n < 0 || n > HOURS_IN_WEEK) fail(field, 'hours_range');
    else return ok(field, n);
    return null;
  };
  const whole = (field: string, required: boolean): number | null => {
    const n = parseAmount(text(field) ?? '');
    if (n === null) {
      if (required) fail(field, 'missing_value');
      return null;
    }
    if (Number.isNaN(n) || !Number.isInteger(n)) fail(field, 'invalid_number');
    else if (n < 0 || n > MAX_DAYS) fail(field, 'count_range');
    else return ok(field, n);
    return null;
  };
  const answer = (field: string): boolean | null | undefined => {
    const v = triState(text(field));
    if (v === undefined) fail(field, 'missing_choice');
    else done.add(field);
    return v;
  };

  const input: Mutable<HouseholdInput> = {
    startDate: { y: 2020, m: 1, d: 1 },
    payYear: today.y,
    liveIn: false,
    regime: 'monthly',
    weeklyHours: null,
    monthlyCash: null,
    inKindMonthly: null,
    extraPays: null,
    hourlyRate: null,
    shortestRestHours: null,
    restMadeUpWithinFourWeeks: null,
    weeklyRestHours: null,
    holidays: null,
    termination: null,
  };

  const work = choice('work', WORKS);
  if (work !== null) {
    input.liveIn = work === 'live_in';
    input.regime = (
      work === 'hourly_external' ? 'hourly_external' : 'monthly'
    ) satisfies HouseholdRegime;
  }
  const start = date('startDate', true);
  if (start) input.startDate = start;

  const ending = choice('ending', ENDINGS);
  const end = asked('endDate') ? date('endDate', true) : null;
  if (end) input.payYear = end.y;

  if (asked('monthlyPay')) input.monthlyCash = figure('monthlyPay', true);
  if (asked('hourlyRate')) input.hourlyRate = figure('hourlyRate', true);
  if (asked('monthlyAverage')) input.monthlyCash = figure('monthlyAverage', false);
  if (asked('inKind')) input.inKindMonthly = figure('inKind', false);

  // An external worker's hourly price includes the extra payments: the sheet is not asked.
  if (input.regime === 'monthly' && asked('extraCount')) {
    const count = whole('extraCount', true);
    if (count !== null && count > 0) {
      const prorated = answer('extraProrated');
      const apart = prorated === false;
      const amount = asked('extraAmount') ? figure('extraAmount', false) : null;
      const accrual = apart && asked('extraAccrual') ? choice('extraAccrual', ACCRUALS) : null;
      if (typeof prorated === 'boolean')
        input.extraPays = {
          count,
          amount,
          prorated,
          accrual: apart ? (accrual ?? 'unknown') : 'semiannual',
        };
    } else if (count === 0) {
      input.extraPays = { count: 0, amount: null, prorated: false, accrual: 'semiannual' };
    }
  }

  input.weeklyHours = hours('weeklyHours');
  input.shortestRestHours = hours('shortestRest');
  input.weeklyRestHours = hours('weeklyRest');
  // Only a shorter rest needs it made up, so leaving it unanswered is not an error.
  if (asked('restMadeUp')) {
    const v = triState(text('restMadeUp'));
    if (v !== undefined) input.restMadeUpWithinFourWeeks = v;
    done.add('restMadeUp');
  }

  // Every figure on the sheet may stay blank, but the others only read against the year's days.
  const stretch = whole('holidayStretch', false);
  const taken = asked('holidayTaken') ? whole('holidayTaken', false) : null;
  const days = whole('holidayDays', stretch !== null || taken !== null);
  if (days !== null) input.holidays = { days, longestStretch: stretch, taken };

  if (end && (ending === 'desistimiento' || ending === 'et_cause')) {
    const termination: Mutable<HouseholdTermination> = {
      route: ending,
      noticeGivenOn: null,
      effectiveOn: end,
      noticeTime: null,
      inWriting: null,
      cause: null,
      severanceAvailable: null,
      severanceOffered: null,
      substitutePaid: null,
      seriousBreachAlleged: null,
    };
    if (ending === 'desistimiento') {
      if (asked('cause')) {
        if (text('cause') === 'unknown') done.add('cause');
        else termination.cause = choice('cause', CAUSES);
      }
      if (asked('inWriting')) {
        const v = answer('inWriting');
        if (v !== undefined) termination.inWriting = v;
      }
      if (asked('severanceAvailable')) {
        const v = answer('severanceAvailable');
        if (v !== undefined) termination.severanceAvailable = v;
      }
      if (asked('severanceOffered'))
        termination.severanceOffered = figure('severanceOffered', false);
      const noticeDays = asked('noticeDays') ? whole('noticeDays', false) : null;
      if (noticeDays !== null) termination.noticeGivenOn = addDays(end, -noticeDays);
      if (asked('substitutePaid')) termination.substitutePaid = figure('substitutePaid', false);
      if (asked('nightNotice')) {
        const v = answer('nightNotice');
        if (v !== undefined) termination.noticeTime = v === null ? null : v ? NIGHT_TIME : DAY_TIME;
      }
      if (asked('seriousBreach')) {
        const v = answer('seriousBreach');
        if (v !== undefined) termination.seriousBreachAlleged = v;
      }
    }
    input.termination = termination;
  }

  return { input, errors, read: done };
}

// Puts an engine error on the field that asked for it.
function engineErrors(r: Reading, today: CivilDate): FieldError[] {
  return validate(r.input, today).flatMap(({ field, code }) => {
    const form = FORM_FIELD[field];
    if (field === 'payYear' || !r.read.has(form)) return [];
    return [
      {
        field: form,
        code:
          field === 'termination.noticeGivenOn' && code === 'before_start'
            ? 'notice_before_start'
            : code,
      },
    ];
  });
}

export function sheetErrors(form: HTMLFormElement, sheet: Sheet, today: CivilDate): FieldError[] {
  const r = read(form, today);
  const fields: readonly string[] = SHEET_FIELDS[sheet];
  const own = r.errors.filter((e) => fields.includes(e.field));
  const withError = new Set(own.map((e) => e.field));
  const fromEngine = engineErrors(r, today).filter(
    (e) => fields.includes(e.field) && !withError.has(e.field),
  );
  return [...own, ...fromEngine];
}

export function readHouseholdForm(
  form: HTMLFormElement,
  today: CivilDate,
): { readonly input: HouseholdInput } | { readonly errors: readonly FieldError[] } {
  const r = read(form, today);
  if (r.errors.length > 0) return { errors: r.errors };
  const errors = engineErrors(r, today);
  if (errors.length > 0) return { errors };
  return { input: r.input };
}

// The last day typed, once it reads: the gate stops a relationship that ended before the reform.
export function endDateOf(form: HTMLFormElement): CivilDate | null {
  const el = form.querySelector<HTMLInputElement>('[name="endDate"]:not(:disabled)');
  try {
    return el && el.value !== '' ? parseDate(el.value) : null;
  } catch {
    return null;
  }
}

// How the relationship stands, once the dates sheet is answered.
export function endingOf(form: HTMLFormElement): HouseholdEnding {
  const v = form.querySelector<HTMLInputElement>('[name="ending"]:checked')?.value ?? null;
  return pick(v, ENDINGS) ?? 'working';
}
