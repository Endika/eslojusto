import { expect } from 'vitest';
import type { FieldSpec, SectionSchema } from '../../src/domain/extraction-schema';
import type { From } from '../../src/domain/merge';
import type { ExpectedValue } from '../../eval/schema';

interface Specs {
  // Each field of the response, read where its first source keeps it.
  readonly fields: Readonly<Record<string, FieldSpec | undefined>>;
  readonly lists: Readonly<Record<string, Readonly<Record<string, FieldSpec>> | undefined>>;
}

export function specsOf(
  sections: Readonly<Record<string, SectionSchema>>,
  rules: Readonly<Record<string, readonly From[]>>,
): Specs {
  const fields = Object.fromEntries(
    Object.entries(rules).map(([name, [first]]) => {
      if (first === undefined) return [name, undefined];
      const [section, field] = first;
      return [name, sections[section]?.fields[field === '' ? name : field]];
    }),
  );
  const lists = Object.fromEntries(
    Object.values(sections).flatMap((s) =>
      Object.entries(s.lists).map(([name, list]) => [name, list.item]),
    ),
  );
  return { fields, lists };
}

const decimalsOf = (n: number): number => (String(n).split('.')[1] ?? '').length;

// A value a read should give, of the type the schema asks the model for.
export function expectOfType(where: string, spec: FieldSpec | undefined, value: ExpectedValue) {
  expect(spec, where).toBeDefined();
  if (spec === undefined) return;
  const t = spec.type;
  const number = (min: number, max: number, decimals: number) => {
    expect(typeof value, where).toBe('number');
    if (typeof value !== 'number') return;
    expect(value, where).toBeGreaterThanOrEqual(min);
    expect(value, where).toBeLessThanOrEqual(max);
    expect(decimalsOf(value), where).toBeLessThanOrEqual(decimals);
  };
  switch (t.type) {
    case 'date':
      expect(value, where).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      break;
    case 'month':
      expect(value, where).toMatch(/^\d{4}-\d{2}$/);
      break;
    case 'text':
      expect(typeof value, where).toBe('string');
      expect(String(value).length, where).toBeLessThanOrEqual(t.maxLength);
      if (t.pattern !== undefined) expect(value, where).toMatch(new RegExp(t.pattern));
      break;
    case 'money':
      number(0, Number.MAX_SAFE_INTEGER, 2);
      break;
    case 'days':
      number(0, Number.MAX_SAFE_INTEGER, 0);
      break;
    case 'integer':
      number(t.min, t.max, 0);
      break;
    case 'decimal':
      number(t.min, t.max, t.decimals ?? 2);
      break;
    case 'percent':
      number(0, 100, 2);
      break;
    case 'rate':
      number(0, 100, 3);
      break;
    case 'boolean':
      expect(typeof value, where).toBe('boolean');
      break;
    case 'enum':
      expect(t.values, where).toContain(value);
      break;
    case 'fingerprint':
      expect(typeof value, where).toBe('string');
      break;
  }
}
