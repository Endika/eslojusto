import { describe, expect, it } from 'vitest';
import { DOCUMENT_KINDS } from '../src/domain/documents';
import { SCHEMAS, toolInputSchema } from '../src/domain/extraction-schema';

function objects(node: unknown, found: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(node)) node.forEach((n) => objects(n, found));
  else if (typeof node === 'object' && node !== null) {
    const record = node as Record<string, unknown>;
    if (record['type'] === 'object') found.push(record);
    Object.values(record).forEach((n) => objects(n, found));
  }
  return found;
}

describe('toolInputSchema', () => {
  it.each(DOCUMENT_KINDS)('is closed at every level for %s', (kind) => {
    const all = objects(toolInputSchema(kind));
    expect(all.length).toBeGreaterThan(1);
    for (const o of all) expect(o['additionalProperties']).toBe(false);
  });

  it.each(DOCUMENT_KINDS)('lists exactly the %s fields and lists', (kind) => {
    const properties = toolInputSchema(kind)['properties'] as Record<string, unknown>;
    expect(Object.keys(properties).sort()).toEqual(
      [...Object.keys(SCHEMAS[kind].fields), ...Object.keys(SCHEMAS[kind].lists)].sort(),
    );
  });

  it('asks for a value and a confidence for every field', () => {
    const properties = toolInputSchema('settlement')['properties'] as Record<
      string,
      Record<string, unknown>
    >;
    expect(properties['severance']?.['required']).toEqual(['value', 'confidence']);
    expect(properties['cause']?.['properties']).toMatchObject({
      value: { enum: expect.arrayContaining(['resignation', 'objective_dismissal']) },
      confidence: { enum: ['high', 'medium', 'low'] },
    });
  });

  it('never asks for union dues or sick leave', () => {
    const text = JSON.stringify(DOCUMENT_KINDS.map(toolInputSchema)).toLowerCase();
    for (const word of ['sindical', 'union', 'sick', 'baja médica', ' it ', 'name', 'dni', 'nif'])
      expect(text).not.toContain(word);
  });
});
