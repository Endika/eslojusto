import { LIMITS } from '../../src/domain/documents';
import {
  MAX_AGREED_PRICES,
  MAX_BILLS,
  MAX_CONTRACT_SERVICES,
  MAX_ENERGY_LINES,
  MAX_OTHER_LINES,
  MAX_POWER_LINES,
} from '../../src/domain/electricity-schema';
import { MAX_TELECOM_BILLS, MAX_TELECOM_LINES } from '../../src/domain/telecom-schema';

// What an electricity read of 25 pages can record, to measure its output. `year` is the pack the
// review is for: twelve two-page bills and a contract, each bill with two power lines, three
// energy lines, one other line and the fields a household bill prints (no social bonus, excess,
// penalty or end of commitment). `largest` fills every list and every field, with every text at
// its limit. Made-up values only, and a supply code whose check letters are wrong.

const f = (value: unknown) => ({ value, confidence: 'high' });
const page = (n: number, kind: string, document: number) => ({
  page: n,
  kind,
  document,
  readability: f('ok'),
  confidence: 'high',
});
const PROSE =
  'En caso de resolución anticipada del contrato antes de la finalización de su periodo de vigencia, el cliente abonará una penalización equivalente al cinco por ciento de la energía estimada pendiente de suministro. ';
const prose = (length: number) => PROSE.repeat(Math.ceil(length / PROSE.length)).slice(0, length);
const month = (i: number) => String((i % 12) + 1).padStart(2, '0');

export const SYNTHETIC_SUPPLY_NUMBER = 'ES0000000000000000AA';

const RARE = [
  'socialBonusCategory',
  'socialBonusPercent',
  'socialBonusKwh',
  'socialBonusAmount',
  'excessPowerAmount',
  'exitPenaltyAmount',
  'commitmentEndOn',
];

export function electricityRecord(pack: 'largest' | 'year'): Record<string, unknown> {
  const largest = pack === 'largest';
  const rows = <T>(max: number, perBill: number, row: (i: number) => T): T[] =>
    Array.from({ length: largest ? max : perBill * MAX_BILLS }, (_, i) => row(i));
  const usual = (row: Record<string, unknown>) =>
    largest ? row : Object.fromEntries(Object.entries(row).filter(([k]) => !RARE.includes(k)));
  const named = (name: string, limit: number) => (largest ? name.padEnd(limit, 'X') : name);
  const kinds = largest
    ? ['electricity_contract', 'price_change_notice']
    : ['electricity_contract'];
  // Each bill is a document of two pages, numbered after the contract and the notice.
  const bill = (i: number) => kinds.length + 1 + (i % MAX_BILLS);
  const pages = [
    ...kinds.map((kind, i) => page(i + 1, kind, i + 1)),
    ...Array.from({ length: LIMITS.maxImages - kinds.length }, (_, i) =>
      page(i + kinds.length + 1, 'electricity_bill', bill(Math.floor(i / 2))),
    ),
  ];
  return {
    pages,
    electricity_contract: {
      signedOn: f('2026-01-10'),
      retailerName: f(named('Comercializadora Inventada, S.A.', 80)),
      priceType: f('fixed'),
      durationMonths: f(12),
      renews: f(true),
      exitPenaltyText: f(prose(largest ? 600 : 300)),
      agreedPrices: Array.from({ length: largest ? MAX_AGREED_PRICES : 5 }, () => ({
        term: 'energy',
        period: 'p1',
        price: 0.129876,
        unit: 'per_kwh',
        confidence: 'high',
      })),
      services: Array.from({ length: largest ? MAX_CONTRACT_SERVICES : 1 }, () => ({
        concept: named('Servicio de mantenimiento eléctrico', 80),
        serviceLabel: 'maintenance',
        amount: 6.95,
        confidence: 'high',
      })),
    },
    ...(largest && {
      price_change_notice: {
        sentOn: f('2026-08-01'),
        appliesFrom: f('2026-09-01'),
        separateFromBill: f(true),
        priceChanges: Array.from({ length: MAX_AGREED_PRICES }, () => ({
          term: 'energy',
          period: 'p1',
          before: 0.129876,
          after: 0.141234,
          unit: 'per_kwh',
          confidence: 'high',
        })),
      },
    }),
    electricity_bill: {
      bills: Array.from({ length: MAX_BILLS }, (_, i) =>
        usual({
          document: bill(i),
          retailerName: named('Comercializadora Inventada, S.A.', 80),
          market: 'free',
          invoiceNumber: named('FE26-000000123', 40),
          issuedOn: `2026-${month(i)}-05`,
          dueOn: `2026-${month(i)}-20`,
          readingFrom: `2026-${month(i)}-01`,
          readingTo: `2026-${month(i)}-28`,
          billedDays: 27,
          readingKind: 'real',
          supplyFingerprint: SYNTHETIC_SUPPLY_NUMBER,
          postcode: '28000',
          accessTariff: '2.0TD',
          selfConsumption: 'none',
          contractedPowerP1: 4.6,
          contractedPowerP2: 4.6,
          maxPowerUsedP1: 3.412,
          maxPowerUsedP2: 2.105,
          tollsAndChargesPower: 9.87,
          tollsAndChargesEnergy: 21.43,
          socialBonusFunding: 0.52,
          socialBonusCategory: 'vulnerable',
          socialBonusPercent: 42.5,
          socialBonusKwh: 131.25,
          socialBonusAmount: 18.32,
          excessPowerAmount: 1.23,
          electricityTaxBase: 64.21,
          electricityTaxPercent: 5.11269632,
          electricityTaxAmount: 3.28,
          meterAmount: 0.72,
          meterDays: 27,
          meterPhase: 'single',
          exitPenaltyAmount: 12.5,
          vatBase: 68.21,
          vatPercent: 21,
          vatAmount: 14.32,
          total: 82.53,
          commitmentEndOn: '2027-01-10',
          confidence: 'high',
        }),
      ),
      powerLines: rows(MAX_POWER_LINES, 2, (i) => ({
        document: bill(i),
        period: 'p1',
        kw: 4.6,
        price: 0.075903,
        unit: 'per_kw_day',
        days: 27,
        amount: 9.43,
        confidence: 'high',
      })),
      energyLines: rows(MAX_ENERGY_LINES, 3, (i) => ({
        document: bill(i),
        period: 'p2',
        kwh: 131.25,
        price: 0.129876,
        amount: 17.05,
        confidence: 'high',
      })),
      otherLines: rows(MAX_OTHER_LINES, 1, (i) => ({
        document: bill(i),
        concept: named('Servicio de mantenimiento eléctrico', 80),
        kind: 'service',
        serviceLabel: 'maintenance',
        amount: 6.95,
        confidence: 'high',
      })),
    },
  };
}

// The same for a telecom read: a contract and a year of bills with every line.
export function telecomRecord(texts: 'largest' | 'typical'): Record<string, unknown> {
  const largest = texts === 'largest';
  const named = (name: string, limit: number) => (largest ? name.padEnd(limit, 'X') : name);
  const pages = [
    page(1, 'telecom_contract', 1),
    ...Array.from({ length: LIMITS.maxImages - 1 }, (_, i) =>
      page(i + 2, 'telecom_bill', 2 + Math.floor(i / 2)),
    ),
  ];
  return {
    pages,
    telecom_contract: {
      signedOn: f('2025-03-01'),
      operatorName: f(named('Operador Ficticio de Telecomunicaciones, S.A.', 80)),
      commitmentStartsOn: f('2025-03-01'),
      commitmentMonths: f(18),
      agreedPenalty: f(150),
      penaltyText: f(prose(largest ? 600 : 300)),
      handsetSubsidised: f(true),
      handsetValue: f(240),
      priceReviewText: f(prose(largest ? 600 : 300)),
      priceReviewIndex: f('ipc_plus'),
    },
    telecom_bill: {
      bills: Array.from({ length: MAX_TELECOM_BILLS }, (_, i) => ({
        document: 2 + i,
        operatorName: named('Operador Ficticio de Telecomunicaciones, S.A.', 80),
        issuedOn: `2026-${month(i)}-01`,
        periodFrom: `2026-${month(i)}-01`,
        periodTo: `2026-${month(i)}-28`,
        vatAmount: 9.45,
        total: 54.45,
        confidence: 'high',
      })),
      lines: Array.from({ length: MAX_TELECOM_LINES }, (_, i) => ({
        document: 2 + (i % MAX_TELECOM_BILLS),
        concept: named('Cuota mensual fibra y móvil', 80),
        kind: 'fixed_fee',
        from: `2026-${month(i)}-01`,
        to: `2026-${month(i)}-28`,
        amount: 45,
        confidence: 'high',
      })),
    },
  };
}
