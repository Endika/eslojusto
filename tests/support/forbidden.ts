// Words no visible text uses: the site informs and never advises.
export const FORBIDDEN = [
  /\bfirma(lo)?\b/,
  /\bno firmes\b/,
  /\breclama(lo)?\b/,
  /\bdemanda\b/,
  /\best[aá] bien\b/,
  /\bes correcto\b/,
  /\breclamo\b/,
  /\bexij[oa]\b/,
  /\babusiv[ao]s?\b/,
  /\bilegal(es)?\b/,
  /\bdenuncia\b/,
];

// The contract review never tells a person what they are, nor that an offer owes them anything:
// the law is quoted as what it says (art. 15.4 ET), and only amounts below the minimum wage carry euros.
export const EMPLOYMENT_FORBIDDEN = [
  /\beres fij[oa]\b/,
  /\bte convierte en fij[oa]\b/,
  /\bya eres\b/,
  /\bpasas a ser\b/,
  /\bte deben?\b/,
];
