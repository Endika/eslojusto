import type { Reading } from './extraction';
import {
  groupDocuments,
  listsReachedMaximum,
  mergeFields,
  own,
  type Conflict,
  type From,
  type MergedField,
  type RecognisedDocument,
} from './merge';
import { RENEWAL_SECTIONS } from './renewal-schema';

const fromLetter = own('price_change_notice');

// The letter is the only source, so the fields it states once come straight from it.
export const RENEWAL_MERGE_RULES = {
  letterDate: [['price_change_notice', 'sentOn']],
  renewalDate: [['price_change_notice', 'appliesFrom']],
  separateFromBill: fromLetter,
  isRenewal: fromLetter,
  fixedPrice: fromLetter,
  powerKwP1: [['price_change_notice', 'contractedPowerP1']],
  powerKwP2: [['price_change_notice', 'contractedPowerP2']],
  annualKwh: [['price_change_notice', 'annualConsumptionKwh']],
  declaredWithoutTax: [['price_change_notice', 'estimatedCostNewWithoutTax']],
  declaredWithTax: [['price_change_notice', 'estimatedCostNewWithTax']],
} as const satisfies Readonly<Record<string, readonly From[]>>;

// The prices come out of the letter's rows: a power price per period and an energy price, one for
// all the day or one per period.
const PRICE_FIELDS = [
  'powerUnit',
  'currentPowerP1',
  'currentPowerP2',
  'nextPowerP1',
  'nextPowerP2',
  'currentEnergy',
  'nextEnergy',
  'currentEnergyP1',
  'currentEnergyP2',
  'currentEnergyP3',
  'nextEnergyP1',
  'nextEnergyP2',
  'nextEnergyP3',
] as const;

export type RenewalFieldName = keyof typeof RENEWAL_MERGE_RULES | (typeof PRICE_FIELDS)[number];

export interface RenewalMerged {
  readonly pages: Reading['pages'];
  readonly documents: readonly RecognisedDocument[];
  readonly fields: Readonly<Partial<Record<RenewalFieldName, MergedField>>>;
  readonly lists: Readonly<Record<string, never>>;
  readonly conflicts: readonly Conflict<RenewalFieldName>[];
  readonly truncated: boolean;
  readonly discarded: number;
}

const SOURCE = 'price_change_notice' as const;

function priceFields(reading: Reading): Partial<Record<RenewalFieldName, MergedField>> {
  const rows = reading.sections.price_change_notice?.lists['priceChanges'] ?? [];
  const fields: Partial<Record<RenewalFieldName, MergedField>> = {};
  const put = (
    name: RenewalFieldName,
    value: string | number,
    confidence: MergedField['confidence'],
  ) => {
    fields[name] ??= { value, confidence, source: SOURCE };
  };
  for (const { values, confidence } of rows) {
    const { term, period, before, after, unit } = values;
    const suffix = period === 'all' ? '' : String(period).toUpperCase();
    if (term === 'power' && (period === 'p1' || period === 'p2')) {
      if (typeof before === 'number')
        put(`currentPower${suffix}` as RenewalFieldName, before, confidence);
      if (typeof after === 'number')
        put(`nextPower${suffix}` as RenewalFieldName, after, confidence);
      if (unit === 'per_kw_day' || unit === 'per_kw_year') put('powerUnit', unit, confidence);
    } else if (term === 'energy') {
      if (typeof before === 'number')
        put(`currentEnergy${suffix}` as RenewalFieldName, before, confidence);
      if (typeof after === 'number')
        put(`nextEnergy${suffix}` as RenewalFieldName, after, confidence);
    }
  }
  return fields;
}

export function renewalMerge(reading: Reading, toolInput: unknown): RenewalMerged {
  const { fields, conflicts, discarded } = mergeFields(reading, RENEWAL_MERGE_RULES);
  return {
    pages: reading.pages,
    documents: groupDocuments(reading.pages),
    fields: { ...fields, ...priceFields(reading) },
    lists: {},
    conflicts,
    truncated: listsReachedMaximum(toolInput, reading, RENEWAL_SECTIONS),
    discarded,
  };
}

// A legible letter that gave no price at all: worth a second look.
export const renewalIncomplete = (reading: Reading, merged: RenewalMerged): boolean =>
  reading.pages.some((p) => p.kind === 'price_change_notice' && p.readability.value === 'ok') &&
  !PRICE_FIELDS.some((name) => name !== 'powerUnit' && merged.fields[name] !== undefined);
