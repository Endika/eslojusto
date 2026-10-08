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
