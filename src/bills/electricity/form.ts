import type { CivilDate } from '../../engine/date';
import { electricityScope } from '../../engine/bills/scope';
import type {
  ElectricityBillInput,
  ElectricityScope,
  EnergyLine,
  EnergyLinePeriod,
  EnergyPeriod,
  PowerLine,
  PowerPeriod,
  PowerPriceUnit,
  Service,
  ServiceLabel,
  SelfConsumption,
  SocialBonusCategory,
  Phase,
} from '../../engine/bills/types';
import {
  validateElectricity,
  type ElectricityField,
  type ValidationError,
} from '../../engine/bills/validate';
import { answers, type FieldError } from '../answers';
import type { ElectricityFormField } from './ports';

export type { ElectricityFormField } from './ports';

// The sheets in order. Step ids are also the URL fragments, so they keep their Spanish names.
export const SHEETS = [
  'suministro',
  'autoconsumo',
  'potencia-contratada',
  'fechas',
  'lecturas',
  'mercado',
  'titular',
  'potencia',
  'potencia-punta',
  'potencia-valle',
  'potencia-maxima',
  'energia',
  'energia-punta',
  'energia-llano',
  'energia-valle',
  'peajes',
  'financiacion',
  'bono-social',
  'bono-social-consumo',
  'contador',
  'contador-tipo',
  'servicios',
  'servicio-1',
  'servicio-2',
  'exceso',
  'penalizacion',
  'penalizacion-contrato',
  'ajustes',
  'impuesto-electrico',
  'iva',
  'total',
] as const;
export type Sheet = (typeof SHEETS)[number];

export const ACCESS_TARIFFS = ['2.0TD', 'other'] as const;
export const SELF_CONSUMPTION: readonly SelfConsumption[] = [
  'none',
  'without_surplus',
  'with_surplus',
];
export const MARKETS = ['pvpc', 'free'] as const;
export const RETAILERS = ['reference', 'other', 'unknown'] as const;
export const HOLDERS = ['person', 'microenterprise', 'other', 'unknown'] as const;
export const POWER_UNITS: readonly PowerPriceUnit[] = ['per_kw_day', 'per_kw_year'];
export const BONUS_CATEGORIES = ['vulnerable', 'severe', 'unknown'] as const;
export const PHASES = ['single', 'three', 'unknown'] as const;
export const SERVICE_COUNTS = ['0', '1', '2'] as const;
export const SERVICE_LABELS: readonly ServiceLabel[] = [
  'maintenance',
  'insurance',
  'pack',
  'other',
];
// Whether the bill splits the energy by period or charges all of it at one price.
export const ENERGY_PRICING = ['periods', 'single'] as const;
export const PRICE_TYPES = ['fixed', 'variable', 'indexed', 'unknown'] as const;
export const REGULARIZATIONS = ['none', 'charged', 'returned'] as const;
const ANSWERS = ['yes', 'no', 'unknown'] as const;
const YES_NO = ['yes', 'no'] as const;

export const POWER_PERIODS: readonly PowerPeriod[] = ['p1', 'p2'];
export const ENERGY_PERIODS: readonly EnergyPeriod[] = ['p1', 'p2', 'p3'];
// The suffix of each period's questions.
const SUFFIX = { p1: 'P1', p2: 'P2', p3: 'P3' } as const;

export const SHEET_FIELDS: Readonly<Record<Sheet, readonly ElectricityFormField[]>> = {
  suministro: ['postcode', 'accessTariff'],
  autoconsumo: ['selfConsumption'],
  'potencia-contratada': ['powerP1', 'powerP2'],
  fechas: ['issuedOn', 'dueOn'],
  lecturas: ['readingFrom', 'readingTo', 'billedDays'],
  mercado: ['market', 'retailer'],
  titular: ['holder'],
  potencia: ['powerUnit', 'priceChange'],
  'potencia-punta': ['powerPriceP1', 'powerAmountP1'],
  'potencia-valle': ['powerPriceP2', 'powerAmountP2'],
  'potencia-maxima': ['maxUsedP1', 'maxUsedP2'],
  energia: ['energyPricing', 'kwhAll', 'energyPriceAll', 'energyAmountAll'],
  'energia-punta': ['kwhP1', 'energyPriceP1', 'energyAmountP1'],
  'energia-llano': ['kwhP2', 'energyPriceP2', 'energyAmountP2'],
  'energia-valle': ['kwhP3', 'energyPriceP3', 'energyAmountP3'],
  peajes: ['tollsShown', 'tollsPower', 'tollsEnergy'],
  financiacion: ['fundingShown', 'funding'],
  'bono-social': ['hasBonus', 'bonusCategory', 'bonusAmount'],
  'bono-social-consumo': ['bonusKwhSoFar', 'bonusDiscountedKwh'],
  contador: ['meterCharged', 'meterAmount'],
  'contador-tipo': ['meterPhase', 'meterOwned'],
  servicios: ['serviceCount'],
  'servicio-1': ['serviceLabel1', 'serviceAmount1', 'serviceRequested1'],
  'servicio-2': ['serviceLabel2', 'serviceAmount2', 'serviceRequested2'],
  exceso: ['hasExcess', 'excessAmount', 'maximeter'],
  penalizacion: ['hasPenalty', 'penaltyAmount'],
  'penalizacion-contrato': ['priceType', 'firstRenewalPassed'],
  ajustes: ['discount', 'regularization', 'regularizationAmount'],
  'impuesto-electrico': ['taxAmount', 'taxPercent'],
  iva: ['vatAmount', 'vatPercent'],
  total: ['total'],
};

export const sheetOfField = (field: ElectricityFormField): Sheet =>
  SHEETS.find((s) => SHEET_FIELDS[s].includes(field)) ?? 'suministro';

type ElectricityFieldError = FieldError<ElectricityFormField>;

// Where each of the engine's fields is asked; a list of lines is asked from its first question.
const FIELD_OF: Readonly<Record<ElectricityField, ElectricityFormField>> = {
  issuedOn: 'issuedOn',
  dueOn: 'dueOn',
  readingFrom: 'readingFrom',
  readingTo: 'readingTo',
  billedDays: 'billedDays',
  postcode: 'postcode',
  contractedPower: 'powerP1',
  maxPowerUsed: 'maxUsedP1',
  power: 'powerPriceP1',
  energy: 'kwhP1',
  discounts: 'discount',
  tollsAndCharges: 'tollsPower',
  socialBonusFunding: 'funding',
  socialBonus: 'bonusAmount',
  excessPower: 'excessAmount',
  electricityTax: 'taxAmount',
  meter: 'meterAmount',
  services: 'serviceAmount1',
  exitPenalty: 'penaltyAmount',
  regularizations: 'regularizationAmount',
  vat: 'vatAmount',
  total: 'total',
};

export const onQuestions = (
  errors: readonly ValidationError<ElectricityField>[],
): ElectricityFieldError[] => errors.map(({ field, code }) => ({ field: FIELD_OF[field], code }));

const triState = (v: 'yes' | 'no' | 'unknown' | null): boolean | null =>
  v === 'yes' ? true : v === 'no' ? false : null;

// The answers that decide the gate, as far as they read: what is missing never stops the visit.
interface GateAnswers {
  readonly postcode: string | null;
  readonly accessTariff: (typeof ACCESS_TARIFFS)[number] | null;
  readonly selfConsumption: SelfConsumption | null;
  readonly power: { readonly p1: number; readonly p2: number } | null;
  readonly issuedOn: CivilDate | null;
}

// A day after every billing rule's start, for a bill whose issue date does not read yet.
const ANY_ISSUE_DAY: CivilDate = { y: 9999, m: 12, d: 31 };

function gateOf(a: GateAnswers): ElectricityScope {
  return electricityScope({
    postcode: a.postcode ?? '',
    accessTariff: a.accessTariff === 'other' ? 'other' : '2.0TD',
    contractedPower: a.power ?? { p1: 0, p2: 0 },
    issuedOn: a.issuedOn ?? ANY_ISSUE_DAY,
    selfConsumption: a.selfConsumption ?? 'none',
  });
}

interface Reading {
  readonly errors: ElectricityFieldError[];
  readonly gate: GateAnswers;
  // Null while an answer the input needs is missing or unreadable.
  readonly input: ElectricityBillInput | null;
}

function read(form: HTMLFormElement): Reading {
  const a = answers<ElectricityFormField>(form);
  const { errors, choice, figure, date, text } = a;
  const answer = (field: ElectricityFormField) => triState(choice(field, ANSWERS));
  const asked = (field: ElectricityFormField) =>
    form.querySelector(`[name="${field}"]:not(:disabled)`) !== null;

  const postcodeText = text('postcode');
  if (postcodeText === '') a.fail('postcode', 'missing_value');
  const accessTariff = choice('accessTariff', ACCESS_TARIFFS);
  const selfConsumption = choice('selfConsumption', SELF_CONSUMPTION);
  const p1 = figure('powerP1', true);
  const p2 = figure('powerP2', true);
  const issuedOn = date('issuedOn', true);
  const gate: GateAnswers = {
    postcode: postcodeText === '' ? null : postcodeText,
    accessTariff,
    selfConsumption,
    power: p1 === null || p2 === null ? null : { p1, p2 },
    issuedOn,
  };

  const dueOn = date('dueOn', true);
  const readingFrom = date('readingFrom', true);
  const readingTo = date('readingTo', true);
  const billedDays = figure('billedDays', false);

  const market = choice('market', MARKETS);
  const retailer = market === 'free' ? 'other' : choice('retailer', RETAILERS);
  const holder = choice('holder', HOLDERS);

  const unit = choice('powerUnit', POWER_UNITS);
  const priceChange = choice('priceChange', YES_NO);
  const powerLines = POWER_PERIODS.map((period): PowerLine | null => {
    const price = figure(`powerPrice${SUFFIX[period]}`, true);
    const amount = figure(`powerAmount${SUFFIX[period]}`, true);
    const kw = period === 'p1' ? p1 : p2;
    if (price === null || amount === null || kw === null || unit === null) return null;
    return { period, kw, price, unit, days: null, amount };
  });
  const maxUsed = { p1: figure('maxUsedP1', false), p2: figure('maxUsedP2', false) };
  const energyPricing = choice('energyPricing', ENERGY_PRICING);
  const energyLine = (
    period: EnergyLinePeriod,
    suffix: 'All' | (typeof SUFFIX)[EnergyPeriod],
  ): EnergyLine | null => {
    const kwh = figure(`kwh${suffix}`, true);
    const price = figure(`energyPrice${suffix}`, true);
    const amount = figure(`energyAmount${suffix}`, true);
    if (kwh === null || price === null || amount === null) return null;
    return { period, kwh, price, amount };
  };
  const energyLines =
    energyPricing === 'single'
      ? [energyLine('all', 'All')]
      : ENERGY_PERIODS.map((period) => energyLine(period, SUFFIX[period]));

  const tollsShown = choice('tollsShown', YES_NO);
  const tolls =
    tollsShown === 'yes'
      ? { power: figure('tollsPower', true), energy: figure('tollsEnergy', true) }
      : null;
  const fundingShown = choice('fundingShown', YES_NO);
  const funding = fundingShown === 'yes' ? figure('funding', true) : null;

  const hasBonus = choice('hasBonus', YES_NO);
  const bonus =
    hasBonus === 'yes'
      ? {
          category: choice('bonusCategory', BONUS_CATEGORIES),
          amount: figure('bonusAmount', true),
          kwhSoFar: asked('bonusKwhSoFar') ? figure('bonusKwhSoFar', false) : null,
          discountedKwh: asked('bonusDiscountedKwh') ? figure('bonusDiscountedKwh', false) : null,
        }
      : null;

  const meterCharged = choice('meterCharged', YES_NO);
  const meter =
    meterCharged === 'yes'
      ? {
          amount: figure('meterAmount', true),
          phase: choice('meterPhase', PHASES),
          owned: answer('meterOwned'),
        }
      : null;

  const serviceCount = Number(choice('serviceCount', SERVICE_COUNTS) ?? 0);
  const services = [1, 2]
    .filter((n) => n <= serviceCount)
    .map((n): Service | null => {
      const suffix = String(n) as '1' | '2';
      const label = choice(`serviceLabel${suffix}`, SERVICE_LABELS);
      const amount = figure(`serviceAmount${suffix}`, true);
      const requested = choice(`serviceRequested${suffix}`, ANSWERS);
      return label === null || amount === null || requested === null
        ? null
        : { label, amount, requested };
    });

  const hasExcess = choice('hasExcess', YES_NO);
  const excess =
    hasExcess === 'yes'
      ? { amount: figure('excessAmount', true), maximeter: answer('maximeter') }
      : null;

  const hasPenalty = choice('hasPenalty', YES_NO);
  const penalty =
    hasPenalty === 'yes'
      ? {
          amount: figure('penaltyAmount', true),
          priceType: choice('priceType', PRICE_TYPES),
          firstRenewalPassed: answer('firstRenewalPassed'),
        }
      : null;

  const discount = figure('discount', false);
  const regularization = choice('regularization', REGULARIZATIONS);
  const regularizationAmount =
    regularization === 'charged' || regularization === 'returned'
      ? figure('regularizationAmount', true)
      : null;

  const taxAmount = figure('taxAmount', true);
  const taxPercent = figure('taxPercent', false);
  const vatAmount = figure('vatAmount', true);
  const vatPercent = figure('vatPercent', false);
  const total = figure('total', true);

  if (
    errors.length > 0 ||
    gate.power === null ||
    issuedOn === null ||
    dueOn === null ||
    readingFrom === null ||
    readingTo === null ||
    market === null ||
    retailer === null ||
    holder === null ||
    priceChange === null ||
    taxAmount === null ||
    vatAmount === null ||
    total === null ||
    selfConsumption === null ||
    accessTariff === null
  )
    return { errors, gate, input: null };
  const power = powerLines.filter((l): l is PowerLine => l !== null);
  const energy = energyLines.filter((l): l is EnergyLine => l !== null);
  const service = services.filter((s): s is Service => s !== null);
  const input: ElectricityBillInput = {
    issuedOn,
    dueOn,
    readingFrom,
    readingTo,
    readingKind: null,
    billedDays,
    postcode: postcodeText,
    accessTariff,
    selfConsumption,
    market,
    retailer,
    holder: holder === 'unknown' ? null : holder,
    contractedPower: gate.power,
    maxPowerUsed: maxUsed,
    priceChange: priceChange === 'yes' ? 'without_segments' : 'none',
    power,
    energy,
    discounts: discount === null || discount === 0 ? [] : [discount],
    tollsAndCharges: tolls === null ? null : { power: tolls.power, energy: tolls.energy },
    socialBonusFunding: funding,
    socialBonus:
      bonus === null || bonus.amount === null
        ? null
        : {
            category:
              bonus.category === null || bonus.category === 'unknown'
                ? null
                : (bonus.category satisfies SocialBonusCategory),
            members: null,
            discountedKwh: bonus.discountedKwh,
            kwhSoFar: bonus.kwhSoFar,
            amount: bonus.amount,
          },
    excessPower:
      excess === null || excess.amount === null
        ? null
        : { amount: excess.amount, maximeter: excess.maximeter },
    electricityTax: { base: null, percent: taxPercent, amount: taxAmount },
    meter:
      meter === null || meter.amount === null
        ? null
        : {
            amount: meter.amount,
            days: null,
            phase:
              meter.phase === null || meter.phase === 'unknown'
                ? null
                : (meter.phase satisfies Phase),
            supplyPhase: null,
            owned: meter.owned,
          },
    services: service,
    exitPenalty:
      penalty === null || penalty.amount === null
        ? null
        : {
            amount: penalty.amount,
            priceType: penalty.priceType === 'unknown' ? null : penalty.priceType,
            firstRenewalPassed: penalty.firstRenewalPassed,
          },
    regularizations:
      regularizationAmount === null
        ? []
        : [regularization === 'returned' ? -regularizationAmount : regularizationAmount],
    vat: { base: null, percent: vatPercent, amount: vatAmount },
    total,
    supplyFingerprint: null,
  };
  return { errors, gate, input };
}

const engineErrors = (input: ElectricityBillInput, today: CivilDate): ElectricityFieldError[] =>
  onQuestions(validateElectricity(input, today));

// The reach of the review as far as the answers read: until they say otherwise, the visit goes on.
export const formScope = (form: HTMLFormElement): ElectricityScope => gateOf(read(form).gate);

export function sheetErrors(
  form: HTMLFormElement,
  sheet: Sheet,
  today: CivilDate,
): ElectricityFieldError[] {
  const r = read(form);
  const fields: readonly ElectricityFormField[] = SHEET_FIELDS[sheet];
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

export function readElectricityForm(
  form: HTMLFormElement,
  today: CivilDate,
):
  { readonly input: ElectricityBillInput } | { readonly errors: readonly ElectricityFieldError[] } {
  const r = read(form);
  if (r.errors.length > 0) return { errors: r.errors };
  if (r.input === null) return { errors: [{ field: 'postcode', code: 'missing_value' }] };
  const errors = engineErrors(r.input, today);
  return errors.length > 0 ? { errors } : { input: r.input };
}
