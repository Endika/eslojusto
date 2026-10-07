import type { CivilDate } from '../engine/date';

// What the person adds to the letter right before downloading it. It lives in the page only: it is
// never sent, stored or tracked, and a field left empty keeps its line to write by hand.
export interface LetterDetails {
  readonly name: string;
  readonly id: string;
  readonly company: string;
  readonly place: string;
  readonly date: CivilDate | null;
}

export const NO_DETAILS: LetterDetails = { name: '', id: '', company: '', place: '', date: null };

export const LETTER_PREFILLED = ['none', 'some', 'all'] as const;
export type LetterPrefilled = (typeof LETTER_PREFILLED)[number];

// How many of the personal fields were filled, for analytics; the date, filled in for the person,
// does not count.
export function letterPrefilled(d: LetterDetails): LetterPrefilled {
  const filled = [d.name, d.id, d.company, d.place].filter((v) => v.trim() !== '').length;
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
