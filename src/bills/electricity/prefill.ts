import { formatAmountInput } from '../../calculator/number';
import {
  ELECTRICITY_CHECKS,
  type Confidence,
  type ElectricityExtraction,
  type ExtractedRow,
  type ExtractedValue,
  type FailedCheck,
} from '../../documents/contract';
import type { ReadMark, ReadPrefill } from '../../documents/ports';
import { parseDate, toIso } from '../../engine/date';
import type { EnergyPeriod, PowerPeriod } from '../../engine/bills/types';
import type { Translate } from '../../i18n/client';
import {
  BONUS_CATEGORIES,
  ENERGY_PERIODS,
  MARKETS,
  PHASES,
  POWER_PERIODS,
  POWER_UNITS,
  PRICE_TYPES,
  SELF_CONSUMPTION,
  SERVICE_LABELS,
  type ElectricityFormField,
} from './form';

// One bill of a read, as the form takes it: its answers and marks, and what tells it apart from
// another copy of it, which never goes into the form.
export interface BillRead extends ReadPrefill {
  readonly fingerprint: string | null;
  // The first and the last reading, as ISO dates, when the bill states them.
  readonly from: string | null;
  readonly to: string | null;
}

export interface ElectricityRead {
  // Oldest first, by their last reading.
  readonly bills: readonly BillRead[];
  // What the summary says about the whole read.
  readonly notes: readonly string[];
}

// The form asks for two services at most.
const MAX_SERVICES = 2;
const SUFFIX = { p1: 'P1', p2: 'P2', p3: 'P3' } as const;

const RANK: Record<Confidence, number> = { high: 2, medium: 1, low: 0 };
const lowest = (...cs: Confidence[]): Confidence =>
  cs.reduce((a, b) => (RANK[b] < RANK[a] ? b : a), 'high');

const numberOf = (v: ExtractedValue | undefined): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
const oneOf = <T extends string>(v: ExtractedValue | undefined, options: readonly T[]): T | null =>
  typeof v === 'string' && (options as readonly string[]).includes(v) ? (v as T) : null;

function isoOf(v: ExtractedValue | undefined): string | null {
  if (typeof v !== 'string') return null;
  try {
    return toIso(parseDate(v));
  } catch {
    return null;
  }
}

// A quantity or a unit price with every decimal the bill prints, as the form takes it: «0,123456».
const DECIMAL = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 8, useGrouping: false });
const decimalText = (n: number): string => DECIMAL.format(n);
const amountText = (n: number): string => formatAmountInput(Math.round(n * 100) / 100);

class Answers {
  readonly entries: [string, string][] = [];
  readonly marks: ReadMark[] = [];

  read(name: ElectricityFormField, value: string, confidence: Confidence, derived = false) {
    this.entries.push([name, value]);
    this.marks.push({
      id: name,
      container: `[data-field="${name}"]`,
      confidence,
      ...(derived && { derived: true as const }),
    });
  }

  // An answer that only opens what was read, such as «Sí» above the figure it asks for.
  open(name: ElectricityFormField, value: string) {
    this.entries.push([name, value]);
  }

  figure(
    name: ElectricityFormField,
    v: ExtractedValue | undefined,
    confidence: Confidence,
    text: (n: number) => string = amountText,
  ): boolean {
    const n = numberOf(v);
    if (n === null) return false;
    this.read(name, text(n), confidence);
    return true;
  }
}

const ofBill = (rows: readonly ExtractedRow[], document: ExtractedValue | undefined) =>
  rows.filter((r) => r.values['document'] === document);

// The power and energy lines, one per period. A period billed in stretches at different prices
// says the price changed, and its figures are left for the person: the form takes one line.
function lines(a: Answers, power: readonly ExtractedRow[], energy: readonly ExtractedRow[]) {
  const periodOf = <P extends string>(r: ExtractedRow, periods: readonly P[]) =>
    oneOf(r.values['period'], periods);
  const byPower = (p: PowerPeriod) => power.filter((r) => periodOf(r, POWER_PERIODS) === p);
  const byEnergy = (p: EnergyPeriod) => energy.filter((r) => periodOf(r, ENERGY_PERIODS) === p);
  const stretched =
    POWER_PERIODS.some((p) => byPower(p).length > 1) ||
    ENERGY_PERIODS.some((p) => byEnergy(p).length > 1);
  if (power.length > 0 || energy.length > 0) {
    const confidence = lowest(...[...power, ...energy].map((r) => r.confidence));
    a.read('priceChange', stretched ? 'yes' : 'no', confidence, true);
  }
  if (stretched) return;

  const units = new Set(power.map((r) => oneOf(r.values['unit'], POWER_UNITS)));
  const [unit] = units;
  if (units.size === 1 && unit)
    a.read('powerUnit', unit, lowest(...power.map((r) => r.confidence)));
  for (const p of POWER_PERIODS) {
    const [line] = byPower(p);
    if (!line) continue;
    a.figure(`powerPrice${SUFFIX[p]}`, line.values['price'], line.confidence, decimalText);
    a.figure(`powerAmount${SUFFIX[p]}`, line.values['amount'], line.confidence);
  }
  for (const p of ENERGY_PERIODS) {
    const [line] = byEnergy(p);
    if (!line) continue;
    a.figure(`kwh${SUFFIX[p]}`, line.values['kwh'], line.confidence, decimalText);
    a.figure(`energyPrice${SUFFIX[p]}`, line.values['price'], line.confidence, decimalText);
    a.figure(`energyAmount${SUFFIX[p]}`, line.values['amount'], line.confidence);
  }
}

const amountOf = (rows: readonly ExtractedRow[]) =>
  rows.reduce((total, r) => total + (numberOf(r.values['amount']) ?? 0), 0);

// Services, discounts and regularisations: what the form asks of each. The person still says
// whether they asked for a service; a bill can't.
function otherLines(a: Answers, other: readonly ExtractedRow[], tr: Translate): string[] {
  const notes: string[] = [];
  const kind = (k: string) => other.filter((r) => r.values['kind'] === k);
  const services = kind('service');
  if (services.length > 0) {
    a.read(
      'serviceCount',
      String(Math.min(services.length, MAX_SERVICES)),
      lowest(...services.map((r) => r.confidence)),
    );
    services.slice(0, MAX_SERVICES).forEach((r, i) => {
      const n = String(i + 1) as '1' | '2';
      a.read(
        `serviceLabel${n}`,
        oneOf(r.values['serviceLabel'], SERVICE_LABELS) ?? 'other',
        lowest(r.confidence, 'medium'),
      );
      a.figure(`serviceAmount${n}`, r.values['amount'], r.confidence);
    });
    if (services.length > MAX_SERVICES)
      notes.push(tr('client.bills.documents.more_services', { n: services.length }));
  }
  const discounts = kind('discount');
  if (discounts.length > 0)
    a.read(
      'discount',
      amountText(amountOf(discounts)),
      lowest(...discounts.map((r) => r.confidence)),
      discounts.length > 1,
    );
  const [charged, returned] = [kind('regularization_charge'), kind('regularization_refund')];
  if (charged.length > 0 && returned.length > 0)
    notes.push(tr('client.bills.documents.both_regularizations'));
  else {
    const rows = charged.length > 0 ? charged : returned;
    if (rows.length > 0) {
      const confidence = lowest(...rows.map((r) => r.confidence));
      a.read('regularization', charged.length > 0 ? 'charged' : 'returned', confidence);
      a.read('regularizationAmount', amountText(amountOf(rows)), confidence, rows.length > 1);
    }
  }
  return notes;
}

function billPrefill(
  bill: ExtractedRow,
  e: ElectricityExtraction,
  tr: Translate,
): { readonly read: BillRead; readonly notes: readonly string[] } {
  const a = new Answers();
  const v = bill.values;
  const c = bill.confidence;
  const doc = v['document'];

  const postcode = typeof v['postcode'] === 'string' ? v['postcode'] : null;
  if (postcode !== null && /^\d{5}$/.test(postcode)) a.read('postcode', postcode, c);
  const tariff = oneOf(v['accessTariff'], ['2.0TD', '3.0TD', '6.1TD', 'other'] as const);
  if (tariff) a.read('accessTariff', tariff === '2.0TD' ? '2.0TD' : 'other', c);
  const self = oneOf(v['selfConsumption'], SELF_CONSUMPTION);
  if (self) a.read('selfConsumption', self, c);
  a.figure('powerP1', v['contractedPowerP1'], c, decimalText);
  a.figure('powerP2', v['contractedPowerP2'], c, decimalText);

  const dates = [
    ['issuedOn', 'issuedOn'],
    ['dueOn', 'dueOn'],
    ['readingFrom', 'readingFrom'],
    ['readingTo', 'readingTo'],
  ] as const;
  for (const [name, from] of dates) {
    const iso = isoOf(v[from]);
    if (iso !== null) a.read(name, iso, c);
  }
  const days = numberOf(v['billedDays']);
  if (days !== null && Number.isInteger(days)) a.read('billedDays', String(days), c);
  const market = oneOf(v['market'], MARKETS);
  if (market) a.read('market', market, c);

  lines(a, ofBill(e.powerLines, doc), ofBill(e.energyLines, doc));
  a.figure('maxUsedP1', v['maxPowerUsedP1'], c, decimalText);
  a.figure('maxUsedP2', v['maxPowerUsedP2'], c, decimalText);

  const tollsPower = numberOf(v['tollsAndChargesPower']);
  const tollsEnergy = numberOf(v['tollsAndChargesEnergy']);
  if (tollsPower !== null && tollsEnergy !== null) {
    a.open('tollsShown', 'yes');
    a.figure('tollsPower', tollsPower, c);
    a.figure('tollsEnergy', tollsEnergy, c);
  }
  if (numberOf(v['socialBonusFunding']) !== null) {
    a.open('fundingShown', 'yes');
    a.figure('funding', v['socialBonusFunding'], c);
  }
  if (numberOf(v['socialBonusAmount']) !== null) {
    a.open('hasBonus', 'yes');
    const category = oneOf(v['socialBonusCategory'], BONUS_CATEGORIES);
    if (category) a.read('bonusCategory', category, c);
    a.figure('bonusAmount', v['socialBonusAmount'], c);
    a.figure('bonusDiscountedKwh', v['socialBonusKwh'], c, decimalText);
  }
  if (numberOf(v['meterAmount']) !== null) {
    a.open('meterCharged', 'yes');
    a.figure('meterAmount', v['meterAmount'], c);
    const phase = oneOf(v['meterPhase'], PHASES);
    if (phase) a.read('meterPhase', phase, c);
  }
  if (numberOf(v['excessPowerAmount']) !== null) {
    a.open('hasExcess', 'yes');
    a.figure('excessAmount', v['excessPowerAmount'], c);
  }
  if (numberOf(v['exitPenaltyAmount']) !== null) {
    a.open('hasPenalty', 'yes');
    a.figure('penaltyAmount', v['exitPenaltyAmount'], c);
    const priceType = e.fields.priceType;
    const type = oneOf(priceType?.value, PRICE_TYPES);
    if (priceType && type) a.read('priceType', type, priceType.confidence);
  }
  const notes = otherLines(a, ofBill(e.otherLines, doc), tr);

  a.figure('taxAmount', v['electricityTaxAmount'], c);
  a.figure('taxPercent', v['electricityTaxPercent'], c, decimalText);
  a.figure('vatAmount', v['vatAmount'], c);
  a.figure('vatPercent', v['vatPercent'], c, decimalText);
  a.figure('total', v['total'], c);

  const low = a.marks.some((m) => m.confidence === 'low');
  return {
    read: {
      entries: a.entries,
      marks: a.marks,
      count: a.marks.length,
      lowConfidence: low,
      notes: low ? [tr('client.documents.done_low')] : [],
      fingerprint: typeof v['supplyFingerprint'] === 'string' ? v['supplyFingerprint'] : null,
      from: isoOf(v['readingFrom']),
      to: isoOf(v['readingTo']),
    },
    notes,
  };
}

// Oldest first; a bill without its last reading goes last, in the order read.
const byLastReading = (a: BillRead, b: BillRead): number =>
  a.to === null ? (b.to === null ? 0 : 1) : b.to === null ? -1 : a.to.localeCompare(b.to);

// What a read puts into the electricity review, bill by bill. Nothing here reviews anything: each
// bill fills the form on its own, every answer marked as read and how surely, and the person
// confirms every sheet before it is reviewed. The contract only tells a penalty's price type.
export function electricityPrefill(
  e: ElectricityExtraction,
  tr: Translate,
  checks: readonly FailedCheck[] = [],
): ElectricityRead {
  const prefills = e.bills.map((bill) => billPrefill(bill, e, tr));
  const bills = prefills.map((p) => p.read).sort(byLastReading);
  return {
    bills,
    notes: [
      ...(bills.length > 1 ? [tr('client.bills.documents.several', { n: bills.length })] : []),
      ...[...new Set(prefills.flatMap((p) => p.notes))],
      ...(e.truncated ? [tr('client.bills.documents.truncated')] : []),
      ...ELECTRICITY_CHECKS.filter((c) => checks.includes(c)).map((c) =>
        tr(`client.bills.documents.check.${c}`),
      ),
    ],
  };
}
