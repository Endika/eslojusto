import { formatAmountInput } from '../../calculator/number';
import type { ExtractedValue, RenewalExtraction, SourcedField } from '../../documents/contract';
import type { ReadMark, ReadPrefill } from '../../documents/ports';
import { parseDate, toIso } from '../../engine/date';
import type { Translate } from '../../i18n/client';
import { ENERGY_PRICINGS, POWER_UNITS, type RenewalFormField } from './form';

// Prices come with up to six decimals; the form takes them back with a decimal comma.
const PRICE = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
  useGrouping: false,
});
const QUANTITY = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 3, useGrouping: false });

const numberOf = (v: ExtractedValue | undefined): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;

function isoOf(v: ExtractedValue | undefined): string | null {
  if (typeof v !== 'string') return null;
  try {
    return toIso(parseDate(v));
  } catch {
    return null;
  }
}

const PRICES = [
  ['currentPowerP1', PRICE],
  ['currentPowerP2', PRICE],
  ['nextPowerP1', PRICE],
  ['nextPowerP2', PRICE],
  ['currentEnergy', PRICE],
  ['nextEnergy', PRICE],
  ['currentEnergyP1', PRICE],
  ['currentEnergyP2', PRICE],
  ['currentEnergyP3', PRICE],
  ['nextEnergyP1', PRICE],
  ['nextEnergyP2', PRICE],
  ['nextEnergyP3', PRICE],
  ['powerKwP1', QUANTITY],
  ['powerKwP2', QUANTITY],
  ['annualKwh', QUANTITY],
] as const;
const AMOUNTS = ['declaredWithoutTax', 'declaredWithTax'] as const;
const FLAGS = ['fixedPrice', 'separateFromBill'] as const;

// What a reading puts into the review of a renewal letter: its dates, prices, consumption and
// the costs it declares, and whether it says the price is fixed or came apart from the bill.
// Whether it is the first renewal is the person's to say.
export function renewalPrefill(e: RenewalExtraction, tr: Translate): ReadPrefill {
  const entries: [string, string][] = [];
  const marks: ReadMark[] = [];
  const { fields } = e;
  const read = (name: RenewalFormField, f: SourcedField, value: string) => {
    entries.push([name, value]);
    marks.push({ id: name, container: `[data-field="${name}"]`, confidence: f.confidence });
  };

  for (const name of ['letterDate', 'renewalDate'] as const) {
    const f = fields[name];
    const iso = isoOf(f?.value);
    if (f && iso !== null) read(name, f, iso);
  }
  const unit = fields.powerUnit;
  if (unit && (POWER_UNITS as readonly unknown[]).includes(unit.value))
    read('powerUnit', unit, String(unit.value));
  for (const [name, format] of PRICES) {
    const f = fields[name];
    const n = numberOf(f?.value);
    if (f && n !== null) read(name, f, format.format(n));
  }
  for (const name of AMOUNTS) {
    const f = fields[name];
    const n = numberOf(f?.value);
    if (f && n !== null) read(name, f, formatAmountInput(n));
  }
  for (const name of FLAGS) {
    const f = fields[name];
    if (f && typeof f.value === 'boolean') read(name, f, f.value ? 'yes' : 'no');
  }
  const pricing = ENERGY_PRICINGS.find((p) =>
    entries.some(([name]) =>
      p === 'single' ? /^(current|next)Energy$/.test(name) : /^(current|next)EnergyP\d$/.test(name),
    ),
  );
  if (pricing !== undefined) entries.push(['energyPricing', pricing]);

  const low = marks.some((m) => m.confidence === 'low');
  const notes = [
    ...(low ? [tr('client.documents.done_low')] : []),
    ...(fields.isRenewal?.value === false
      ? [tr('client.bills.renewal.documents.not_renewal')]
      : []),
    ...(e.truncated ? [tr('client.bills.documents.truncated')] : []),
  ];
  return { entries, marks, count: marks.length, lowConfidence: low, notes };
}
