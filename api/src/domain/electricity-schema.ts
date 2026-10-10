import { ELECTRICITY_PAGE_KINDS, LIMITS } from './documents';
import type { FieldSpec, ListSpec, ReviewSchema, SectionSchema } from './extraction-schema';

// Mirrors of the site's bills engine unions (src/engine/bills/types.ts);
// test/electricity-contract.test.ts keeps them equal.
export const ELECTRICITY_MARKETS = ['pvpc', 'free'] as const;
export const READING_KINDS = ['real', 'estimated'] as const;
export const ACCESS_TARIFFS = ['2.0TD', '3.0TD', '6.1TD', 'other'] as const;
export const SELF_CONSUMPTION = ['none', 'without_surplus', 'with_surplus'] as const;
export const POWER_PERIODS = ['p1', 'p2'] as const;
export const ENERGY_PERIODS = ['p1', 'p2', 'p3'] as const;
export const POWER_PRICE_UNITS = ['per_kw_day', 'per_kw_year'] as const;
export const SOCIAL_BONUS_CATEGORIES = ['vulnerable', 'severe'] as const;
export const METER_PHASES = ['single', 'three'] as const;
export const SERVICE_LABELS = ['maintenance', 'insurance', 'pack', 'other'] as const;
export const PRICE_TYPES = ['fixed', 'variable', 'indexed'] as const;

// What a line of a bill beyond power, energy and taxes is. A service keeps its closed label too;
// a regularisation of earlier bills is charged or given back.
export const OTHER_LINE_KINDS = [
  'service',
  'discount',
  'regularization_charge',
  'regularization_refund',
  'other',
] as const;
export const AGREED_PRICE_TERMS = ['power', 'energy'] as const;
export const AGREED_PRICE_UNITS = ['per_kw_day', 'per_kw_year', 'per_kwh'] as const;

export const ELECTRICITY_READABILITY = [
  'ok',
  'handwritten',
  'blurry',
  'dark',
  'cropped',
  'not_electricity_document',
  'foreign_jurisdiction',
  'unknown_format',
] as const;

const MAX_NAME = 80;
export const MAX_INVOICE_NUMBER = 40;
export const MAX_ELECTRICITY_CLAUSE_TEXT = 600;
// A year of monthly bills, which a pack of 25 pages holds at two pages each. Past it, the most
// recent by their last reading.
export const MAX_BILLS = 12;
export const MAX_POWER_LINES = 24;
export const MAX_ENERGY_LINES = 36;
export const MAX_OTHER_LINES = 24;
export const MAX_AGREED_PRICES = 10;
export const MAX_CONTRACT_SERVICES = 6;

const field = (type: FieldSpec['type'], description: string): FieldSpec => ({ type, description });
const date = (description: string) => field({ type: 'date' }, description);
const money = (description: string) => field({ type: 'money' }, description);
const flag = (description: string) => field({ type: 'boolean' }, description);
const percent = (description: string) => field({ type: 'percent' }, description);
const text = (maxLength: number, description: string) =>
  field({ type: 'text', maxLength }, description);
const oneOf = (values: readonly string[], description: string) =>
  field({ type: 'enum', values }, description);
const decimal = (max: number, decimals: number, description: string) =>
  field({ type: 'decimal', min: 0, max, decimals }, description);
const kw = (description: string) => decimal(1000, 3, description);
const unitPrice = (description: string) => decimal(1000, 6, description);

const list = (
  description: string,
  maxItems: number,
  item: Readonly<Record<string, FieldSpec>>,
  required: readonly string[],
  keepLatestBy?: string,
): ListSpec => ({
  description,
  maxItems,
  item,
  required,
  ...(keepLatestBy !== undefined && { keepLatestBy }),
});

const LITERAL =
  ' Copy it word for word, at most the first characters that fit; never summarise or judge it.';

// Every row of a bill's lists names the bill it belongs to by its document number in pages.
const billDocument = field(
  { type: 'integer', min: 1, max: LIMITS.maxImages },
  'The number of the document (as given in pages) of the bill this row belongs to.',
);

const serviceLabel = oneOf(
  SERVICE_LABELS,
  'For a service only: maintenance (mantenimiento, servicio técnico, asistencia), insurance (seguro, protección de pagos), pack (pack, servicio combinado), other.',
);

const bills = list(
  'Every bill (factura), one entry each, with its own figures; past twelve, the twelve most recent.',
  MAX_BILLS,
  {
    document: billDocument,
    retailerName: text(MAX_NAME, 'The retailer (comercializadora): its company name as printed.'),
    market: oneOf(
      ELECTRICITY_MARKETS,
      'pvpc when the bill says it is billed at the regulated price (precio voluntario para el pequeño consumidor, PVPC); free for a free-market contract (mercado libre).',
    ),
    invoiceNumber: text(MAX_INVOICE_NUMBER, 'The bill number (nº de factura) as printed.'),
    issuedOn: date('Date the bill was issued (fecha de emisión, de factura).'),
    dueOn: date(
      'Date it is charged or must be paid by (fecha de cargo, fecha límite de pago, vencimiento).',
    ),
    readingFrom: date('Date of the first reading of the period (lectura anterior, desde).'),
    readingTo: date('Date of the last reading of the period (lectura actual, hasta).'),
    billedDays: field({ type: 'days' }, 'Days billed, only if printed (días facturados).'),
    readingKind: oneOf(
      READING_KINDS,
      'real when the last reading is real (lectura real); estimated when it is estimated (estimada).',
    ),
    supplyFingerprint: field(
      { type: 'fingerprint' },
      'The supply point code (CUPS) exactly as printed, which starts with ES and has 20 to 22 characters.',
    ),
    postcode: field(
      { type: 'text', maxLength: 5, pattern: '^[0-9]{5}$' },
      'The postcode (código postal) of the supply address, five digits. Never the rest of the address.',
    ),
    accessTariff: oneOf(
      ACCESS_TARIFFS,
      'The access tariff (peaje de acceso, tarifa de acceso): 2.0TD, 3.0TD, 6.1TD or other.',
    ),
    selfConsumption: oneOf(
      SELF_CONSUMPTION,
      'none when the bill shows no self-consumption (autoconsumo); without_surplus (sin excedentes); with_surplus when it bills or offsets surplus energy (excedentes, compensación).',
    ),
    contractedPowerP1: kw('Contracted power in P1 (potencia contratada punta), in kW.'),
    contractedPowerP2: kw('Contracted power in P2 (potencia contratada valle), in kW.'),
    maxPowerUsedP1: kw(
      'Highest power demanded in P1 in the last 12 months (potencia máxima demandada), in kW.',
    ),
    maxPowerUsedP2: kw('The same in P2, in kW.'),
    tollsAndChargesPower: money(
      'What the bill says the tolls and charges (peajes y cargos) come to within the power term.',
    ),
    tollsAndChargesEnergy: money('The same within the energy term.'),
    socialBonusFunding: money(
      'Funding of the social bonus (financiación del bono social), its amount.',
    ),
    socialBonusCategory: oneOf(
      SOCIAL_BONUS_CATEGORIES,
      'Only when the bill applies the social bonus discount: vulnerable or severe (vulnerable severo).',
    ),
    socialBonusPercent: percent('The social bonus discount rate, 42,5 % is 42.5.'),
    socialBonusKwh: decimal(100_000, 3, 'kWh the discount applies to, if printed.'),
    socialBonusAmount: money('The social bonus discount (descuento bono social), as a positive.'),
    excessPowerAmount: money('Charge for power above the contracted (exceso de potencia).'),
    electricityTaxBase: money('Base of the electricity tax (impuesto eléctrico, IEE).'),
    electricityTaxPercent: decimal(100, 8, 'Its rate as printed, 5,11269632 % is 5.11269632.'),
    electricityTaxAmount: money('Its amount.'),
    meterAmount: money('Meter rental (alquiler de equipos de medida), its amount.'),
    meterDays: field({ type: 'days' }, 'Days of meter rental billed, if printed.'),
    meterPhase: oneOf(METER_PHASES, 'single (monofásico) or three (trifásico), only if printed.'),
    exitPenaltyAmount: money(
      'A penalty for ending the contract (penalización por baja, por resolución anticipada).',
    ),
    vatBase: money('VAT base (base imponible del IVA).'),
    vatPercent: percent('VAT rate, 21 % is 21.'),
    vatAmount: money('VAT amount (cuota de IVA).'),
    total: money('Total of the bill (total factura, total a pagar).'),
    commitmentEndOn: date('Date the commitment ends (fin de permanencia), if printed.'),
  },
  ['document'],
  'readingTo',
);

const powerLines = list(
  'Every line of the power term (término de potencia), one per period and per stretch when the price changes within the bill.',
  MAX_POWER_LINES,
  {
    document: billDocument,
    period: oneOf(POWER_PERIODS, 'p1 (punta) or p2 (valle).'),
    kw: kw('kW billed.'),
    price: unitPrice('Price per kW as printed, with every decimal.'),
    unit: oneOf(POWER_PRICE_UNITS, 'per_kw_day (€/kW día) or per_kw_year (€/kW año).'),
    days: field({ type: 'days' }, 'Days of the line.'),
    amount: money('Amount of the line.'),
  },
  ['document', 'period', 'amount'],
);

const energyLines = list(
  'Every line of the energy term (término de energía), one per period and per stretch when the price changes within the bill.',
  MAX_ENERGY_LINES,
  {
    document: billDocument,
    period: oneOf(ENERGY_PERIODS, 'p1 (punta), p2 (llano) or p3 (valle).'),
    kwh: decimal(100_000, 3, 'kWh billed.'),
    price: unitPrice('Price per kWh as printed, with every decimal.'),
    amount: money('Amount of the line.'),
  },
  ['document', 'period', 'amount'],
);

const otherLines = list(
  'Every other line of the bill that is not power, energy, social bonus, meter rental, exceso de potencia, taxes or a penalty: services, discounts and regularisations of earlier bills.',
  MAX_OTHER_LINES,
  {
    document: billDocument,
    concept: text(MAX_NAME, 'The concept exactly as printed.'),
    kind: oneOf(
      OTHER_LINE_KINDS,
      'service (a product or service besides the energy), discount (descuento), regularization_charge (regularización cobrada), regularization_refund (regularización a tu favor, abono), other.',
    ),
    serviceLabel,
    amount: money('Its amount, as a positive.'),
  },
  ['document', 'kind', 'amount'],
);

const electricityBill = {
  description: 'Household electricity bills (facturas de la luz), one entry per bill.',
  source: 'electricity_bill',
  fields: {},
  lists: { bills, powerLines, energyLines, otherLines },
} as const satisfies SectionSchema;

const electricityContract = {
  description: 'The electricity supply contract (contrato de suministro) and its conditions.',
  source: 'electricity_contract',
  fields: {
    signedOn: date('Date of the contract.'),
    retailerName: text(MAX_NAME, 'The retailer (comercializadora): its company name as printed.'),
    priceType: oneOf(
      PRICE_TYPES,
      'fixed (precio fijo), variable (precio variable, revisable) or indexed (indexado al mercado).',
    ),
    durationMonths: field(
      { type: 'integer', min: 1, max: 120 },
      'Duration of the contract in months.',
    ),
    renews: flag(
      'true when it says it extends itself (prórroga tácita, renovación automática); false when it says it does not.',
    ),
    exitPenaltyText: text(
      MAX_ELECTRICITY_CLAUSE_TEXT,
      'The clause on a penalty for ending the contract early (penalización, resolución anticipada).' +
        LITERAL,
    ),
  },
  lists: {
    agreedPrices: list(
      'Every agreed price (precios pactados), one per term and period.',
      MAX_AGREED_PRICES,
      {
        term: oneOf(AGREED_PRICE_TERMS, 'power (potencia) or energy (energía).'),
        period: oneOf(ENERGY_PERIODS, 'p1, p2 or p3.'),
        price: unitPrice('The price as printed, with every decimal.'),
        unit: oneOf(AGREED_PRICE_UNITS, 'per_kw_day, per_kw_year or per_kwh.'),
      },
      ['term', 'period', 'price'],
    ),
    services: list(
      'Every additional service the contract includes and its cost.',
      MAX_CONTRACT_SERVICES,
      {
        concept: text(MAX_NAME, 'The concept exactly as printed.'),
        serviceLabel,
        amount: money('Its cost in euros per month, if printed.'),
      },
      ['concept'],
    ),
  },
} as const satisfies SectionSchema;

const priceChangeNotice = {
  description:
    'A notice that the contract’s prices or conditions change (comunicación de modificación de precios o condiciones).',
  source: 'price_change_notice',
  fields: {
    sentOn: date('Date of the notice.'),
    appliesFrom: date('Date the change applies from.'),
    separateFromBill: flag(
      'true when it is a notice of its own; false when it is printed on a bill.',
    ),
  },
  lists: {
    priceChanges: list(
      'Every price it changes, one per term and period.',
      MAX_AGREED_PRICES,
      {
        term: oneOf(AGREED_PRICE_TERMS, 'power or energy.'),
        period: oneOf(ENERGY_PERIODS, 'p1, p2 or p3.'),
        before: unitPrice('The price until the change.'),
        after: unitPrice('The price from the change.'),
        unit: oneOf(AGREED_PRICE_UNITS, 'per_kw_day, per_kw_year or per_kwh.'),
      },
      ['term', 'period'],
    ),
  },
} as const satisfies SectionSchema;

// One section per kind of document, named after it.
export const ELECTRICITY_SECTIONS = {
  electricity_bill: electricityBill,
  electricity_contract: electricityContract,
  price_change_notice: priceChangeNotice,
} as const satisfies Readonly<
  Record<Exclude<(typeof ELECTRICITY_PAGE_KINDS)[number], 'other'>, SectionSchema>
>;

export type ElectricitySectionKind = keyof typeof ELECTRICITY_SECTIONS;

export const ELECTRICITY_READABILITY_DESCRIPTION =
  'ok: legible enough to transcribe, in whatever language. Otherwise the main reason the page cannot be used: handwritten (the values are written by hand), blurry, dark, cropped (the part with the values is cut off), not_electricity_document (not about a household electricity supply), foreign_jurisdiction (a supply outside Spain; never because of its language), unknown_format (about an electricity supply, but no kind of document you know).';
export const ELECTRICITY_PAGE_KIND_DESCRIPTION =
  'electricity_bill: a household electricity bill (factura de la luz), any of its pages. electricity_contract: the supply contract or its particular or general conditions. price_change_notice: a notice that the prices or conditions change. other: anything else, such as a gas bill, a phone bill or an ID card.';

export const ELECTRICITY_SCHEMA: ReviewSchema = {
  pageKinds: ELECTRICITY_PAGE_KINDS,
  pageKindDescription: ELECTRICITY_PAGE_KIND_DESCRIPTION,
  readability: ELECTRICITY_READABILITY,
  readabilityDescription: ELECTRICITY_READABILITY_DESCRIPTION,
  monthDescription: 'Leave it out: each bill gives its own period in its fields.',
  sections: ELECTRICITY_SECTIONS,
};
