import { describe, expect, it } from 'vitest';
import { creditMerge } from '../src/domain/credit-merge';
import { CREDIT_SECTIONS } from '../src/domain/credit-schema';
import { electricityMerge } from '../src/domain/electricity-merge';
import { ELECTRICITY_SECTIONS } from '../src/domain/electricity-schema';
import { parseReading } from '../src/domain/extraction';
import type { FieldSpec, SectionSchema } from '../src/domain/extraction-schema';
import { insuranceMerge } from '../src/domain/insurance-merge';
import { INSURANCE_SECTIONS } from '../src/domain/insurance-schema';
import { mortgageMerge } from '../src/domain/mortgage-merge';
import { MORTGAGE_SECTIONS } from '../src/domain/mortgage-schema';
import type { ReviewKind } from '../src/domain/reviews';
import { telecomMerge } from '../src/domain/telecom-merge';
import { TELECOM_SECTIONS } from '../src/domain/telecom-schema';
import { f, page } from './support/fields';

// Every text the credit, insurance, mortgage, electricity and telecom schemas let the model copy, walked from
// the schemas themselves: a text field added later is covered without naming it here. Made-up
// values only; supply codes with check letters that are not valid.
const CLEAN = 'Texto copiado del documento';
const LEAKS: readonly (readonly [string, string])[] = [
  ['a DNI', 'Firmado por el titular, DNI 12345678A'],
  ['an IBAN', 'Cargo en ES00 2100 0418 4502 0005 1332'],
  ['a phone number', 'Llame al 600 123 456'],
  ['an email address', 'titular.inventado@ejemplo.test'],
  ['a card number', 'Tarjeta 4000 0000 0000 0002'],
  ['a number plate', 'Turismo matrícula 1234 BCD'],
  ['health', 'Cuestionario de salud sin enfermedad previa'],
  ['a disability', 'Incapacidad permanente del asegurado'],
];
// A bill holds no number plate, and «1000 KWH» would look like one.
const BILL_LEAKS = [
  ...LEAKS.filter(([what]) => what !== 'a number plate'),
  ['a supply code', 'Suministro ES0000111122223333BB'],
] as const;
const TELECOM_LEAKS = [
  ...LEAKS.filter(([what]) => what !== 'a number plate'),
  ['a handset IMEI', 'Plazo terminal IMEI 35-000011-111111-2'],
] as const;
// A deed names its borrowers and guarantors with a title before their name.
const DEED_LEAKS = [
  ['a person a deed names', 'Con la fianza solidaria de Don Mengano Inventado'],
] as const;

const sample = ({ type }: FieldSpec, text: string): unknown => {
  switch (type.type) {
    case 'text':
      return type.pattern === undefined ? text : '28001';
    case 'fingerprint':
      return 'ES0000111122223333BB';
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
  readonly maxLength: number;
}

const label = (t: Target): string => `${t.kind}.${t.list === null ? '' : `${t.list}[].`}${t.name}`;

// A text with a pattern, such as a postcode, holds nothing free to copy.
const freeText = ({ type }: FieldSpec): number | null =>
  type.type === 'text' && type.pattern === undefined ? type.maxLength : null;

function targets(sections: Readonly<Record<string, SectionSchema>>): readonly Target[] {
  const of = (
    kind: string,
    list: string | null,
    specs: Readonly<Record<string, FieldSpec>>,
  ): Target[] =>
    Object.entries(specs).flatMap(([name, spec]) => {
      const maxLength = freeText(spec);
      return maxLength === null ? [] : [{ kind, list, name, maxLength }];
    });
  return Object.entries(sections).flatMap(([kind, section]) => [
    ...of(kind, null, section.fields),
    ...Object.entries(section.lists).flatMap(([list, spec]) => of(kind, list, spec.item)),
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
    Object.entries(item).map(([key, spec]) => [key, key === name ? text : sample(spec, CLEAN)]),
  );
  return { pages: [page(1, kind)], [kind]: { [list]: [{ ...row, confidence: 'high' }] } };
}

const REVIEWS = [
  [
    'credit',
    LEAKS,
    CREDIT_SECTIONS,
    (toolInput: Record<string, unknown>) =>
      creditMerge(parseReading(toolInput, 1, 'credit'), toolInput),
  ],
  [
    'insurance',
    LEAKS,
    INSURANCE_SECTIONS,
    (toolInput: Record<string, unknown>) => insuranceMerge(parseReading(toolInput, 1, 'insurance')),
  ],
  [
    'mortgage',
    [...LEAKS, ...DEED_LEAKS],
    MORTGAGE_SECTIONS,
    (toolInput: Record<string, unknown>) =>
      mortgageMerge(parseReading(toolInput, 1, 'mortgage'), toolInput),
  ],
  [
    'electricity',
    BILL_LEAKS,
    ELECTRICITY_SECTIONS,
    (toolInput: Record<string, unknown>) =>
      electricityMerge(parseReading(toolInput, 1, 'electricity'), toolInput),
  ],
  [
    'telecom',
    TELECOM_LEAKS,
    TELECOM_SECTIONS,
    (toolInput: Record<string, unknown>) =>
      telecomMerge(parseReading(toolInput, 1, 'telecom'), toolInput),
  ],
] as const satisfies readonly (readonly [
  ReviewKind,
  readonly (readonly [string, string])[],
  Readonly<Record<string, SectionSchema>>,
  (toolInput: Record<string, unknown>) => { readonly discarded: number },
])[];

describe.each(REVIEWS)('every text a %s read copies', (review, leaks, sections, merge) => {
  const all = targets(sections);

  it('is walked from the schema', () => {
    expect(all.length).toBeGreaterThanOrEqual(review === 'mortgage' ? 3 : 4);
  });

  it.each(all.map((t): [string, Target] => [label(t), t]))(
    'keeps %s when it carries nothing about anyone',
    (_label, target) => {
      const merged = merge(input(sections, target, CLEAN));
      expect(JSON.stringify(merged)).toContain(CLEAN);
      expect(merged.discarded).toBe(0);
    },
  );

  // Cut to the field's length, as the model would: a bill number holds 40 characters.
  it.each(
    all.flatMap((t) =>
      leaks.map(([what, text]): [string, string, Target, string] => [
        label(t),
        what,
        t,
        text.slice(0, t.maxLength),
      ]),
    ),
  )('drops %s when it carries %s', (_label, _what, target, text) => {
    const merged = merge(input(sections, target, text));
    expect(JSON.stringify(merged)).not.toContain(text);
    expect(merged.discarded).toBe(1);
  });
});
