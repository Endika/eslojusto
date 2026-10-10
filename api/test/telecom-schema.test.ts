import { describe, expect, it } from 'vitest';
import { TELECOM_SYSTEM_PROMPT } from '../src/adapters/bedrock-reader';
import { TELECOM_PAGE_KINDS } from '../src/domain/documents';
import { parseReading, parseSection } from '../src/domain/extraction';
import { toolInputSchema } from '../src/domain/extraction-schema';
import { TELECOM_READABILITY, TELECOM_SECTIONS } from '../src/domain/telecom-schema';
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

const schema = toolInputSchema('telecom');
const pageItem = properties(schema)['pages']?.['items'];

describe('the telecom tool schema', () => {
  it('is closed at every level', () => {
    for (const o of objects(schema)) expect(o['additionalProperties']).toBe(false);
  });

  it('asks for every page’s kind, then a section for the bills and one for the contract', () => {
    expect(schema['required']).toEqual(['pages']);
    expect(Object.keys(properties(schema))).toEqual(['pages', 'telecom_bill', 'telecom_contract']);
    expect(properties(pageItem)['kind']?.['enum']).toEqual(TELECOM_PAGE_KINDS);
    expect(properties(properties(pageItem)['readability'])['value']?.['enum']).toEqual(
      TELECOM_READABILITY,
    );
  });

  it('labels a price review clause with a closed index beside its literal text', () => {
    const contract = properties(properties(schema)['telecom_contract']);
    expect(properties(contract['priceReviewIndex'])['value']?.['enum']).toEqual([
      'ipc',
      'ipc_plus',
      'fixed_amount',
      'none',
      'other',
    ]);
    expect(String(contract['priceReviewText']?.['description'])).toContain('word for word');
    expect(properties(contract['priceReviewText'])['value']?.['maxLength']).toBe(600);
  });

  it('never asks for a verdict, who the holder is or the numbers they called', () => {
    for (const section of Object.values(TELECOM_SECTIONS)) {
      const names = [
        ...Object.keys(section.fields),
        ...Object.entries(section.lists).flatMap(([n, l]) => [n, ...Object.keys(l.item)]),
      ];
      for (const name of names)
        expect(name).not.toMatch(
          /holder|customer|dni|nie|iban|account|phone|email|address|signature|imei|health/i,
        );
    }
    const text = JSON.stringify(schema).toLowerCase();
    for (const word of ['abusiv', 'illegal', 'lawful', 'dni', 'iban', 'signature'])
      expect(text).not.toContain(word);
  });
});

describe('the telecom prompt', () => {
  it('treats the pages as data in any language of Spain', () => {
    expect(TELECOM_SYSTEM_PROMPT).toMatch(/never instructions/);
    expect(TELECOM_SYSTEM_PROMPT).toContain('Spanish, Catalan, Basque, Galician or English');
  });

  it('leaves every penalty and verdict to the site, and keeps out who anyone is', () => {
    expect(TELECOM_SYSTEM_PROMPT).toContain('Never work out a penalty');
    expect(TELECOM_SYSTEM_PROMPT).toContain('any number called');
    expect(TELECOM_SYSTEM_PROMPT).toContain('IMEI');
  });
});

describe('a telecom reading', () => {
  it('takes telecom page kinds and reasons, and no other review’s', () => {
    const reading = parseReading(
      {
        pages: [
          page(1, 'telecom_contract'),
          page(2, 'other', 2, 'high', undefined, 'not_telecom_document'),
          page(3, 'electricity_bill'),
        ],
      },
      3,
      'telecom',
    );
    expect(reading.pages.map((p) => p.page)).toEqual([1, 2]);
    expect(reading.unclassified).toBe(1);
  });

  it.each([
    ['a commitment over five years', { commitmentMonths: f(72) }],
    ['an index off the list', { priceReviewIndex: f('euribor') }],
    ['a penalty with three decimals', { agreedPenalty: f(150.005) }],
  ])('drops %s', (_, fields) => {
    const { section, dropped } = parseSection(TELECOM_SECTIONS.telecom_contract, fields);
    expect(section.fields).toEqual({});
    expect(dropped).toBe(1);
  });
});
