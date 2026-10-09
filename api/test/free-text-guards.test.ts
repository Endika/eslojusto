import { describe, expect, it } from 'vitest';
import { creditMerge } from '../src/domain/credit-merge';
import { CREDIT_SECTIONS } from '../src/domain/credit-schema';
import { parseReading } from '../src/domain/extraction';
import type { FieldSpec, SectionSchema } from '../src/domain/extraction-schema';
import { insuranceMerge } from '../src/domain/insurance-merge';
import { INSURANCE_SECTIONS } from '../src/domain/insurance-schema';
import type { ReviewKind } from '../src/domain/reviews';
import { f, page } from './support/fields';

// Every text the credit and the insurance schema let the model copy, walked from the schemas
// themselves: a text field added later is covered without naming it here. Made-up values only.
const CLEAN = 'Texto copiado del documento';
const LEAKS = [
  ['a DNI', 'Firmado por el titular, DNI 12345678A'],
  ['an IBAN', 'Cargo en ES00 2100 0418 4502 0005 1332'],
  ['a phone number', 'Llame al 600 123 456'],
  ['an email address', 'titular.inventado@ejemplo.test'],
  ['a card number', 'Tarjeta 4000 0000 0000 0002'],
  ['a number plate', 'Turismo matrícula 1234 BCD'],
  ['health', 'Cuestionario de salud sin enfermedad previa'],
  ['a disability', 'Incapacidad permanente del asegurado'],
] as const;

const sample = ({ type }: FieldSpec, text: string): unknown => {
  switch (type.type) {
    case 'text':
      return text;
    case 'enum':
      return type.values[0];
    case 'date':
      return '2026-01-05';
    case 'month':
      return '2026-01';
    case 'boolean':
      return true;
    case 'integer':
      return type.min;
    default:
      return 100;
  }
};

interface Target {
  readonly kind: string;
  readonly list: string | null;
  readonly name: string;
}

const label = (t: Target): string => `${t.kind}.${t.list === null ? '' : `${t.list}[].`}${t.name}`;

function targets(sections: Readonly<Record<string, SectionSchema>>): readonly Target[] {
  return Object.entries(sections).flatMap(([kind, section]) => [
    ...Object.entries(section.fields)
      .filter(([, spec]) => spec.type.type === 'text')
      .map(([name]) => ({ kind, list: null, name })),
    ...Object.entries(section.lists).flatMap(([list, spec]) =>
      Object.entries(spec.item)
        .filter(([, item]) => item.type.type === 'text')
        .map(([name]) => ({ kind, list, name })),
    ),
  ]);
}

// One section holding the text in the target and, for a name, a company beside it, so only the
// guard under test can take it out.
function input(
  sections: Readonly<Record<string, SectionSchema>>,
  { kind, list, name }: Target,
  text: string,
): Record<string, unknown> {
  const section = sections[kind];
  if (!section) throw new Error(kind);
  const company = 'intermediaryType' in section.fields ? { intermediaryType: f('company') } : {};
  if (list === null) return { pages: [page(1, kind)], [kind]: { ...company, [name]: f(text) } };
  const item = section.lists[list]?.item ?? {};
  const row = Object.fromEntries(
    Object.entries(item).map(([key, spec]) => [key, key === name ? text : sample(spec, text)]),
  );
  return { pages: [page(1, kind)], [kind]: { [list]: [{ ...row, confidence: 'high' }] } };
}

const REVIEWS = [
  [
    'credit',
    CREDIT_SECTIONS,
    (toolInput: Record<string, unknown>) =>
      creditMerge(parseReading(toolInput, 1, 'credit'), toolInput),
  ],
  [
    'insurance',
    INSURANCE_SECTIONS,
    (toolInput: Record<string, unknown>) => insuranceMerge(parseReading(toolInput, 1, 'insurance')),
  ],
] as const satisfies readonly (readonly [
  ReviewKind,
  Readonly<Record<string, SectionSchema>>,
  (toolInput: Record<string, unknown>) => { readonly discarded: number },
])[];

describe.each(REVIEWS)('every text a %s read copies', (_, sections, merge) => {
  const all = targets(sections);

  it('is walked from the schema', () => {
    expect(all.length).toBeGreaterThanOrEqual(4);
  });

  it.each(all.map((t): [string, Target] => [label(t), t]))(
    'keeps %s when it carries nothing about anyone',
    (_label, target) => {
      const merged = merge(input(sections, target, CLEAN));
      expect(JSON.stringify(merged)).toContain(CLEAN);
      expect(merged.discarded).toBe(0);
    },
  );

  it.each(
    all.flatMap((t) =>
      LEAKS.map(([what, text]): [string, string, Target, string] => [label(t), what, t, text]),
    ),
  )('drops %s when it carries %s', (_label, _what, target, text) => {
    const merged = merge(input(sections, target, text));
    expect(JSON.stringify(merged)).not.toContain(text);
    expect(merged.discarded).toBe(1);
  });
});
