import { describe, expect, it } from 'vitest';
import { EMPLOYMENT_PAGE_KINDS } from '../src/domain/documents';
import { EMPLOYMENT_SECTIONS } from '../src/domain/employment-schema';
import { parseReading, parseSection } from '../src/domain/extraction';
import {
  FINAL_PAY_READABILITY,
  toolInputSchema,
  type FieldSpec,
} from '../src/domain/extraction-schema';
import { employmentRecord } from './support/employment-largest';
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

const schema = toolInputSchema('employment');
const pageItem = properties(schema)['pages']?.['items'];
const contract = properties(properties(schema)['employment_contract']);

// Every field and list item of every employment section, with its description.
const ALL_FIELDS: readonly [string, FieldSpec | { description: string }][] = Object.values(
  EMPLOYMENT_SECTIONS,
).flatMap((section) => [
  ...Object.entries(section.fields as Record<string, FieldSpec>),
  ...Object.entries(section.lists).flatMap(([name, list]) => [
    [name, list] as [string, { description: string }],
    ...Object.entries(list.item),
  ]),
]);

describe('the employment tool schema', () => {
  it('is closed at every level', () => {
    for (const o of objects(schema)) expect(o['additionalProperties']).toBe(false);
  });

  it('asks for every page’s kind, then one optional section per kind of document', () => {
    expect(schema['required']).toEqual(['pages']);
    expect(Object.keys(properties(schema))).toEqual([
      'pages',
      'employment_contract',
      'job_offer',
      'employment_payslips',
      'employment_work_history',
    ]);
    expect(properties(pageItem)['kind']?.['enum']).toEqual(EMPLOYMENT_PAGE_KINDS);
    expect(properties(properties(pageItem)['readability'])['value']?.['enum']).toEqual(
      FINAL_PAY_READABILITY,
    );
  });

  it('classifies a settlement in the pack as such, and reads nothing from it', () => {
    expect(EMPLOYMENT_PAGE_KINDS).toContain('settlement_proposal');
    for (const section of Object.values(EMPLOYMENT_SECTIONS))
      expect(['employment_contract', 'job_offer', 'payslip', 'work_history']).toContain(
        section.source,
      );
  });

  it.each([
    ['employment_contract', 'salaryParts', 12],
    ['employment_contract', 'clauses', 10],
    ['employment_contract', 'information', 17],
    ['employment_contract', 'relationshipHints', 3],
    ['employment_payslips', 'payslips', 6],
    ['employment_payslips', 'lines', 60],
    ['employment_work_history', 'contracts', 15],
  ])('caps %s.%s at %i rows', (section, list, max) => {
    expect(properties(properties(schema)[section])[list]?.['maxItems']).toBe(max);
  });

  it.each([
    ['employment_contract', 'causeText', 600],
    ['employment_contract', 'scheduleText', 400],
    ['employment_contract', 'modalityText', 120],
    ['employment_contract', 'companyName', 80],
    ['employment_contract', 'agreementName', 160],
    ['employment_contract', 'agreementCode', 14],
    ['employment_contract', 'companyTaxId', 12],
    ['employment_contract', 'category', 80],
    ['job_offer', 'position', 80],
  ])('keeps %s.%s to %i characters', (section, name, max) => {
    const value = properties(properties(properties(schema)[section])[name])['value'];
    expect(value?.['maxLength']).toBe(max);
  });

  it('describes hours as decimals and months as YYYY-MM', () => {
    expect(properties(contract['weeklyHours'])['value']).toEqual({
      type: 'number',
      minimum: 0,
      maximum: 168,
    });
    const line = properties(
      properties(properties(schema)['employment_payslips'])['lines']?.['items'],
    );
    expect(line['month']).toMatchObject({ type: 'string', pattern: '^[0-9]{4}-[0-9]{2}$' });
  });

  it('asks for literal texts word for word and never for a verdict on them', () => {
    expect(String(contract['causeText']?.['description'])).toContain('Word for word');
    const text = JSON.stringify(schema).toLowerCase();
    for (const word of ['abusiv', 'valid', 'illegal', 'lawful', 'justified'])
      expect(text).not.toContain(word);
  });

  it('never asks for deductions, union dues or what an incident was', () => {
    const text = JSON.stringify(schema).toLowerCase();
    for (const word of ['sindical', 'union', 'sick', 'baja médica', 'irpf'])
      expect(text).not.toContain(word);
    const payslip = properties(
      properties(properties(schema)['employment_payslips'])['payslips']?.['items'],
    );
    expect(payslip['incidents']).toMatchObject({ type: 'boolean' });
  });
});

describe('what the employment schema never asks for', () => {
  // Names of a company or an agreement are not a person's; the merge drops an employer's name
  // unless it is a company's.
  const NAMES = ['companyName', 'employerName', 'agreementName'];
  const FORBIDDEN_NAMES =
    /dni|^nie|nie$|naf|nif|passport|affiliat|surname|(person|worker|full|replaced)Name$|contractKey|clave|workerId|address|domicil|postcode|phone|email|iban|bank|signature|disab|discapac|health|sick|union|leave|birth/i;
  const FORBIDDEN_TEXT =
    /\bdni\b|\bnie\b|\bnaf\b|\bnif\b|n[uú]mero de afiliaci|seguridad social n|domicilio|address|discapacidad|disabilit|minusval|salud|health|sindical|tipo de baja|maternidad|paternidad/i;

  it.each(ALL_FIELDS.map(([name, spec]) => [name, spec.description]))(
    'has no field for who the worker is: %s',
    (name, description) => {
      expect(name).not.toMatch(FORBIDDEN_NAMES);
      if (/name/i.test(name) && !/Named$/.test(name)) expect(NAMES).toContain(name);
      expect(description).not.toMatch(FORBIDDEN_TEXT);
    },
  );

  it('walks every field of every section', () => {
    expect(ALL_FIELDS.length).toBeGreaterThan(70);
    expect(ALL_FIELDS.map(([name]) => name)).toEqual(
      expect.arrayContaining(['causeText', 'concept', 'employerName', 'literal']),
    );
  });

  it('keeps a company’s tax number, never a person’s DNI or NIE', () => {
    const tax = (value: string) =>
      parseSection(EMPLOYMENT_SECTIONS.employment_contract, { companyTaxId: f(value) }).section
        .fields;
    expect(tax('B00000000')).toEqual({ companyTaxId: f('B00000000') });
    for (const id of ['00000000T', 'X0000000T', '12345678A']) expect(tax(id)).toEqual({});
  });

  it('keeps an employer’s account code, never a worker’s Social Security number', () => {
    const account = (accountCode: string) =>
      parseSection(EMPLOYMENT_SECTIONS.employment_work_history, {
        contracts: [{ startDate: '2024-01-01', accountCode, confidence: 'high' }],
      }).section.lists['contracts'];
    expect(account('28/0000000/00')).toHaveLength(1);
    expect(account('28 12345678 90')).toEqual([]);
  });
});

describe('an employment reading', () => {
  it('takes employment and final-pay page kinds, and no rental ones', () => {
    const reading = parseReading(
      {
        pages: [
          page(1, 'employment_contract'),
          page(2, 'settlement_proposal'),
          page(3, 'lease'),
          page(4, 'other', 4, 'high', undefined, 'not_rental_document'),
        ],
      },
      4,
      'employment',
    );
    expect(reading.pages.map((p) => p.kind)).toEqual([
      'employment_contract',
      'settlement_proposal',
    ]);
    expect(reading.unclassified).toBe(2);
  });

  it('reads the largest record the schema allows without dropping anything', () => {
    const reading = parseReading(employmentRecord(), 25, 'employment');
    expect(reading.dropped).toBe(0);
    expect(reading.sections.employment_payslips?.lists['lines']).toHaveLength(60);
  });

  it.each([
    ['an agreement code that is no REGCON code', { agreementCode: f('00000000T') }],
    ['weekly hours with three decimals', { weeklyHours: f(37.125) }],
    ['weekly hours past a week', { weeklyHours: f(169) }],
    ['a modality off the list', { modality: f('obra') }],
    ['a region that is no community', { workplaceRegion: f('Bizkaia') }],
    ['a cause longer than 600 characters', { causeText: f('a'.repeat(601)) }],
  ])('drops %s', (_, fields) => {
    const { section, dropped } = parseSection(EMPLOYMENT_SECTIONS.employment_contract, fields);
    expect(section.fields).toEqual({});
    expect(dropped).toBe(1);
  });

  it('drops a payslip line without its month and counts it', () => {
    const { section, dropped } = parseSection(EMPLOYMENT_SECTIONS.employment_payslips, {
      lines: [
        { concept: 'SALARIO BASE', amount: 600, category: 'salary', confidence: 'high' },
        {
          month: '2026-03',
          concept: 'SALARIO BASE',
          amount: 600,
          category: 'salary',
          confidence: 'high',
        },
      ],
    });
    expect(section.lists['lines']).toHaveLength(1);
    expect(dropped).toBe(1);
  });
});
