import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type {
  ElectricityBankCase,
  ElectricityCaseBill,
  ExpectedBasket,
  ExpectedBillFinding,
  ExpectedBillItem,
  ExpectedElectricityBillReview,
} from '../../../api/eval/electricity-schema';
import type {
  ExpectedTelecomReview,
  TelecomBankCase,
  TelecomCaseInput,
} from '../../../api/eval/telecom-schema';
import { PASS_PRICE } from '../../../src/documents/contract';
import { reviewBasket, type Basket } from '../../../src/engine/bills/basket';
import { CHARGES } from '../../../src/engine/bills/data/charges';
import { ELECTRICITY_TAX } from '../../../src/engine/bills/data/electricity-tax';
import { SOCIAL_BONUS_FUNDING } from '../../../src/engine/bills/data/fbs';
import { METER_RENT } from '../../../src/engine/bills/data/meter';
import { BILLS_NORMS } from '../../../src/engine/bills/data/norms';
import { NORMS_BEFORE_FIGURE } from './norms-before-figure';
import { PVPC_MARGIN } from '../../../src/engine/bills/data/pvpc';
import { BILLS_SOURCES } from '../../../src/engine/bills/data/sources';
import { BILLS_TABLES } from '../../../src/engine/bills/data/tables';
import { TOLLS } from '../../../src/engine/bills/data/tolls';
import { VAT } from '../../../src/engine/bills/data/vat';
import {
  reviewElectricityBill,
  type ElectricityReview,
} from '../../../src/engine/bills/electricity-review';
import { findingsOf, type BillFinding, type BillItem } from '../../../src/engine/bills/finding';
import type { BillsNormId } from '../../../src/engine/bills/norms';
import type { Table } from '../../../src/engine/bills/tables';
import { reviewTelecom, type TelecomReview } from '../../../src/engine/bills/telecom-review';
import type { ElectricityBillInput, TelecomInput } from '../../../src/engine/bills/types';
import { addDays, parseDate as f, ordinal, toIso } from '../../../src/engine/date';

// The synthetic banks of electricity and telecom packs double as golden cases for the engine:
// each case's expected review names the rule it exercises.
function casesIn<C>(folder: string): readonly C[] {
  const dir = new URL(`../../../api/eval/cases/${folder}/`, import.meta.url);
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => JSON.parse(readFileSync(new URL(name, dir), 'utf8')) as C);
}
const ELECTRICITY: readonly ElectricityBankCase[] = casesIn('electricity');
const TELECOM: readonly TelecomBankCase[] = casesIn('telecom');

// The bank reviews each case as the norms stood when it was written, open conditions included.
const ELECTRICITY_DEPS = { norms: NORMS_BEFORE_FIGURE, tables: BILLS_TABLES };
const TELECOM_DEPS = { norms: BILLS_NORMS, tables: BILLS_TABLES, sources: BILLS_SOURCES };

const toBill = (b: ElectricityCaseBill): ElectricityBillInput => ({
  ...b,
  issuedOn: f(b.issuedOn),
  dueOn: f(b.dueOn),
  readingFrom: f(b.readingFrom),
  readingTo: f(b.readingTo),
});

const toTelecom = (c: TelecomCaseInput): TelecomInput => ({
  ...c,
  commitment:
    c.commitment === null ? null : { ...c.commitment, startedOn: f(c.commitment.startedOn) },
  exitRequestedOn: f(c.exitRequestedOn),
  changeNotice:
    c.changeNotice === null
      ? null
      : {
          ...c.changeNotice,
          sentOn: c.changeNotice.sentOn === null ? null : f(c.changeNotice.sentOn),
          appliesOn: c.changeNotice.appliesOn === null ? null : f(c.changeNotice.appliesOn),
        },
  lines: c.lines.map((l) => ({ ...l, from: f(l.from), to: f(l.to) })),
});

const asFinding = (x: BillFinding): ExpectedBillFinding => ({
  id: x.id,
  line: x.line,
  status: x.status,
  amount: x.amount,
  direction: x.direction,
  recurring: x.recurring,
});

const asItem = (item: BillItem): ExpectedBillItem =>
  item.kind === 'single'
    ? asFinding(item.finding)
    : {
        question: item.question,
        readings: item.readings.map((r) => ({ when: r.when, ...asFinding(r.finding) })),
      };

const asBill = (r: ElectricityReview): ExpectedElectricityBillReview => ({
  scope: r.scope,
  items: r.items.map(asItem),
  totals: r.totals,
  recurring: r.recurring,
});

const asBasket = (b: Basket): ExpectedBasket => ({
  bills: b.bills,
  skipped: b.skipped,
  totals: b.totals,
  days: b.days,
  recurring: b.recurring,
  yearlyEstimate: b.yearlyEstimate,
  offerPass: b.offerPass,
});

const asTelecom = (r: TelecomReview): ExpectedTelecomReview => ({
  scope: r.scope,
  items: r.items.map(asItem),
  totals: r.totals,
});

function reviewed(c: ElectricityBankCase) {
  return c.expected.input.bills.map((b) => {
    const input = toBill(b);
    const result = reviewElectricityBill(input, f(c.today), ELECTRICITY_DEPS);
    if (!result.ok) throw new Error(`${c.id}: invalid input ${JSON.stringify(result.errors)}`);
    return { input, review: result.review };
  });
}

const matches = (r: ElectricityReview): boolean =>
  r.scope.inScope &&
  r.items.flatMap(findingsOf).every((x) => x.status === 'matches' || x.status === 'information');

describe('the synthetic bank of electricity packs', () => {
  it('holds 37 cases', () => {
    expect(ELECTRICITY).toHaveLength(37);
  });

  it.each(ELECTRICITY.map((c) => [c.id, c] as const))('%s', (_, c) => {
    const bills = reviewed(c);
    expect(bills.map((b) => asBill(b.review))).toEqual(c.expected.review.bills);
    expect(asBasket(reviewBasket(bills, { passPrice: PASS_PRICE }))).toEqual(
      c.expected.review.basket,
    );
  });

  it('holds bills that match on every line in at least a third of its cases', () => {
    const matching = ELECTRICITY.filter((c) => reviewed(c).some((b) => matches(b.review)));
    expect(matching.length * 3).toBeGreaterThanOrEqual(ELECTRICITY.length);
  });
});

describe('the synthetic bank of telecom packs', () => {
  it('holds 9 cases', () => {
    expect(TELECOM).toHaveLength(9);
  });

  it.each(TELECOM.map((c) => [c.id, c] as const))('%s', (_, c) => {
    const result = reviewTelecom(toTelecom(c.expected.input), f(c.today), TELECOM_DEPS);
    if (!result.ok) throw new Error(`invalid input: ${JSON.stringify(result.errors)}`);
    expect(asTelecom(result.review)).toEqual(c.expected.review);
  });
});

// The bills that match are laid out after the model of annex I of the Resolución de 28 de abril
// de 2021 (BOE-A-2021-7120), which prints «xx kW × xxxx €/kW y año × (xx/365) días» and the like
// with no worked example. Each line is worked out again here straight from the 2026 tables, with
// those formulas and none of the engine's code, and must be within a cent of what the bill prints.
describe('the matching bills against the model bill, line by line', () => {
  const only = <V>(rows: readonly { readonly value: V }[]): V => {
    const [row, ...more] = rows;
    if (row === undefined || more.length > 0) throw new Error('expected a single row');
    return row.value;
  };
  const tolls = only(TOLLS);
  const charges = only(CHARGES);
  const margin = only(PVPC_MARGIN);
  const meter = only(METER_RENT);
  // The row of a day: a reduction whose condition the data gives as not met gives way to the
  // general rate it would have replaced.
  const notMet = (id: BillsNormId): boolean => BILLS_NORMS[id].condition?.met === false;
  const rateOn = <V>(table: Table<V>, day: string): V =>
    only(
      table.filter(
        (r) =>
          r.from <= day &&
          (r.until === null || day <= r.until) &&
          (r.unless === undefined ? !notMet(r.norm) : r.unless.some(notMet)),
      ),
    );
  const fundingOn = (day: string) => rateOn(SOCIAL_BONUS_FUNDING, day);

  const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);
  const cent = (billed: number, worked: number) =>
    expect(Math.abs(billed - Math.round(worked * 100) / 100)).toBeLessThanOrEqual(0.0100001);

  const bills = ELECTRICITY.flatMap((c) =>
    reviewed(c)
      .map((b, i) => ({
        id: `${c.id} #${i + 1}`,
        bill: c.expected.input.bills[i],
        review: b.review,
      }))
      .filter(
        (x): x is { id: string; bill: ElectricityCaseBill; review: ElectricityReview } =>
          x.bill !== undefined && matches(x.review) && x.bill.socialBonus === null,
      ),
  );

  it('holds more than five such bills, PVPC and free market', () => {
    expect(bills.length).toBeGreaterThan(5);
    expect(bills.some((b) => b.bill.market === 'pvpc')).toBe(true);
    expect(bills.some((b) => b.bill.market === 'free')).toBe(true);
  });

  it.each(bills.map((b) => [b.id, b.bill] as const))('%s', (_, bill) => {
    const from = f(bill.readingFrom);
    const days = ordinal(f(bill.readingTo)) - ordinal(from);
    const kw = bill.contractedPower;
    for (const line of bill.power) {
      if (bill.market === 'pvpc') {
        const official =
          tolls.power[line.period] +
          charges.power[line.period] +
          (line.period === 'p1' ? margin : 0);
        expect(line.price).toBeCloseTo(official, 6);
      }
      const perDay = line.unit === 'per_kw_day' ? line.price : line.price / 365;
      cent(line.amount, line.kw * perDay * days);
    }
    for (const line of bill.energy) cent(line.amount, line.kwh * line.price);
    const kwh = (p: 'p1' | 'p2' | 'p3') =>
      sum(bill.energy.filter((l) => l.period === p).map((l) => l.kwh));
    cent(
      bill.tollsAndCharges?.power ?? NaN,
      (sum((['p1', 'p2'] as const).map((p) => kw[p] * (tolls.power[p] + charges.power[p]))) *
        days) /
        365,
    );
    cent(
      bill.tollsAndCharges?.energy ?? NaN,
      sum((['p1', 'p2', 'p3'] as const).map((p) => kwh(p) * (tolls.energy[p] + charges.energy[p]))),
    );
    const daysOf = Array.from({ length: days }, (__, i) => toIso(addDays(from, i + 1)));
    cent(bill.socialBonusFunding ?? NaN, sum(daysOf.map((d) => fundingOn(d) / 365)));
    if (bill.meter !== null) {
      const monthly = bill.meter.phase === 'three' ? meter.threePhase : meter.singlePhase;
      cent(bill.meter.amount, (monthly * 12 * days) / 365);
    }
    const powerAndEnergy = sum([...bill.power, ...bill.energy].map((l) => l.amount));
    const discounts = sum(bill.discounts);
    const tax = rateOn(ELECTRICITY_TAX, bill.dueOn);
    const taxBase = powerAndEnergy + (bill.socialBonusFunding ?? 0) - discounts;
    cent(bill.electricityTax?.amount ?? NaN, (tax.percent / 100) * taxBase);
    const vat = rateOn(VAT, bill.dueOn);
    const services = sum(bill.services.map((s) => s.amount));
    const vatBase =
      taxBase + (bill.electricityTax?.amount ?? 0) + (bill.meter?.amount ?? 0) + services;
    cent(bill.vat?.amount ?? NaN, (vat.percent / 100) * vatBase);
    cent(bill.total, vatBase + (bill.vat?.amount ?? 0));
  });
});
