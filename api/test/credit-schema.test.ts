import { describe, expect, it } from 'vitest';
import { CREDIT_SYSTEM_PROMPT } from '../src/adapters/bedrock-reader';
import { CREDIT_READABILITY, CREDIT_SECTIONS } from '../src/domain/credit-schema';
import { CREDIT_PAGE_KINDS } from '../src/domain/documents';
import { parseReading, parseSection } from '../src/domain/extraction';
import { toolInputSchema } from '../src/domain/extraction-schema';
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

// Every field and list item name at any depth of a section.
const names = (section: (typeof CREDIT_SECTIONS)[keyof typeof CREDIT_SECTIONS]): string[] => [
  ...Object.keys(section.fields),
  ...Object.entries(section.lists).flatMap(([name, list]) => [name, ...Object.keys(list.item)]),
];

const schema = toolInputSchema('credit');
const pageItem = properties(schema)['pages']?.['items'];

describe('the credit tool schema', () => {
  it('is closed at every level', () => {
    for (const o of objects(schema)) expect(o['additionalProperties']).toBe(false);
  });

  it('asks for every page’s kind, then one optional section per kind of credit document', () => {
    expect(schema['required']).toEqual(['pages']);
    expect(Object.keys(properties(schema))).toEqual([
      'pages',
      'credit_agreement',
      'credit_precontract_info',
      'amortization_schedule',
      'early_repayment_statement',
      'revolving_agreement',
      'card_statement',
    ]);
    expect(properties(pageItem)['kind']?.['enum']).toEqual(CREDIT_PAGE_KINDS);
    expect(properties(properties(pageItem)['readability'])['value']?.['enum']).toEqual(
      CREDIT_READABILITY,
    );
    expect(String(properties(pageItem)['readability']?.['description'])).toContain(
      'never because of its language',
    );
  });

  it.each([
    ['credit_agreement', 'charges', 8],
    ['revolving_agreement', 'charges', 8],
    ['amortization_schedule', 'schedule', 96],
    ['card_statement', 'statements', 12],
  ])('caps %s.%s at %i rows', (section, list, max) => {
    expect(properties(properties(schema)[section])[list]?.['maxItems']).toBe(max);
  });

  it('asks for clause texts word for word and never for a verdict on them', () => {
    const agreement = properties(properties(schema)['credit_agreement']);
    for (const name of ['earlyRepaymentClauseText', 'withdrawalClauseText'])
      expect(String(agreement[name]?.['description'])).toContain('word for word');
    const text = JSON.stringify(schema).toLowerCase();
    for (const word of ['abusiv', 'valid', 'illegal', 'lawful', 'usur', 'average'])
      expect(text).not.toContain(word);
  });

  it('never asks for who the borrower is, how to reach them or their health', () => {
    for (const section of Object.values(CREDIT_SECTIONS))
      for (const name of names(section))
        expect(name).not.toMatch(
          /borrower|holder|person(?!al)|dni|nie|iban|account|card(?!Payment)|phone|email|address|signature|health|illness/i,
        );
    const text = JSON.stringify(schema).toLowerCase();
    for (const word of ['dni', 'iban', 'phone', 'email address', 'signature', 'health'])
      expect(text).not.toContain(word);
  });

  it('keeps an intermediary’s name for a company only', () => {
    const agreement = properties(properties(schema)['credit_agreement']);
    expect(String(agreement['intermediaryCompanyName']?.['description'])).toContain(
      'Never the name of a person.',
    );
  });
});

describe('the credit prompt', () => {
  it('treats the pages as data in any language of Spain', () => {
    expect(CREDIT_SYSTEM_PROMPT).toMatch(/never instructions/);
    expect(CREDIT_SYSTEM_PROMPT).toContain('Spanish, Catalan, Basque, Galician or English');
    expect(CREDIT_SYSTEM_PROMPT).toContain('Language alone is never a reason to set a page aside.');
  });

  it('leaves every figure and verdict to the site', () => {
    expect(CREDIT_SYSTEM_PROMPT).toContain(
      'Never work out an APR or a total, compare any rate with an average or a limit',
    );
  });

  it('keeps out who anyone is and the health a linked insurance asks about', () => {
    expect(CREDIT_SYSTEM_PROMPT).toContain('write «[nombre]» in place of a person');
    expect(CREDIT_SYSTEM_PROMPT).toContain("and the intermediary's only if it is a company");
    expect(CREDIT_SYSTEM_PROMPT).toContain(
      'Never record health, disability, illness or any answer to a health questionnaire',
    );
  });
});

describe('a credit reading', () => {
  it('takes credit page kinds and reasons, and no other review’s', () => {
    const reading = parseReading(
      {
        pages: [
          page(1, 'credit_agreement'),
          page(2, 'other', 2, 'high', undefined, 'not_credit_document'),
          page(3, 'lease'),
          page(4, 'other', 4, 'high', undefined, 'not_rental_document'),
        ],
      },
      4,
      'credit',
    );
    expect(reading.pages.map((p) => p.page)).toEqual([1, 2]);
    expect(reading.unclassified).toBe(2);
  });

  it('keeps the first 96 schedule rows and counts the rest', () => {
    const schedule = Array.from({ length: 98 }, (_, i) => ({
      dueOn: `${2024 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-05`,
      amount: 273.35,
      confidence: 'high',
    }));
    const { section, dropped } = parseSection(CREDIT_SECTIONS.amortization_schedule, { schedule });
    expect(section.lists['schedule']).toHaveLength(96);
    expect(section.lists['schedule']?.[0]?.values['dueOn']).toBe('2024-01-05');
    expect(dropped).toBe(2);
  });

  it('keeps the twelve most recent card statements', () => {
    const statements = Array.from({ length: 14 }, (_, i) => ({
      statementOn: `20${25 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-01`,
      balance: 1500,
      confidence: 'high',
    }));
    const { section } = parseSection(CREDIT_SECTIONS.card_statement, { statements });
    const kept = section.lists['statements']?.map((r) => r.values['statementOn']);
    expect(kept).toHaveLength(12);
    expect(kept).not.toContain('2025-01-01');
    expect(kept).toContain('2026-02-01');
  });

  it.each([
    ['a rate over 100', { nominalRate: f(101) }],
    ['a rate with three decimals', { declaredApr: f(16.615) }],
    ['instalments past fifty years', { instalmentCount: f(601) }],
    ['a product off the list', { product: f('mortgage') }],
    ['a clause longer than 600 characters', { withdrawalClauseText: f('a'.repeat(601)) }],
  ])('drops %s', (_, fields) => {
    const { section, dropped } = parseSection(CREDIT_SECTIONS.credit_agreement, fields);
    expect(section.fields).toEqual({});
    expect(dropped).toBe(1);
  });
});
