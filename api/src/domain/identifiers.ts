// Identifiers a free text copied from a document can carry and the review never needs. The
// prompt asks the model to leave them out; these catch the ones that slip through. Each one
// stands apart from the digits around it, so amounts, dates, laws and references don't match.
const PATTERNS: readonly RegExp[] = [
  // DNI: eight digits, grouped or not, and a letter; «DNI12345678A» has no word boundary.
  /(?<![\d.,])\d{2}[\s.]?\d{3}[\s.]?\d{3}[\s-]?[A-Z](?![A-Z\d])/i,
  // NIE: X, Y or Z, seven digits and a letter.
  /(?<![A-Z\d])[XYZ][\s-]?\d{7}[\s-]?[A-Z](?![A-Z\d])/i,
  // Spanish IBAN, in any grouping.
  /(?<![A-Z\d])ES\d{2}(?:[\s.-]?\d){20}(?!\d)/i,
  // The account number before IBAN (CCC): bank, branch, check digits and account.
  /(?<![\d.,])\d{4}[\s.-]?\d{4}[\s.-]?\d{2}[\s.-]?\d{10}(?!\d)/,
  /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/,
  // Nine digits starting with 6, 7, 8 or 9, after an optional +34 or 0034.
  /(?<![\d.,/-])(?:(?:\+|00)34[\s.-]?)?[6-9](?:[\s.-]?\d){8}(?!\d|[.,/-]\d)/,
];

export const hasIdentifier = (text: string): boolean => PATTERNS.some((p) => p.test(text));

// The Social Security number (NAF): province, eight digits and two check digits. Only the
// employment review looks for it, since only its documents carry one.
const NAF = /(?<![\d.,/-])\d{2}[\s/-]?\d{8}[\s/-]?\d{2}(?![\d]|[.,]\d)/;

export const hasSocialSecurityNumber = (text: string): boolean => NAF.test(text);

// A payment card number: sixteen digits in groups of four or in one piece, or an American Express
// number (fifteen, grouped 4-6-5). A masked number («**** **** **** 1234») says nothing. Only the
// credit and the insurance review look for it, since only a card or a premium receipt carries one.
const CARD_NUMBERS: readonly RegExp[] = [
  /(?<![\d.,])\d{4}(?:[\s-]?\d{4}){3}(?![\d]|[.,]\d)/,
  /(?<![\d.,])3[47]\d{2}[\s-]?\d{6}[\s-]?\d{5}(?![\d]|[.,]\d)/,
];

export const hasPaymentCardNumber = (text: string): boolean =>
  CARD_NUMBERS.some((p) => p.test(text));

// A Spanish number plate: four digits and three consonants since 2000, or the provincial letters,
// four digits and one or two letters before it, with their dashes. In capitals, as plates print; a
// year after a slash is a law's («Ley 50/1980 LCS»).
const PLATES: readonly RegExp[] = [
  /(?<![A-Z\d/])\d{4}[\s-]?[BCDFGHJKLMNPRSTVWXYZ]{3}(?![A-Z\d])/,
  /(?<![A-Z\d])[A-Z]{1,2}-\d{4}-[A-Z]{1,2}(?![A-Z\d])/,
];

export const hasNumberPlate = (text: string): boolean => PLATES.some((p) => p.test(text));

// A natural person's name as a deed introduces it: a courtesy title before a capitalised word
// («Don Fulano», «D.ª Mengana», «Sra. Zutana»). Only the mortgage review looks for it, since a
// deed names the borrowers and their guarantors that way; «D. [nombre]» says nothing.
const PERSON_TITLE =
  /(?<![\p{L}\p{N}])(?:Don|Doña|Dona|D\.|Dª|D\.ª|Dña\.?|Sr\.|Sra\.)\s+\p{Lu}\p{Ll}+/u;

export const hasPersonTitle = (text: string): boolean => PERSON_TITLE.test(text);
