import type { CivilDate } from '../engine/date';
import type { Review } from '../engine/review';

// What the person adds to the letter right before downloading it. It lives in the page only: it is
// never sent, stored or tracked, and a field left empty keeps its line to write by hand.
export interface LetterDetails {
  readonly name: string;
  readonly id: string;
  readonly company: string;
  readonly place: string;
  readonly date: CivilDate | null;
}

// The fields a person types; the date comes from a date picker.
export const LETTER_FIELDS = ['name', 'id', 'company', 'place'] as const;
export type LetterField = (typeof LETTER_FIELDS)[number];

// Long enough for any real value, short enough to fit its line.
export const LETTER_MAX_LENGTH: Record<LetterField, number> = {
  name: 80,
  id: 12,
  company: 80,
  place: 50,
};

// With something short, the letter lists it with its figures; with nothing short, it says only
// that the proposal is received without agreeing to it.
export const LETTER_KINDS = ['items', 'general'] as const;
export type LetterKind = (typeof LETTER_KINDS)[number];

export const letterKind = (r: Review): LetterKind =>
  r.items.some(
    (i) =>
      i.item.range !== null && (i.status === 'below_minimum' || i.status === 'deduction_too_high'),
  )
    ? 'items'
    : 'general';

export const NO_DETAILS: LetterDetails = { name: '', id: '', company: '', place: '', date: null };

export const LETTER_PREFILLED = ['none', 'some', 'all'] as const;
export type LetterPrefilled = (typeof LETTER_PREFILLED)[number];

// How many of the personal fields were filled, for analytics; the date, filled in for the person,
// does not count.
export function letterPrefilled(d: LetterDetails): LetterPrefilled {
  const filled = LETTER_FIELDS.filter((f) => d[f].trim() !== '').length;
  return filled === 0 ? 'none' : filled === 4 ? 'all' : 'some';
}

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
