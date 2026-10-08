// Identifiers a free text copied from a document can carry and the review never needs. The
// prompt asks the model to leave them out; these catch the ones that slip through.
const PATTERNS: readonly RegExp[] = [
  // DNI (eight digits and a letter) or NIE (X, Y or Z, seven digits and a letter).
  /\b[0-9XYZ]\d{7}[A-Z]\b/i,
  // Spanish IBAN, written whole or in groups of four.
  /\bES\d{2}(?:[\s-]?\d{4}){5}\b/i,
  /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/,
  // Nine digits starting with 6, 7, 8 or 9, with optional +34 and spaces between groups.
  /(?<![\d.,])(?:\+34[\s-]?)?[6-9](?:[\s-]?\d){8}(?!\d)/,
];

export const hasIdentifier = (text: string): boolean => PATTERNS.some((p) => p.test(text));
