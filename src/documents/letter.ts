import type { CivilDate } from '../engine/date';

// What the person adds to the letter right before downloading it. It lives in the page only: it is
// never sent, stored or tracked, and a field left empty keeps its line to write by hand.
export interface LetterDetails {
  readonly name: string;
  readonly id: string;
  readonly company: string;
  readonly place: string;
  readonly date: CivilDate | null;
  // Only the rental letters ask for these; the account only for the deposit's.
  readonly landlord?: string;
  readonly address?: string;
  readonly iban?: string;
  // Only the contract review's letters ask for the workplace.
  readonly workplace?: string;
}

// The fields a person types on the final pay's letter; the date comes from a date picker.
export const LETTER_FIELDS = ['name', 'id', 'company', 'place'] as const;
// And on the rental letters.
export const RENTAL_LETTER_FIELDS = ['name', 'id', 'landlord', 'address', 'place', 'iban'] as const;
// And on the contract review's.
export const EMPLOYMENT_LETTER_FIELDS = ['name', 'id', 'company', 'workplace', 'place'] as const;
export type LetterField =
  | (typeof LETTER_FIELDS)[number]
  | (typeof RENTAL_LETTER_FIELDS)[number]
  | (typeof EMPLOYMENT_LETTER_FIELDS)[number];
export const ALL_LETTER_FIELDS: readonly LetterField[] = [
  ...new Set<LetterField>([...LETTER_FIELDS, ...RENTAL_LETTER_FIELDS, ...EMPLOYMENT_LETTER_FIELDS]),
];
// The typed fields of a letter: the final pay's always, another section's when its form has them.
export type TypedDetails = Record<(typeof LETTER_FIELDS)[number], string> &
  Partial<Record<LetterField, string>>;

// Long enough for any real value, short enough to fit its line.
export const LETTER_MAX_LENGTH: Record<LetterField, number> = {
  name: 80,
  id: 12,
  company: 80,
  place: 50,
  landlord: 80,
  address: 120,
  // 34 characters at most (ISO 13616), with a space every four.
  iban: 42,
  workplace: 120,
};

// The letters a review can offer: the final pay's lists what falls short (`items`) or only
// acknowledges the proposal (`general`); the rental review's asks for the deposit back
// (`deposit_return`) or for a rise to be looked at again (`rent_review`); the contract review's asks
// the company for the information it owes in writing (`information_request`) or to look again at
// what does not match the law (`employment`), and the public employment service for the
// certificate of temporary contracts (`temporary_contracts_certificate`).
export const LETTER_KINDS = [
  'items',
  'general',
  'deposit_return',
  'rent_review',
  'information_request',
  'employment',
  'temporary_contracts_certificate',
] as const;
export type LetterKind = (typeof LETTER_KINDS)[number];

export const NO_DETAILS: LetterDetails = { name: '', id: '', company: '', place: '', date: null };

export const LETTER_PREFILLED = ['none', 'some', 'all'] as const;
export type LetterPrefilled = (typeof LETTER_PREFILLED)[number];

// How many of the personal fields of its form were filled, for analytics; the date, filled in for
// the person, does not count.
export function letterPrefilled(
  d: LetterDetails,
  fields: readonly LetterField[] = LETTER_FIELDS,
): LetterPrefilled {
  const filled = fields.filter((f) => (d[f] ?? '').trim() !== '').length;
  return filled === 0 ? 'none' : filled === fields.length ? 'all' : 'some';
}

export const longDate = (d: CivilDate) =>
  new Date(d.y, d.m - 1, d.d).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

const CHECK_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';

// A DNI (8 digits and its check letter) or a NIE (X, Y or Z, 7 digits and the letter), spaces,
// dots and dashes aside. Only to warn: the letter is downloaded either way.
export function looksLikeDniOrNie(text: string): boolean {
  const t = text.toUpperCase().replace(/[\s.-]/g, '');
  const m = /^([XYZ]?)(\d{7,8})([A-Z])$/.exec(t);
  if (!m) return false;
  const [, prefix = '', digits = '', letter] = m;
  if (digits.length !== (prefix ? 7 : 8)) return false;
  const number = Number(`${prefix ? 'XYZ'.indexOf(prefix) : ''}${digits}`);
  return CHECK_LETTERS[number % 23] === letter;
}
