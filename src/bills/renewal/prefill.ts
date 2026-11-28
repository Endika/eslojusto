import { formatAmountInput } from '../../calculator/number';
import type { RenewalExtraction, SourcedField } from '../../documents/contract';
import type { ReadPrefill } from '../../documents/ports';
import type { Translate } from '../../i18n/client';
import { isoOf, numberOf } from '../../documents/read';
import { Answers } from '../read';
import { ENERGY_PRICINGS, POWER_UNITS, type RenewalFormField } from './form';

// Prices come with up to six decimals; the form takes them back with a decimal comma.
const PRICE = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
  useGrouping: false,
});
const QUANTITY = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 3, useGrouping: false });

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
// Stryker disable next-line Regex: no field of a side has anything after the digit of its period
const ENERGY_PER_PERIOD = /EnergyP\d$/;
const AMOUNTS = ['declaredWithoutTax', 'declaredWithTax'] as const;
const FLAGS = ['separateFromBill'] as const;

// What a reading puts into the review of a renewal letter: its dates, prices, consumption, the
// costs it declares and whether it came apart from the bill. Whether the price is fixed is not
// asked, so the API's answer to it is left out.
export function renewalPrefill(e: RenewalExtraction, tr: Translate): ReadPrefill {
  const a = new Answers<RenewalFormField>();
  const { fields } = e;
  const read = (name: RenewalFormField, f: SourcedField, value: string) =>
    a.read(name, value, f.confidence);

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
  // Each side's energy as the letter gives it: once for all the day or once per period.
  for (const side of ['current', 'next'] as const) {
    const pricing = ENERGY_PRICINGS.find((p) =>
      a.entries.some(([name]) =>
        p === 'single'
          ? name === `${side}Energy`
          : name.startsWith(side) && ENERGY_PER_PERIOD.test(name),
      ),
    );
    if (pricing !== undefined) a.open(`${side}EnergyPricing`, pricing);
  }

  const low = a.lowConfidence();
  const notes = [
    ...(low ? [tr('client.documents.done_low')] : []),
    ...(fields.isRenewal?.value === false
      ? [tr('client.bills.renewal.documents.not_renewal')]
      : []),
    ...(e.truncated ? [tr('client.bills.documents.truncated')] : []),
  ];
  return { entries: a.entries, marks: a.marks, count: a.marks.length, lowConfidence: low, notes };
}
