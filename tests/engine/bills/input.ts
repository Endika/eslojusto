import { parseDate } from '../../../src/engine/date';
import type { BillItem, BillFinding } from '../../../src/engine/bills/finding';
import type {
  ElectricityBillInput,
  MeterRental,
  TelecomInput,
} from '../../../src/engine/bills/types';

// A synthetic PVPC bill of a reference retailer for June 2026, 4,6 kW in both periods, worked out
// by hand from the 2026 tables (every figure rounded to the cent):
//   days: 31-05 → 30-06 = 30
//   power P1: 4,6 × 30,817413 × 30 / 365 = 11,6515 → 11,65
//   power P2: 4,6 × 0,725423 × 30 / 365 = 0,2743 → 0,27
//   energy: 60 × 0,20 + 70 × 0,15 + 120 × 0,10 = 34,50
//   social bonus funding: (6,979247 × 25 + 9,011295 × 5) / 365 = 0,6015 → 0,60
//   tolls and charges, power: 4,6 × (27,704413 + 0,725423) × 30 / 365 = 10,7488 → 10,75
//   tolls and charges, energy: 60 × 0,097553 + 70 × 0,029267 + 120 × 0,003292 = 8,2969 → 8,30
//   meter, single phase: 0,81 × 12 × 30 / 365 = 0,7989 → 0,80
//   electricity tax: 47,02 × 5,11269632 % = 2,4040 → 2,40
//   VAT: (47,02 + 2,40 + 0,80) × 21 % = 10,5462 → 10,55
//   total: 50,22 + 10,55 = 60,77
export const juneBill = (change: Partial<ElectricityBillInput> = {}): ElectricityBillInput => ({
  issuedOn: parseDate('2026-07-02'),
  dueOn: parseDate('2026-07-07'),
  readingFrom: parseDate('2026-05-31'),
  readingTo: parseDate('2026-06-30'),
  readingKind: 'real',
  billedDays: 30,
  postcode: '28001',
  accessTariff: '2.0TD',
  selfConsumption: 'none',
  market: 'pvpc',
  retailer: 'reference',
  holder: 'person',
  contractedPower: { p1: 4.6, p2: 4.6 },
  maxPowerUsed: { p1: 3.1, p2: 1.2 },
  priceChange: 'none',
  power: [
    { period: 'p1', kw: 4.6, price: 30.817413, unit: 'per_kw_year', days: null, amount: 11.65 },
    { period: 'p2', kw: 4.6, price: 0.725423, unit: 'per_kw_year', days: null, amount: 0.27 },
  ],
  energy: [
    { period: 'p1', kwh: 60, price: 0.2, amount: 12 },
    { period: 'p2', kwh: 70, price: 0.15, amount: 10.5 },
    { period: 'p3', kwh: 120, price: 0.1, amount: 12 },
  ],
  discounts: [],
  tollsAndCharges: { power: 10.75, energy: 8.3 },
  socialBonusFunding: 0.6,
  socialBonus: null,
  excessPower: null,
  electricityTax: { base: 47.02, percent: 5.11269632, amount: 2.4 },
  meter: meter(),
  services: [],
  exitPenalty: null,
  regularizations: [],
  vat: { base: 50.22, percent: 21, amount: 10.55 },
  total: 60.77,
  supplyFingerprint: null,
  ...change,
});

export function meter(change: Partial<MeterRental> = {}): MeterRental {
  return {
    amount: 0.8,
    days: null,
    phase: 'single',
    supplyPhase: 'single',
    owned: false,
    ...change,
  };
}

// The same supply on a free-market offer: its own prices, the same tolls and charges.
export const freeBill = (change: Partial<ElectricityBillInput> = {}): ElectricityBillInput =>
  juneBill({
    market: 'free',
    retailer: 'other',
    holder: null,
    power: [
      { period: 'p1', kw: 4.6, price: 0.1, unit: 'per_kw_day', days: null, amount: 13.8 },
      { period: 'p2', kw: 4.6, price: 0.01, unit: 'per_kw_day', days: null, amount: 1.38 },
    ],
    ...change,
  });

export const telecom = (change: Partial<TelecomInput> = {}): TelecomInput => ({
  commitment: { startedOn: parseDate('2025-03-01'), months: 18, agreedPenalty: 180 },
  exitRequestedOn: parseDate('2026-03-01'),
  penaltyCharged: 60,
  handset: null,
  changeNotice: null,
  lines: [{ from: parseDate('2026-02-01'), to: parseDate('2026-02-28'), amount: 30 }],
  ...change,
});

export const TODAY = parseDate('2026-10-09');

export const only = (item: BillItem): BillFinding => {
  if (item.kind !== 'single') throw new Error('expected a single reading');
  return item.finding;
};
