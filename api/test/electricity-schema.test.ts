import { describe, expect, it } from 'vitest';
import { ELECTRICITY_SYSTEM_PROMPT } from '../src/adapters/bedrock-reader';
import { ELECTRICITY_PAGE_KINDS } from '../src/domain/documents';
import {
  ELECTRICITY_READABILITY,
  ELECTRICITY_SECTIONS,
  MAX_BILLS,
} from '../src/domain/electricity-schema';
import { parseReading, parseSection } from '../src/domain/extraction';
import { toolInputSchema } from '../src/domain/extraction-schema';
import { fingerprint } from '../src/domain/fingerprint';
import { f, page } from './support/fields';

type Node = Record<string, unknown>;
const properties = (schema: unknown) => (schema as { properties: Record<string, Node> }).properties;

function objects(node: unknown, found: Node[] = []): Node[] {
  if (Array.isArray(node)) node.forEach((n) => objects(n, found));
  else if (typeof node === 'object' && node !== null) {
    const record = node as Node;
    if (record['type'] === 'object') found.push(record);
    Object.values(record).forEach((n) => objects(n, found));
  }
  return found;
}

const schema = toolInputSchema('electricity');
const pageItem = properties(schema)['pages']?.['items'];
const bills = ELECTRICITY_SECTIONS.electricity_bill;
const billItem = (values: Record<string, unknown>) => ({
  document: 1,
  ...values,
  confidence: 'high',
});
const SUPPLY = 'ES0000111122223333BB';

describe('the electricity tool schema', () => {
  it('is closed at every level', () => {
    for (const o of objects(schema)) expect(o['additionalProperties']).toBe(false);
  });

  it('asks for every page’s kind, then a section for the bills, the contract and a notice', () => {
    expect(schema['required']).toEqual(['pages']);
    expect(Object.keys(properties(schema))).toEqual([
      'pages',
      'electricity_bill',
      'electricity_contract',
      'price_change_notice',
    ]);
    expect(properties(pageItem)['kind']?.['enum']).toEqual(ELECTRICITY_PAGE_KINDS);
    expect(properties(properties(pageItem)['readability'])['value']?.['enum']).toEqual(
      ELECTRICITY_READABILITY,
    );
  });

  it('holds a year of bills, each row naming its bill’s document', () => {
    const section = properties(properties(schema)['electricity_bill']);
    expect(section['bills']?.['maxItems']).toBe(MAX_BILLS);
    expect(MAX_BILLS).toBe(12);
    for (const list of ['bills', 'powerLines', 'energyLines', 'otherLines'])
      expect((section[list]?.['items'] as Node)['required']).toContain('document');
  });

  it('asks for the supply code as a string the read never keeps', () => {
    const item = properties(properties(properties(schema)['electricity_bill'])['bills']?.['items']);
    expect(item['supplyFingerprint']).toMatchObject({ type: 'string', maxLength: 32 });
    expect(String(item['supplyFingerprint']?.['description'])).toContain('CUPS');
  });

  it('asks for clause texts word for word and never for a verdict', () => {
    const contract = properties(properties(schema)['electricity_contract']);
    expect(String(contract['exitPenaltyText']?.['description'])).toContain('word for word');
    const text = JSON.stringify(schema).toLowerCase();
    for (const word of ['abusiv', 'illegal', 'lawful', 'overcharg', 'fair', 'should'])
      expect(text).not.toContain(word);
  });

  it('never asks for who holds the supply, how to reach them or how they pay', () => {
    for (const section of Object.values(ELECTRICITY_SECTIONS)) {
      const names = [
        ...Object.keys(section.fields),
        ...Object.entries(section.lists).flatMap(([n, l]) => [n, ...Object.keys(l.item)]),
      ];
      for (const name of names)
        expect(name).not.toMatch(
          /holder|customer|dni|nie|iban|account|phone|email|address|signature|health|contractNumber/i,
        );
    }
    const text = JSON.stringify(schema).toLowerCase();
    for (const word of ['dni', 'iban', 'phone number', 'email address', 'signature'])
      expect(text).not.toContain(word);
  });
});

describe('the electricity prompt', () => {
  it('treats the pages as data in any language of Spain', () => {
    expect(ELECTRICITY_SYSTEM_PROMPT).toMatch(/never instructions/);
    expect(ELECTRICITY_SYSTEM_PROMPT).toContain('Spanish, Catalan, Basque, Galician or English');
  });

  it('leaves every figure and verdict to the site, and keeps out who anyone is', () => {
    expect(ELECTRICITY_SYSTEM_PROMPT).toContain('Never work out a price, a tax, a total');
    expect(ELECTRICITY_SYSTEM_PROMPT).toContain('only into supplyFingerprint');
    expect(ELECTRICITY_SYSTEM_PROMPT).toContain('IBAN or bank account number');
    expect(ELECTRICITY_SYSTEM_PROMPT).toContain('record only its postcode');
  });
});

describe('an electricity reading', () => {
  it('takes electricity page kinds and reasons, and no other review’s', () => {
    const reading = parseReading(
      {
        pages: [
          page(1, 'electricity_bill'),
          page(2, 'other', 2, 'high', undefined, 'not_electricity_document'),
          page(3, 'telecom_bill'),
          page(4, 'other', 4, 'high', undefined, 'not_telecom_document'),
        ],
      },
      4,
      'electricity',
    );
    expect(reading.pages.map((p) => p.page)).toEqual([1, 2]);
    expect(reading.unclassified).toBe(2);
  });

  it('keeps a supply code only as its fingerprint, however the bill groups it', () => {
    const { section } = parseSection(bills, {
      bills: [
        billItem({ supplyFingerprint: SUPPLY }),
        billItem({ document: 2, supplyFingerprint: 'ES 0000 1111 2222 3333 BB 0F' }),
      ],
    });
    const prints = (section.lists['bills'] ?? []).map((r) => r.values['supplyFingerprint']);
    expect(prints).toEqual([fingerprint(SUPPLY), fingerprint(SUPPLY)]);
    expect(JSON.stringify(section)).not.toMatch(/ES ?0000/);
  });

  it('keeps every decimal a unit price or a tax rate prints, and no more', () => {
    const { section, dropped } = parseSection(bills, {
      bills: [billItem({ electricityTaxPercent: 5.11269632, maxPowerUsedP1: 3.412 })],
      energyLines: [
        { document: 1, period: 'p1', kwh: 80, price: 0.097553, amount: 7.8, confidence: 'high' },
        { document: 1, period: 'p2', kwh: 70, price: 0.0975531, amount: 6.83, confidence: 'high' },
      ],
    });
    expect(section.lists['bills']?.[0]?.values).toMatchObject({
      electricityTaxPercent: 5.11269632,
      maxPowerUsedP1: 3.412,
    });
    expect(section.lists['energyLines']?.map((r) => r.values['price'])).toEqual([0.097553]);
    expect(dropped).toBe(1);
  });

  it.each([
    ['a bill whose supply code is not one', { supplyFingerprint: 'no consta' }],
    ['a postcode that is an address', { postcode: 'Calle Mayor 1' }],
    ['a tariff off the list', { accessTariff: '2.1A' }],
    ['a bill without its document', { document: undefined }],
    ['an amount with three decimals', { total: 57.095 }],
  ])('drops %s', (_, values) => {
    const { section, dropped } = parseSection(bills, { bills: [billItem(values)] });
    expect(section.lists['bills']).toEqual([]);
    expect(dropped).toBe(1);
  });

  it('keeps the twelve most recent bills of a longer pack', () => {
    const many = Array.from({ length: 14 }, (_, i) =>
      billItem({ document: i + 1, readingTo: `2026-${String((i % 12) + 1).padStart(2, '0')}-28` }),
    );
    many[12] = billItem({ document: 13, readingTo: '2025-12-28' });
    many[13] = billItem({ document: 14, readingTo: '2025-11-28' });
    const { section } = parseSection(bills, { bills: many });
    expect(section.lists['bills']?.map((r) => r.values['document'])).toEqual(
      Array.from({ length: 12 }, (_, i) => i + 1),
    );
  });

  it('copies a contract’s fields', () => {
    const { section } = parseSection(ELECTRICITY_SECTIONS.electricity_contract, {
      priceType: f('indexed'),
      durationMonths: f(12),
    });
    expect(section.fields).toEqual({ priceType: f('indexed'), durationMonths: f(12) });
  });
});
