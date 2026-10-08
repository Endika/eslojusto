import { describe, expect, it } from 'vitest';
import { RENTAL_PAGE_KINDS } from '../src/domain/documents';
import { parseReading, parseSection } from '../src/domain/extraction';
import { toolInputSchema } from '../src/domain/extraction-schema';
import { RENTAL_READABILITY, RENTAL_SECTIONS } from '../src/domain/rental-schema';
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

const schema = toolInputSchema('rental');
const pageItem = properties(schema)['pages']?.['items'];

describe('the rental tool schema', () => {
  it('is closed at every level', () => {
    for (const o of objects(schema)) expect(o['additionalProperties']).toBe(false);
  });

  it('asks for every page’s kind, then one optional section per kind of rental document', () => {
    expect(schema['required']).toEqual(['pages']);
    expect(Object.keys(properties(schema))).toEqual([
      'pages',
      'lease',
      'rent_update_notice',
      'rent_receipt',
      'agency_invoice',
      'deposit_return',
    ]);
    expect(properties(pageItem)['kind']?.['enum']).toEqual(RENTAL_PAGE_KINDS);
    expect(properties(properties(pageItem)['readability'])['value']?.['enum']).toEqual(
      RENTAL_READABILITY,
    );
    expect(properties(schema)['pages']?.['maxItems']).toBe(25);
  });

  it.each([
    ['lease', 'guarantees', 5],
    ['lease', 'charges', 10],
    ['lease', 'utilities', 6],
    ['rent_update_notice', 'notices', 8],
    ['rent_receipt', 'receipts', 36],
    ['agency_invoice', 'invoices', 4],
    ['deposit_return', 'returns', 4],
    ['deposit_return', 'deductions', 10],
  ])('caps %s.%s at %i rows', (section, list, max) => {
    expect(properties(properties(schema)[section])[list]?.['maxItems']).toBe(max);
  });

  it('lists exactly the lease fields', () => {
    expect(Object.keys(properties(properties(schema)['lease']))).toEqual([
      'signedOn',
      'startDate',
      'postcode',
      'landlordType',
      'landlordCompanyName',
      'agencyNamed',
      'use',
      'agreedMonths',
      'initialRent',
      'updateClauseText',
      'updateClauseIndex',
      'updateFixedPercent',
      'deposit',
      'advanceMonths',
      'necessityClause',
      'feesText',
      'chargesClauseText',
      'guarantees',
      'charges',
      'utilities',
    ]);
  });

  it('describes the new value types to the model', () => {
    const lease = properties(properties(schema)['lease']);
    const value = (name: string) => properties(lease[name])['value'];
    expect(value('agreedMonths')).toEqual({ type: 'integer', minimum: 1, maximum: 600 });
    expect(value('updateFixedPercent')).toEqual({ type: 'number', minimum: 0, maximum: 100 });
    expect(value('postcode')).toMatchObject({ pattern: '^[0-9]{5}$', maxLength: 5 });
    const receipt = properties(
      properties(properties(schema)['rent_receipt'])['receipts']?.['items'],
    );
    expect(receipt['month']).toMatchObject({ type: 'string', pattern: '^[0-9]{4}-[0-9]{2}$' });
  });

  it('asks for clause texts word for word and never for a verdict on them', () => {
    const text = JSON.stringify(schema);
    expect(
      String(properties(properties(schema)['lease'])['updateClauseText']?.['description']),
    ).toContain('word for word');
    for (const word of ['abusiv', 'valid', 'illegal', 'lawful']) expect(text).not.toContain(word);
  });

  it('never asks for who anyone is or how to reach them', () => {
    const text = JSON.stringify(schema).toLowerCase();
    for (const word of ['dni', 'nie', 'iban', 'phone', 'email address', 'signature'])
      expect(text).not.toContain(word);
  });
});

describe('a rental reading', () => {
  it('keeps no page numbered beyond what was attached, so no more than 25', () => {
    const pages = Array.from({ length: 26 }, (_, i) => page(i + 1, 'rent_receipt', 1));
    const reading = parseReading({ pages }, 25, 'rental');
    expect(reading.pages).toHaveLength(25);
    expect(reading.dropped).toBe(1);
  });

  it('takes rental page kinds and reasons, and no final-pay ones', () => {
    const reading = parseReading(
      {
        pages: [
          page(1, 'lease'),
          page(2, 'other', 2, 'high', undefined, 'not_rental_document'),
          page(3, 'payslip'),
          page(4, 'other', 4, 'high', undefined, 'not_labour_document'),
        ],
      },
      4,
      'rental',
    );
    expect(reading.pages.map((p) => p.page)).toEqual([1, 2]);
    expect(reading.unclassified).toBe(2);
  });

  it('drops rows beyond a list’s maximum and counts them', () => {
    const receipts = Array.from({ length: 38 }, (_, i) => ({
      month: `20${23 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`,
      total: 900,
      confidence: 'high',
    }));
    const { section, dropped } = parseSection(RENTAL_SECTIONS.rent_receipt, { receipts });
    expect(section.lists['receipts']).toHaveLength(36);
    expect(dropped).toBe(2);
  });

  it.each([
    ['a duration that is no whole number', { agreedMonths: f(12.5) }],
    ['a duration past fifty years', { agreedMonths: f(601) }],
    ['a percentage over 100', { updateFixedPercent: f(101) }],
    ['a percentage with three decimals', { updateFixedPercent: f(2.125) }],
    ['a postcode that is not five digits', { postcode: f('2899') }],
    ['a label off the list', { updateClauseIndex: f('euribor') }],
    ['a clause longer than 600 characters', { updateClauseText: f('a'.repeat(601)) }],
  ])('drops %s', (_, fields) => {
    const { section, dropped } = parseSection(RENTAL_SECTIONS.lease, fields);
    expect(section.fields).toEqual({});
    expect(dropped).toBe(1);
  });

  it('drops a receipt whose month is not a month', () => {
    const { section, dropped } = parseSection(RENTAL_SECTIONS.rent_receipt, {
      receipts: [
        { month: '2026-13', total: 900, confidence: 'high' },
        { month: '2026-01', total: 900, confidence: 'high' },
      ],
    });
    expect(section.lists['receipts']).toEqual([
      { values: { month: '2026-01', total: 900 }, confidence: 'high' },
    ]);
    expect(dropped).toBe(1);
  });
});
