import { RENEWAL_PAGE_KINDS } from './documents';
import {
  decimal,
  date,
  ELECTRICITY_READABILITY,
  flag,
  kw,
  list,
  money,
  MAX_AGREED_PRICES,
  oneOf,
  POWER_PRICE_UNITS,
  unitPrice,
} from './electricity-schema';
import type { ReviewSchema, SectionSchema } from './extraction-schema';

const RENEWAL_TERMS = ['power', 'energy'] as const;
// An energy price the letter gives for all the energy, not split by period, is `all`.
const RENEWAL_PERIODS = ['p1', 'p2', 'p3', 'all'] as const;
const RENEWAL_UNITS = [...POWER_PRICE_UNITS, 'per_kwh'] as const;

const priceChangeNotice = {
  description:
    'A letter announcing that the contract’s prices change, with the new and the current prices (carta de renovación o de modificación de precios).',
  source: 'price_change_notice',
  fields: {
    sentOn: date('Date of the letter.'),
    appliesFrom: date('Date the new prices apply from, or the renewal date (fecha de renovación).'),
    separateFromBill: flag(
      'true when it is a letter of its own; false when it is printed on a bill.',
    ),
    isRenewal: flag('true when the letter says the contract is renewed (renovación).'),
    fixedPrice: flag(
      'true only when the letter says the price is fixed (precio fijo); leave it out when it does not say.',
    ),
    contractedPowerP1: kw('Contracted power in P1, in kW.'),
    contractedPowerP2: kw('Contracted power in P2, in kW.'),
    annualConsumptionKwh: decimal(
      1_000_000,
      2,
      'Annual consumption the estimate is based on, in kWh (consumo anual).',
    ),
    estimatedCostNewWithoutTax: money(
      'Estimated annual cost at the new prices, without taxes (sin impuestos).',
    ),
    estimatedCostNewWithTax: money(
      'Estimated annual cost at the new prices, with taxes (con impuestos).',
    ),
  },
  lists: {
    priceChanges: list(
      'Every price it changes, one per term and period; all for an energy price not split by period.',
      MAX_AGREED_PRICES,
      {
        term: oneOf(RENEWAL_TERMS, 'power or energy.'),
        period: oneOf(RENEWAL_PERIODS, 'p1, p2 or p3; all for one price for all the energy.'),
        before: unitPrice('The current price, until the change.'),
        after: unitPrice('The new price, from the change.'),
        unit: oneOf(RENEWAL_UNITS, 'per_kw_day, per_kw_year or per_kwh, as printed.'),
      },
      ['term', 'period'],
    ),
  },
} as const satisfies SectionSchema;

export const RENEWAL_SECTIONS = {
  price_change_notice: priceChangeNotice,
} as const satisfies Readonly<Record<string, SectionSchema>>;

export const RENEWAL_SCHEMA: ReviewSchema = {
  pageKinds: RENEWAL_PAGE_KINDS,
  pageKindDescription:
    'price_change_notice: a notice that the contract’s prices change or renew, as a letter of its own or printed on a bill. other: a bill with no such notice, a contract, anything else.',
  readability: ELECTRICITY_READABILITY,
  readabilityDescription:
    'ok: legible enough to transcribe, in whatever language. Otherwise the main reason the page cannot be used: handwritten (the values are written by hand), blurry, dark, cropped (the part with the values is cut off), not_electricity_document (not about a household electricity supply), foreign_jurisdiction (a supply outside Spain; never because of its language), unknown_format (about an electricity supply, but no kind of document you know).',
  monthDescription: 'Leave it out.',
  sections: RENEWAL_SECTIONS,
};
