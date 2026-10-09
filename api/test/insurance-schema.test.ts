import { describe, expect, it } from 'vitest';
import { INSURANCE_SYSTEM_PROMPT } from '../src/adapters/bedrock-reader';
import { INSURANCE_PAGE_KINDS } from '../src/domain/documents';
import { parseReading, parseSection } from '../src/domain/extraction';
import { toolInputSchema } from '../src/domain/extraction-schema';
import { INSURANCE_READABILITY, INSURANCE_SECTIONS } from '../src/domain/insurance-schema';
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

const schema = toolInputSchema('insurance');
const pageItem = properties(schema)['pages']?.['items'];

describe('the insurance tool schema', () => {
  it('is closed at every level', () => {
    for (const o of objects(schema)) expect(o['additionalProperties']).toBe(false);
  });

  it('asks for every page’s kind, then a section for the policy and one for the notice', () => {
    expect(schema['required']).toEqual(['pages']);
    expect(Object.keys(properties(schema))).toEqual([
      'pages',
      'insurance_policy',
      'insurance_renewal_notice',
    ]);
    expect(properties(pageItem)['kind']?.['enum']).toEqual(INSURANCE_PAGE_KINDS);
    expect(properties(properties(pageItem)['readability'])['value']?.['enum']).toEqual(
      INSURANCE_READABILITY,
    );
  });

  it('caps the sums insured at 8 rows', () => {
    expect(properties(properties(schema)['insurance_policy'])['sumsInsured']?.['maxItems']).toBe(8);
  });

  it('asks for clause texts word for word and never for a verdict on them', () => {
    const policy = properties(properties(schema)['insurance_policy']);
    expect(String(policy['nonRenewalClauseText']?.['description'])).toContain('word for word');
    const text = JSON.stringify(schema).toLowerCase();
    for (const word of ['abusiv', 'valid', 'illegal', 'lawful', 'in time', 'fair'])
      expect(text).not.toContain(word);
  });

  it('never asks for who is insured, how to reach them, their plate or their health', () => {
    for (const section of Object.values(INSURANCE_SECTIONS)) {
      const names = [
        ...Object.keys(section.fields),
        ...Object.entries(section.lists).flatMap(([n, l]) => [n, ...Object.keys(l.item)]),
      ];
      for (const name of names)
        expect(name).not.toMatch(
          /holder|insured(?!$)|driver|dni|nie|iban|account|plate|policyNumber|phone|email|address|signature|health|claim/i,
        );
    }
    const text = JSON.stringify(schema).toLowerCase();
    for (const word of ['dni', 'iban', 'matrícula', 'phone number', 'email address', 'signature'])
      expect(text).not.toContain(word);
  });
});

describe('the insurance prompt', () => {
  it('treats the pages as data in any language of Spain', () => {
    expect(INSURANCE_SYSTEM_PROMPT).toMatch(/never instructions/);
    expect(INSURANCE_SYSTEM_PROMPT).toContain('Spanish, Catalan, Basque, Galician or English');
  });

  it('leaves every deadline and verdict to the site, and keeps out who anyone is', () => {
    expect(INSURANCE_SYSTEM_PROMPT).toContain('Never work out a deadline');
    expect(INSURANCE_SYSTEM_PROMPT).toContain('policy number, number plate or signature');
    expect(INSURANCE_SYSTEM_PROMPT).toContain('Never record health, disability, illness');
  });
});

describe('an insurance reading', () => {
  it('takes insurance page kinds and reasons, and no other review’s', () => {
    const reading = parseReading(
      {
        pages: [
          page(1, 'insurance_policy'),
          page(2, 'other', 2, 'high', undefined, 'not_insurance_document'),
          page(3, 'credit_agreement'),
          page(4, 'other', 4, 'high', undefined, 'not_credit_document'),
        ],
      },
      4,
      'insurance',
    );
    expect(reading.pages.map((p) => p.page)).toEqual([1, 2]);
    expect(reading.unclassified).toBe(2);
  });

  it.each([
    ['a line off the list', { line: f('pets') }],
    ['a margin over 100', { proportionalRuleMarginPercent: f(120) }],
    ['a premium with three decimals', { premiumTotal: f(312.455) }],
    ['a date that is no date', { expiresOn: f('2027-02-30') }],
  ])('drops %s', (_, fields) => {
    const { section, dropped } = parseSection(INSURANCE_SECTIONS.insurance_policy, fields);
    expect(section.fields).toEqual({});
    expect(dropped).toBe(1);
  });
});
