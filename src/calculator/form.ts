import { parseDate, type CivilDate } from '../engine/date';
import type { Children } from '../engine/unemployment';
import type { EmployerFigures } from '../engine/review';
import type {
  Cause,
  Accrual,
  HolidayUnit,
  FinalPayInput,
  OtherContracts,
  ItemId,
  ContributionPeriod,
  FixedTermType,
} from '../engine/types';
import {
  validate,
  validateOtherContracts,
  type InputErrorCode,
  type OtherContractErrorCode,
} from '../engine/validate';
import { parseAmount } from './number';

// Fields the form itself requires before the engine sees them.
const REQUIRED_FIELDS = [
  'cause',
  'fixedTermType',
  'startDate',
  'endDate',
  'monthlySalary',
  'extraPayProrated',
  'extraPayCount',
  'extraPayAmount',
  'annualHolidayDays',
  'holidayDaysTaken',
] as const;
type RequiredField = (typeof REQUIRED_FIELDS)[number];

export type FieldErrorCode =
  | InputErrorCode
  | OtherContractErrorCode
  | 'missing_children'
  | 'missing_benefitDrawnSince'
  | `missing_${RequiredField}`
  | 'missing_value'
  | 'invalid_date'
  | 'invalid_amount';

// The UI translates `code` through the dictionary key `client.error.<code>`.
export interface FieldError {
  readonly field: string;
  readonly code: FieldErrorCode;
}

export const SHEETS = [
  'causa',
  'temporal',
  'fechas',
  'prorrateo',
  'salario',
  'pagas',
  'vacaciones',
  'hijos',
  'otros',
  'finiquito',
] as const;
export type Sheet = (typeof SHEETS)[number];

export const ITEM_IDS: readonly ItemId[] = [
  'pending_salary',
  'holiday_pay',
  'extra_pay',
  'severance',
  'employer_notice',
  'notice_deduction',
];

export const figureField = (id: ItemId) => `figure_${id}`;

export const SHEET_FIELDS: Record<Sheet, readonly string[]> = {
  causa: ['cause'],
  temporal: ['fixedTermType'],
  fechas: ['startDate', 'endDate'],
  prorrateo: ['extraPayProrated'],
  salario: ['monthlySalary'],
  pagas: ['extraPayCount', 'extraPayAmount', 'extraPayAccrual'],
  vacaciones: [
    'holidayUnit',
    'annualHolidayDays',
    'holidayDaysTaken',
    'noticeDaysReceived',
    'agreementNoticeDays',
    'noticeDaysGiven',
  ],
  hijos: ['children'],
  otros: ['otherContracts', 'benefitDrawnSince'],
  finiquito: ITEM_IDS.map(figureField),
};

// A row field such as «otherContracts.0.startDate» belongs to its list, «otherContracts».
export const baseField = (field: string): string => field.split('.')[0] ?? field;

export const sheetOfField = (field: string): Sheet =>
  SHEETS.find((h) => SHEET_FIELDS[h].includes(baseField(field))) ?? 'causa';

// The unemployment benefit sheets only apply when the cause can give a right to the benefit.
export const asksAboutBenefit = (cause: string | null): boolean =>
  !!cause && cause !== 'resignation';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

const DEFAULTS: FinalPayInput = {
  cause: 'unfair_dismissal',
  startDate: { y: 2000, m: 1, d: 1 },
  endDate: { y: 2000, m: 12, d: 31 },
  monthlySalary: 1000,
  extraPayProrated: true,
  extraPayCount: 2,
  extraPayAmount: 0,
  extraPayAccrual: 'unknown',
  holidayUnit: 'working',
  annualHolidayDays: 22,
  holidayDaysTaken: null,
};

interface Reading {
  readonly partial: Partial<Mutable<FinalPayInput>>;
  readonly figures: EmployerFigures;
  readonly errors: FieldError[];
}

// FormData leaves out disabled controls, so a field that does not apply never reaches the engine.
function read(form: HTMLFormElement): Reading {
  const data = new FormData(form);
  const partial: Partial<Mutable<FinalPayInput>> = {};
  const figures: Mutable<EmployerFigures> = {};
  const errors: FieldError[] = [];
  const text = (field: string): string | null => {
    const v = data.get(field);
    return typeof v === 'string' ? v : null;
  };
  const present = (field: string) => data.has(field);
  const missing = (field: string) =>
    errors.push({
      field,
      code: (REQUIRED_FIELDS as readonly string[]).includes(field)
        ? (`missing_${field}` as FieldErrorCode)
        : 'missing_value',
    });

  const cause = text('cause');
  if (cause) partial.cause = cause as Cause;
  else missing('cause');

  if (present('fixedTermType') || partial.cause === 'fixed_term_end') {
    const t = text('fixedTermType');
    if (t) partial.fixedTermType = t as FixedTermType;
    else missing('fixedTermType');
  }

  for (const field of ['startDate', 'endDate'] as const) {
    const t = text(field)?.trim() ?? '';
    if (t === '') {
      missing(field);
      continue;
    }
    let f: CivilDate;
    try {
      f = parseDate(t);
    } catch {
      errors.push({ field, code: 'invalid_date' });
      continue;
    }
    partial[field] = f;
  }

  const prorating = text('extraPayProrated');
  if (prorating === 'yes' || prorating === 'no') partial.extraPayProrated = prorating === 'yes';
  else missing('extraPayProrated');

  const unit = text('holidayUnit');
  if (unit === 'working' || unit === 'calendar') partial.holidayUnit = unit satisfies HolidayUnit;
  else missing('holidayUnit');

  // «No lo sé» disables the number, so the engine gets null and marks the item as not checkable.
  const holidaysUnknown = text('holidayDaysTakenUnknown') === 'yes';
  if (holidaysUnknown) partial.holidayDaysTaken = null;

  const accrual = text('extraPayAccrual');
  if (accrual) partial.extraPayAccrual = accrual as Accrual;

  const numericFields = [
    ['monthlySalary', true],
    ['extraPayCount', true],
    ['extraPayAmount', true],
    ['annualHolidayDays', true],
    ['holidayDaysTaken', true],
    ['noticeDaysReceived', false],
    ['agreementNoticeDays', false],
    ['noticeDaysGiven', false],
  ] as const;
  for (const [field, required] of numericFields) {
    const t = text(field);
    if (t === null) continue;
    const n = parseAmount(t);
    if (n === null) {
      const isRequired = field === 'extraPayAmount' ? partial.extraPayCount !== 0 : required;
      if (isRequired) missing(field);
    } else if (Number.isNaN(n)) errors.push({ field, code: 'invalid_amount' });
    else partial[field] = n;
  }

  for (const id of ITEM_IDS) {
    const t = text(figureField(id));
    if (t === null) continue;
    const n = parseAmount(t);
    if (n === null) continue;
    if (Number.isNaN(n)) errors.push({ field: figureField(id), code: 'invalid_amount' });
    else figures[id] = n;
  }

  return { partial, figures, errors };
}

function complete(partial: Partial<FinalPayInput>): FinalPayInput {
  const e: Mutable<FinalPayInput> = { ...DEFAULTS, ...partial };
  if (e.extraPayProrated) e.extraPayAmount = 0;
  return e;
}

export const provisionalInput = (form: HTMLFormElement): FinalPayInput =>
  complete(read(form).partial);

export function readForm(
  form: HTMLFormElement,
): { input: FinalPayInput; figures: EmployerFigures } | { errors: FieldError[] } {
  const { partial, figures, errors } = read(form);
  if (errors.length > 0) return { errors };
  return { input: complete(partial), figures };
}

export interface BenefitAnswers {
  readonly children: Children;
  readonly others: OtherContracts;
}

const CHILDREN_ANSWERS: Record<string, Children> = { '0': 0, '1': 1, '2': 2, not_said: null };

// The two benefit sheets. Rows count only when «Sí, añadir fechas» is chosen; their dates never
// leave this page.
function readBenefitAnswers(form: HTMLFormElement): { data: BenefitAnswers; errors: FieldError[] } {
  const data = new FormData(form);
  const text = (field: string): string | null => {
    const v = data.get(field);
    return typeof v === 'string' ? v : null;
  };
  const errors: FieldError[] = [];

  const h = text('children');
  const children = h !== null && h in CHILDREN_ANSWERS ? (CHILDREN_ANSWERS[h] ?? null) : null;
  if (h === null || !(h in CHILDREN_ANSWERS))
    errors.push({ field: 'children', code: 'missing_children' });

  const contracts: ContributionPeriod[] = [];
  let benefitDrawnSince: boolean | null = null;
  if (text('otherContracts') === 'yes') {
    // The question sits above the rows, so its error comes first.
    const p = text('benefitDrawnSince');
    if (p === 'yes' || p === 'no') benefitDrawnSince = p === 'yes';
    else if (p !== 'unknown')
      errors.push({ field: 'benefitDrawnSince', code: 'missing_benefitDrawnSince' });

    // Each parsed row keeps the index it has on screen, so an engine error lands on its row.
    const rows: number[] = [];
    const rowErrors: FieldError[] = [];
    for (const row of form.querySelectorAll<HTMLElement>('[data-other-contract]')) {
      const i = Number(row.dataset['otherContract']);
      const dates: Partial<Record<keyof ContributionPeriod, CivilDate>> = {};
      for (const key of ['startDate', 'endDate'] as const) {
        const field = `otherContracts.${i}.${key}`;
        const t = text(field)?.trim() ?? '';
        if (t === '') {
          rowErrors.push({ field, code: 'missing_value' });
          continue;
        }
        try {
          dates[key] = parseDate(t);
        } catch {
          rowErrors.push({ field, code: 'invalid_date' });
        }
      }
      if (dates.startDate && dates.endDate) {
        contracts.push({ startDate: dates.startDate, endDate: dates.endDate });
        rows.push(i);
      }
    }
    const e = complete(read(form).partial);
    for (const { row, field, code } of validateOtherContracts(e, contracts)) {
      const i = rows[row] ?? row;
      rowErrors.push({ field: field.replace(/^otherContracts\.\d+/, `otherContracts.${i}`), code });
    }
    // Screen order: row by row, the start date before the end date.
    const screenOrder = (c: string) => {
      const [, row = '0', key = ''] = c.split('.');
      return Number(row) * 2 + (key === 'endDate' ? 1 : 0);
    };
    errors.push(...rowErrors.sort((a, b) => screenOrder(a.field) - screenOrder(b.field)));
  }
  return { data: { children, others: { contracts, benefitDrawnSince } }, errors };
}

// For the result: null when the cause gives no benefit, so its sheets were never asked.
export function readBenefitSheets(
  form: HTMLFormElement,
): { data: BenefitAnswers | null } | { errors: FieldError[] } {
  if (!asksAboutBenefit(new FormData(form).get('cause') as string | null)) return { data: null };
  const { data, errors } = readBenefitAnswers(form);
  return errors.length > 0 ? { errors } : { data };
}

export function sheetErrors(form: HTMLFormElement, sheet: Sheet, today: CivilDate): FieldError[] {
  if (sheet === 'hijos' || sheet === 'otros') {
    const fields = SHEET_FIELDS[sheet];
    return readBenefitAnswers(form).errors.filter((e) => fields.includes(baseField(e.field)));
  }
  const { partial, errors } = read(form);
  const fields = SHEET_FIELDS[sheet];
  const own = errors.filter((e) => fields.includes(e.field));
  const withError = new Set(own.map((e) => e.field));
  const fromEngine = validate(complete(partial), today)
    .filter((e) => fields.includes(e.field) && !withError.has(e.field) && e.field in partial)
    .map(({ field, code }) => ({ field, code }));
  return [...own, ...fromEngine];
}
