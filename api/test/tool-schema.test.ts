import { describe, expect, it } from 'vitest';
import { PAGE_KINDS } from '../src/domain/documents';
import {
  READABILITY,
  SECTION_KINDS,
  SECTIONS,
  toolInputSchema,
} from '../src/domain/extraction-schema';

function objects(node: unknown, found: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(node)) node.forEach((n) => objects(n, found));
  else if (typeof node === 'object' && node !== null) {
    const record = node as Record<string, unknown>;
    if (record['type'] === 'object') found.push(record);
    Object.values(record).forEach((n) => objects(n, found));
  }
  return found;
}

const properties = (schema: unknown) =>
  (schema as { properties: Record<string, Record<string, unknown>> }).properties;

describe('toolInputSchema', () => {
  it('is closed at every level', () => {
    const all = objects(toolInputSchema());
    expect(all.length).toBeGreaterThan(SECTION_KINDS.length);
    for (const o of all) expect(o['additionalProperties']).toBe(false);
  });

  it('asks for every page’s kind, then one optional section per kind of document', () => {
    const schema = toolInputSchema();
    expect(schema['required']).toEqual(['pages']);
    expect(Object.keys(properties(schema))).toEqual(['pages', ...SECTION_KINDS]);
    const page = properties(schema)['pages']?.['items'];
    expect(properties(page)['kind']?.['enum']).toEqual(PAGE_KINDS);
    expect((page as Record<string, unknown>)['required']).toEqual([
      'page',
      'kind',
      'document',
      'readability',
      'confidence',
    ]);
  });

  it('asks every page why it can’t be read, from a closed list with a confidence', () => {
    const page = properties(properties(toolInputSchema())['pages']?.['items']);
    const readability = page['readability'];
    expect(readability?.['required']).toEqual(['value', 'confidence']);
    expect(properties(readability)).toMatchObject({
      value: { enum: READABILITY },
      confidence: { enum: ['high', 'medium', 'low'] },
    });
    expect(READABILITY).toEqual([
      'ok',
      'handwritten',
      'blurry',
      'dark',
      'cropped',
      'not_labour_document',
      'foreign_jurisdiction',
      'unknown_format',
    ]);
    const description = String(readability?.['description']);
    for (const reason of READABILITY) expect(description).toMatch(new RegExp(`\\b${reason}\\b`));
    expect(description).toContain('never because of its language');
  });

  it.each(SECTION_KINDS)('lists exactly the %s fields and lists', (kind) => {
    const section = properties(toolInputSchema())[kind];
    expect(Object.keys(properties(section)).sort()).toEqual(
      [...Object.keys(SECTIONS[kind].fields), ...Object.keys(SECTIONS[kind].lists)].sort(),
    );
  });

  it('asks for a value and a confidence for every field', () => {
    const proposal = properties(properties(toolInputSchema())['settlement_proposal']);
    expect(proposal['severance']?.['required']).toEqual(['value', 'confidence']);
    expect(proposal['cause']?.['properties']).toMatchObject({
      value: { enum: expect.arrayContaining(['resignation', 'objective_dismissal']) },
      confidence: { enum: ['high', 'medium', 'low'] },
    });
  });

  it('tells a settlement notification and a company certificate by what they show', () => {
    const kind = properties(properties(toolInputSchema())['pages']?.['items'])['kind'];
    const description = String(kind?.['description']);
    expect(description).toContain('liquidación, saldo y finiquito');
    expect(description).toContain('with or without amounts');
    expect(description).toContain('bases de cotización de los últimos 180 días');
    expect(description).toContain('never a payslip');
    const monthly = properties(properties(toolInputSchema())['monthly_payslip']);
    expect(String(monthly['extraPayProrated']?.['description'])).toContain('PP PAGAS EXTRAS');
  });

  it('asks a settlement for each item’s own amount, and tells gross from net', () => {
    const proposal = properties(properties(toolInputSchema())['settlement_proposal']);
    expect(String(proposal['pending_salary']?.['description'])).toContain(
      'Never another line’s amount, never a total.',
    );
    expect(String(proposal['totalGross']?.['description'])).toContain('GROSS');
    expect(String(proposal['totalNet']?.['description'])).toContain('NET');
    expect(proposal).not.toHaveProperty('totalAccrued');
  });

  it('never asks for union dues, sick leave or who anyone is', () => {
    const text = JSON.stringify(toolInputSchema()).toLowerCase();
    for (const word of ['sindical', 'union', 'sick', 'baja médica', ' it ', 'name', 'dni', 'nif'])
      expect(text).not.toContain(word);
  });
});
