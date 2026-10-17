import type { CivilDate } from '../../engine/date';
import { telecomScope } from '../../engine/bills/scope';
import type {
  ChangeKind,
  ChangeNotice,
  PriceIndex,
  TelecomInput,
  TelecomScope,
} from '../../engine/bills/types';
import {
  validateTelecom,
  type TelecomField,
  type ValidationError,
} from '../../engine/bills/validate';
import { answers, type FieldError } from '../answers';
import type { TelecomFormField } from './ports';

export type { TelecomFormField } from './ports';

// The sheets in order. Step ids are also the URL fragments, so they keep their Spanish names.
export const SHEETS = [
  'permanencia',
  'penalizacion',
  'baja',
  'aviso',
  'cambio',
  'terminal',
  'cobros',
  'despues',
] as const;
export type Sheet = (typeof SHEETS)[number];

// Whether the conditions changed before the exit, and whether a notice said so.
export const CHANGES = ['none', 'notice', 'no_notice'] as const;
export const CHANGE_KINDS: readonly ChangeKind[] = ['price_up', 'service_worse', 'other'];
export const PRICE_INDEXES: readonly PriceIndex[] = [
  'ipc',
  'ipc_plus',
  'fixed_amount',
  'none',
  'other',
];
const YES_NO = ['yes', 'no'] as const;

export const SHEET_FIELDS: Readonly<Record<Sheet, readonly TelecomFormField[]>> = {
  permanencia: ['hasCommitment', 'startedOn', 'months'],
  penalizacion: ['agreedPenalty'],
  baja: ['exitRequestedOn'],
  aviso: ['change', 'sentOn', 'appliesOn'],
  cambio: ['changeKind', 'priceIndex'],
  terminal: ['hasHandset', 'handsetValue', 'handsetKept'],
  cobros: ['penaltyCharged'],
  despues: ['chargedAfter', 'lineFrom', 'lineTo', 'lineAmount'],
};

export const sheetOfField = (field: TelecomFormField): Sheet =>
  SHEETS.find((s) => SHEET_FIELDS[s].includes(field)) ?? 'permanencia';

type TelecomFieldError = FieldError<TelecomFormField>;

// Where each of the engine's fields is asked.
const FIELD_OF: Readonly<Record<TelecomField, TelecomFormField>> = {
  'commitment.startedOn': 'startedOn',
  'commitment.months': 'months',
  'commitment.agreedPenalty': 'agreedPenalty',
  exitRequestedOn: 'exitRequestedOn',
  penaltyCharged: 'penaltyCharged',
  'handset.value': 'handsetValue',
  'changeNotice.sentOn': 'sentOn',
  'changeNotice.appliesOn': 'appliesOn',
  lines: 'lineAmount',
};

export const onQuestions = (
  errors: readonly ValidationError<TelecomField>[],
): TelecomFieldError[] => errors.map(({ field, code }) => ({ field: FIELD_OF[field], code }));

interface Reading {
  readonly errors: TelecomFieldError[];
  readonly exitRequestedOn: CivilDate | null;
  // Null while an answer the input needs is missing or unreadable.
  readonly input: TelecomInput | null;
}

function read(form: HTMLFormElement): Reading {
  const { errors, choice, figure, date } = answers<TelecomFormField>(form);

  const hasCommitment = choice('hasCommitment', YES_NO);
  const startedOn = hasCommitment === 'yes' ? date('startedOn', true) : null;
  const months = hasCommitment === 'yes' ? figure('months', true) : null;
  const agreedPenalty = hasCommitment === 'yes' ? figure('agreedPenalty', false) : null;
  const exitRequestedOn = date('exitRequestedOn', true);

  const change = choice('change', CHANGES);
  const changed = change === 'notice' || change === 'no_notice';
  const sentOn = change === 'notice' ? date('sentOn', true) : null;
  const appliesOn = change === 'notice' ? date('appliesOn', false) : null;
  const changeKind = changed ? choice('changeKind', CHANGE_KINDS) : null;
  const priceIndex =
    changed && changeKind === 'price_up' ? choice('priceIndex', PRICE_INDEXES) : 'none';

  const hasHandset = changed ? choice('hasHandset', YES_NO) : null;
  const handsetValue = hasHandset === 'yes' ? figure('handsetValue', true) : null;
  const handsetKept = hasHandset === 'yes' ? choice('handsetKept', YES_NO) : null;
  const penaltyCharged = figure('penaltyCharged', true);

  const chargedAfter = choice('chargedAfter', YES_NO);
  const lineFrom = chargedAfter === 'yes' ? date('lineFrom', true) : null;
  const lineTo = chargedAfter === 'yes' ? date('lineTo', true) : null;
  const lineAmount = chargedAfter === 'yes' ? figure('lineAmount', true) : null;

  if (errors.length > 0 || exitRequestedOn === null)
    return { errors, exitRequestedOn, input: null };
  const changeNotice: ChangeNotice | null =
    changed && changeKind !== null && priceIndex !== null
      ? { sentOn, appliesOn, change: changeKind, index: priceIndex }
      : null;
  const input: TelecomInput = {
    commitment: startedOn === null || months === null ? null : { startedOn, months, agreedPenalty },
    exitRequestedOn,
    penaltyCharged,
    handset:
      handsetValue === null || handsetKept === null
        ? null
        : { value: handsetValue, kept: handsetKept === 'yes' },
    changeNotice,
    lines:
      lineFrom === null || lineTo === null || lineAmount === null
        ? []
        : [{ from: lineFrom, to: lineTo, amount: lineAmount }],
  };
  return { errors, exitRequestedOn, input };
}

const engineErrors = (input: TelecomInput, today: CivilDate): TelecomFieldError[] =>
  onQuestions(validateTelecom(input, today));

// The reach of the review once the exit date reads; until then the visit goes on.
export function formScope(form: HTMLFormElement): TelecomScope {
  const { exitRequestedOn } = read(form);
  return exitRequestedOn === null ? { inScope: true } : telecomScope({ exitRequestedOn });
}

export function sheetErrors(
  form: HTMLFormElement,
  sheet: Sheet,
  today: CivilDate,
): TelecomFieldError[] {
  const r = read(form);
  const fields: readonly TelecomFormField[] = SHEET_FIELDS[sheet];
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

export function readTelecomForm(
  form: HTMLFormElement,
  today: CivilDate,
): { readonly input: TelecomInput } | { readonly errors: readonly TelecomFieldError[] } {
  const r = read(form);
  if (r.errors.length > 0) return { errors: r.errors };
  if (r.input === null) return { errors: [{ field: 'exitRequestedOn', code: 'missing_value' }] };
  const errors = engineErrors(r.input, today);
  return errors.length > 0 ? { errors } : { input: r.input };
}
