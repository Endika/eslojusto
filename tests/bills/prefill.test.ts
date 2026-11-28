// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { readElectricityForm } from '../../src/bills/electricity/form';
import { electricityPrefill } from '../../src/bills/electricity/prefill';
import { electricityReading } from '../../src/bills/electricity/reading';
import { readTelecomForm } from '../../src/bills/telecom/form';
import { telecomPrefill } from '../../src/bills/telecom/prefill';
import type {
  Confidence,
  ElectricityExtraction,
  ExtractedRow,
  ExtractedValue,
  SourceKind,
  TelecomExtraction,
} from '../../src/documents/contract';
import { parseDate } from '../../src/engine/date';
import type { Translate } from '../../src/i18n/client';
import { juneBill, meter } from '../engine/bills/input';
import { pageTranslator } from '../support/page-strings';

const tr: Translate = pageTranslator('bills');
const TODAY = parseDate('2026-10-13');

const row = (
  values: Record<string, ExtractedValue>,
  confidence: Confidence = 'high',
  source: SourceKind = 'electricity_bill',
): ExtractedRow => ({ values, confidence, source });

// The June PVPC bill of the engine's tests, as the API reads it: the bill's own figures in its row
// of `bills`, its lines in the other lists by its document number.
const JUNE = {
  market: 'pvpc',
  issuedOn: '2026-07-02',
  dueOn: '2026-07-07',
  readingFrom: '2026-05-31',
  readingTo: '2026-06-30',
  billedDays: 30,
  supplyFingerprint: '0123456789abcdef',
  postcode: '28001',
  accessTariff: '2.0TD',
  selfConsumption: 'none',
  contractedPowerP1: 4.6,
  contractedPowerP2: 4.6,
  maxPowerUsedP1: 3.1,
  maxPowerUsedP2: 1.2,
  tollsAndChargesPower: 10.75,
  tollsAndChargesEnergy: 8.3,
  socialBonusFunding: 0.6,
  electricityTaxPercent: 5.11269632,
  electricityTaxAmount: 2.4,
  meterAmount: 0.8,
  meterPhase: 'single',
  vatPercent: 21,
  vatAmount: 10.55,
  total: 60.77,
};
const linesOf = (document: number) => ({
  powerLines: [
    row({ document, period: 'p1', kw: 4.6, price: 30.817413, unit: 'per_kw_year', amount: 11.65 }),
    row({ document, period: 'p2', kw: 4.6, price: 0.725423, unit: 'per_kw_year', amount: 0.27 }),
  ],
  energyLines: [
    row({ document, period: 'p1', kwh: 60, price: 0.2, amount: 12 }),
    row({ document, period: 'p2', kwh: 70, price: 0.15, amount: 10.5 }),
    row({ document, period: 'p3', kwh: 120, price: 0.1, amount: 12 }),
  ],
});

const extraction = (e: Partial<ElectricityExtraction>): ElectricityExtraction => ({
  pages: [],
  documents: [],
  fields: {},
  conflicts: [],
  bills: [],
  powerLines: [],
  energyLines: [],
  otherLines: [],
  agreedPrices: [],
  services: [],
  priceChanges: [],
  ...e,
});

const june = extraction({ bills: [row({ document: 1, ...JUNE })], ...linesOf(1) });

// What only the person can say: whether the retailer is a reference one, who holds the contract,
// whether the meter is theirs and that the bill has no bonus, service, excess, penalty or
// regularisation, which a bill read never says by leaving a line out.
const PERSON = {
  retailer: 'reference',
  holder: 'person',
  meterOwned: 'no',
  hasBonus: 'no',
  serviceCount: '0',
  hasExcess: 'no',
  hasPenalty: 'no',
  regularization: 'none',
};

function form(entries: readonly (readonly [string, string])[]): HTMLFormElement {
  const el = document.createElement('form');
  for (const [name, value] of [...entries, ...Object.entries(PERSON)]) {
    const input = document.createElement('input');
    input.name = name;
    input.value = value;
    el.append(input);
  }
  return el;
}

describe('a read of electricity bills', () => {
  it('fills the form so that, with what only the person says, it reads the bill as typed', () => {
    const [bill] = electricityPrefill(june, tr).bills;
    expect(bill?.fingerprint).toBe('0123456789abcdef');
    expect(readElectricityForm(form(bill?.entries ?? []), TODAY)).toEqual({
      input: juneBill({
        electricityTax: { base: null, percent: 5.11269632, amount: 2.4 },
        vat: { base: null, percent: 21, amount: 10.55 },
        readingKind: null,
        meter: meter({ supplyPhase: null }),
      }),
    });
  });

  it('reads one line for all the energy as a single price, never as one period', () => {
    const [bill] = electricityPrefill(
      extraction({
        bills: [row({ document: 1, ...JUNE })],
        powerLines: linesOf(1).powerLines,
        energyLines: [row({ document: 1, period: 'all', kwh: 250, price: 0.138, amount: 34.5 })],
      }),
      tr,
    ).bills;
    expect(bill?.entries).toEqual(
      expect.arrayContaining([
        ['energyPricing', 'single'],
        ['kwhAll', '250'],
        ['energyPriceAll', '0,138'],
        ['energyAmountAll', '34,50'],
      ]),
    );
    expect(bill?.entries.some(([name]) => name === 'kwhP1')).toBe(false);
  });
});

describe('the electricity reading, one bill at a time', () => {
  const pack = extraction({
    bills: [
      row({ document: 1, ...JUNE }),
      row({ document: 2, ...JUNE, readingFrom: '2026-06-30', readingTo: '2026-07-30' }),
      row({ document: 3, ...JUNE, readingFrom: '2026-07-30', readingTo: '2026-08-29' }),
    ],
  });

  it('fills the form with the oldest and keeps the rest in turn', () => {
    const reading = electricityReading(document.createElement('form'), tr);
    const first = reading.prefill(pack, {}, []);
    expect(first.entries).toContainEqual(['readingTo', '2026-06-30']);
    expect(reading.pending()).toBe(2);
    expect(reading.fingerprint()).toBe('0123456789abcdef');
    expect(reading.next()?.to).toBe('2026-07-30');
    expect(reading.pending()).toBe(1);
    reading.typed();
    expect(reading.fingerprint()).toBeNull();
  });

  it('puts a bill read and not yet reviewed back in turn when another read comes', () => {
    const reading = electricityReading(document.createElement('form'), tr);
    reading.prefill(pack, {}, []);
    reading.prefill(
      extraction({
        bills: [row({ document: 1, ...JUNE, readingTo: '2026-09-30', readingFrom: '2026-08-29' })],
      }),
      {},
      [],
    );
    expect(reading.pending()).toBe(3);
    reading.reviewed();
    reading.prefill(pack, {}, []);
    expect(reading.pending()).toBe(5);
  });
});

const telecom = (e: Partial<TelecomExtraction>): TelecomExtraction => ({
  pages: [],
  documents: [],
  fields: {},
  conflicts: [],
  bills: [],
  lines: [],
  ...e,
});
const contract = (value: ExtractedValue, confidence: Confidence = 'high') => ({
  value,
  confidence,
  source: 'telecom_contract' as const,
});

describe('a read of a phone contract and its bills', () => {
  it('fills the commitment and the penalty charged, leaving the exit to the person', () => {
    const p = telecomPrefill(
      telecom({
        fields: {
          commitmentStartsOn: contract('2025-03-01'),
          commitmentMonths: contract(18),
          agreedPenalty: contract(180),
          penaltyText: contract(
            'Si causas baja antes de 18 meses pagarás la parte proporcional de 180 euros.',
          ),
        },
        lines: [
          row(
            { document: 1, kind: 'penalty', concept: 'Penalización', amount: 100 },
            'high',
            'telecom_bill',
          ),
          row(
            { document: 1, kind: 'penalty', concept: 'Penalización', amount: 20 },
            'medium',
            'telecom_bill',
          ),
          row(
            { document: 1, kind: 'fixed_fee', concept: 'Cuota', amount: 30 },
            'high',
            'telecom_bill',
          ),
        ],
      }),
      tr,
    );
    const el = document.createElement('form');
    for (const [name, value] of [
      ...p.entries,
      ['exitRequestedOn', '2026-03-01'],
      ['change', 'none'],
      ['chargedAfter', 'no'],
    ]) {
      const input = document.createElement('input');
      input.name = name ?? '';
      input.value = value ?? '';
      el.append(input);
    }
    expect(readTelecomForm(el, TODAY)).toMatchObject({
      input: {
        commitment: { startedOn: parseDate('2025-03-01'), months: 18, agreedPenalty: 180 },
        penaltyCharged: 120,
      },
    });
    expect(p.marks.find((m) => m.id === 'penaltyCharged')).toMatchObject({
      confidence: 'medium',
      derived: true,
    });
    expect(p.quotes.agreedPenalty).toContain('parte proporcional');
  });
});
