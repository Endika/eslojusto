import { toIso, type CivilDate } from '../../engine/date';
import type { PriceUnit, RenewalInput, RenewalPrices } from '../../engine/bills/renewal-types';
import {
  validateRenewal,
  type RenewalField,
  type ValidationError,
} from '../../engine/bills/validate';
import { answers, type FieldError } from '../answers';
import type { RenewalFormField } from './ports';

export type { RenewalFormField } from './ports';

// The sheets in order. Step ids are also the URL fragments, so they keep their Spanish names.
export const SHEETS = [
  'fechas',
  'potencia',
  'potencia-actual',
  'potencia-nueva',
  'energia',
  'energia-actual',
  'energia-nueva',
  'consumo',
  'carta',
  'contrato',
  'envio',
] as const;
export type Sheet = (typeof SHEETS)[number];

export const POWER_UNITS: readonly PriceUnit[] = ['per_kw_day', 'per_kw_year'];
export const ENERGY_PRICINGS = ['single', 'periods'] as const;
export const KNOWNS = ['yes', 'no', 'unknown'] as const;

export const SHEET_FIELDS: Readonly<Record<Sheet, readonly RenewalFormField[]>> = {
  fechas: ['letterDate', 'renewalDate'],
  potencia: ['powerKwP1', 'powerKwP2', 'powerUnit'],
  'potencia-actual': ['currentPowerP1', 'currentPowerP2'],
  'potencia-nueva': ['nextPowerP1', 'nextPowerP2'],
  energia: ['energyPricing'],
  'energia-actual': ['currentEnergy', 'currentEnergyP1', 'currentEnergyP2', 'currentEnergyP3'],
  'energia-nueva': ['nextEnergy', 'nextEnergyP1', 'nextEnergyP2', 'nextEnergyP3'],
  consumo: ['annualKwh'],
  carta: ['declaredWithoutTax', 'declaredWithTax'],
  contrato: ['fixedPrice', 'firstRenewal'],
  envio: ['separateFromBill'],
};

export const sheetOfField = (field: RenewalFormField): Sheet =>
  SHEETS.find((s) => SHEET_FIELDS[s].includes(field)) ?? 'fechas';

type RenewalFieldError = FieldError<RenewalFormField>;

// Where each of the engine's fields is asked.
const FIELD_OF: Readonly<Record<RenewalField, RenewalFormField>> = {
  letterDate: 'letterDate',
  renewalDate: 'renewalDate',
  'powerKw.p1': 'powerKwP1',
  'powerKw.p2': 'powerKwP2',
  'current.power.p1': 'currentPowerP1',
  'current.power.p2': 'currentPowerP2',
  'next.power.p1': 'nextPowerP1',
  'next.power.p2': 'nextPowerP2',
  'current.energy.all': 'currentEnergy',
  'current.energy.p1': 'currentEnergyP1',
  'current.energy.p2': 'currentEnergyP2',
  'current.energy.p3': 'currentEnergyP3',
  'next.energy.all': 'nextEnergy',
  'next.energy.p1': 'nextEnergyP1',
  'next.energy.p2': 'nextEnergyP2',
  'next.energy.p3': 'nextEnergyP3',
  annualKwh: 'annualKwh',
  'declared.withoutTax': 'declaredWithoutTax',
  'declared.withTax': 'declaredWithTax',
};

export const onQuestions = (
  errors: readonly ValidationError<RenewalField>[],
): RenewalFieldError[] => errors.map(({ field, code }) => ({ field: FIELD_OF[field], code }));

const known = (v: (typeof KNOWNS)[number] | null): boolean | null | undefined =>
  v === 'yes' ? true : v === 'no' ? false : v === 'unknown' ? null : undefined;

interface Reading {
  readonly errors: RenewalFieldError[];
  // Null while an answer the input needs is missing or unreadable.
  readonly input: RenewalInput | null;
}

function read(form: HTMLFormElement): Reading {
  const { errors, choice, figure, date } = answers<RenewalFormField>(form);

  const letterDate = date('letterDate', true);
  const renewalDate = date('renewalDate', true);
  const powerKw = { p1: figure('powerKwP1', true, true), p2: figure('powerKwP2', true, true) };
  const powerUnit = choice('powerUnit', POWER_UNITS);
  const power = (side: 'current' | 'next') => ({
    p1: figure(`${side}PowerP1`, true, true),
    p2: figure(`${side}PowerP2`, true, true),
  });
  const [currentPower, nextPower] = [power('current'), power('next')];
  const pricing = choice('energyPricing', ENERGY_PRICINGS);
  const energy = (side: 'current' | 'next') =>
    pricing === 'single'
      ? { all: figure(side === 'current' ? 'currentEnergy' : 'nextEnergy', true, true) }
      : pricing === 'periods'
        ? {
            p1: figure(`${side}EnergyP1`, true, true),
            p2: figure(`${side}EnergyP2`, true, true),
            p3: figure(`${side}EnergyP3`, true, true),
          }
        : null;
  const [currentEnergy, nextEnergy] = [energy('current'), energy('next')];
  const annualKwh = figure('annualKwh', false);
  const declared = {
    withoutTax: figure('declaredWithoutTax', false),
    withTax: figure('declaredWithTax', false),
  };
  const fixed = known(choice('fixedPrice', KNOWNS));
  const firstRenewal = fixed === true ? (known(choice('firstRenewal', KNOWNS)) ?? null) : null;
  const separate = known(choice('separateFromBill', KNOWNS));

  const numbers = (o: object | null): o is Record<string, number> =>
    o !== null && Object.values(o).every((v) => v !== null);
  if (
    errors.length > 0 ||
    letterDate === null ||
    renewalDate === null ||
    powerUnit === null ||
    currentEnergy === null ||
    nextEnergy === null ||
    !numbers(powerKw) ||
    !numbers(currentPower) ||
    !numbers(nextPower) ||
    !numbers(currentEnergy) ||
    !numbers(nextEnergy) ||
    fixed === undefined ||
    separate === undefined
  )
    return { errors, input: null };
  const prices = (power: { p1: number; p2: number }, e: Record<string, number>): RenewalPrices => ({
    power,
    energy:
      'all' in e
        ? { all: e['all'] ?? 0 }
        : { p1: e['p1'] ?? 0, p2: e['p2'] ?? 0, p3: e['p3'] ?? 0 },
  });
  return {
    errors,
    input: {
      letterDate: toIso(letterDate),
      renewalDate: toIso(renewalDate),
      powerKw: { p1: powerKw.p1 ?? 0, p2: powerKw.p2 ?? 0 },
      powerUnit,
      current: prices({ p1: currentPower.p1 ?? 0, p2: currentPower.p2 ?? 0 }, currentEnergy),
      next: prices({ p1: nextPower.p1 ?? 0, p2: nextPower.p2 ?? 0 }, nextEnergy),
      annualKwh,
      declared,
      fixedPrice: fixed,
      firstRenewal,
      separateFromBill: separate,
    },
  };
}

const engineErrors = (input: RenewalInput, today: CivilDate): RenewalFieldError[] =>
  onQuestions(validateRenewal(input, today));

export function sheetErrors(
  form: HTMLFormElement,
  sheet: Sheet,
  today: CivilDate,
): RenewalFieldError[] {
  const r = read(form);
  const fields: readonly RenewalFormField[] = SHEET_FIELDS[sheet];
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

export function readRenewalForm(
  form: HTMLFormElement,
  today: CivilDate,
): { readonly input: RenewalInput } | { readonly errors: readonly RenewalFieldError[] } {
  const r = read(form);
  if (r.errors.length > 0) return { errors: r.errors };
  if (r.input === null) return { errors: [{ field: 'letterDate', code: 'missing_value' }] };
  const errors = engineErrors(r.input, today);
  return errors.length > 0 ? { errors } : { input: r.input };
}
