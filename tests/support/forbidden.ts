import { OFFICIAL_NAMES } from '../../src/content/official-names';

// Words no visible text uses: the site informs and never advises. A pattern catches the forms
// derived from a word too, since a word boundary stops «reclama» from matching «reclamación».
export const FORBIDDEN = [
  /\bfirma(lo)?\b/,
  /\bno firmes\b/,
  /\breclama(lo)?\b/,
  /\breclamaci[oó]n(es)?\b/,
  /\bdemanda\b/,
  /\bdemandad[oa]s?\b/,
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

// The credit review places a rate against a reference and never calls it usury nor promises money
// back. «Usura» alone stays allowed: it is what people search for and the name of the 1908 law.
const CREDIT_FORBIDDEN = [
  /\bes usura\b/,
  /\bhay usura\b/,
  /\busurari[oa]s?\b/,
  /\bte deben\b/,
  /\ba recuperar\b/,
  /\brecuperar[aá]s\b/,
  /\brecuperaci[oó]n(es)?\b/,
  /\breclamar(l[aeo]s?)?\b/,
  /\breclam(as|an|e[ns]?|ar[aá][ns]?|ando|ad[oa]s?)\b/,
  /\bdemand(ar(l[aeo]s?)?|as|an|e[ns]?|ar[aá][ns]?|ando)\b/,
];
// Its own copy never says «recupera»; its pages may, in the shared pass copy («recupera aquí tu
// pase»).
const CREDIT_OWN_FORBIDDEN = [...CREDIT_FORBIDDEN, /\brecupera(r)?\b/];

// What each section adds, by where its copy lives: a source folder, a built page or a prefix of
// its translation keys. What is forbidden in one section may be the law's own words in another.
export const SECTION_FORBIDDEN: Readonly<Record<string, readonly RegExp[]>> = {
  'src/employment': EMPLOYMENT_FORBIDDEN,
  'dist/contrato/index.html': EMPLOYMENT_FORBIDDEN,
  'employment.': EMPLOYMENT_FORBIDDEN,
  'client.employment.': EMPLOYMENT_FORBIDDEN,
  'privacy.employment.': EMPLOYMENT_FORBIDDEN,
  'legal_notice.employment.': EMPLOYMENT_FORBIDDEN,
  'footer.note_employment': EMPLOYMENT_FORBIDDEN,
  'src/credit': CREDIT_OWN_FORBIDDEN,
  'src/engine/credit': CREDIT_OWN_FORBIDDEN,
  'credit.': CREDIT_OWN_FORBIDDEN,
  'client.credit.': CREDIT_OWN_FORBIDDEN,
  'dist/financiacion': CREDIT_FORBIDDEN,
};

const sectionsOf = (where: string) =>
  Object.keys(SECTION_FORBIDDEN).filter((prefix) => where.startsWith(prefix));

// Whether any section adds its own words for the copy at `where`.
export const hasSectionWords = (where: string): boolean => sectionsOf(where).length > 0;

export const forbiddenFor = (where: string): readonly RegExp[] => [
  ...FORBIDDEN,
  ...sectionsOf(where).flatMap((prefix) => SECTION_FORBIDDEN[prefix] ?? []),
];

// Phrases a page must carry in the law's terms, allowed only where they live: the privacy notice
// states the right to lodge a complaint with the supervisory authority (GDPR arts. 13.2.d and 77).
const PAGE_PHRASES: Readonly<Record<string, readonly string[]>> = {
  'dist/privacidad/': ['presentar una reclamación ante la agencia española de protección de datos'],
};

const officialNames = OFFICIAL_NAMES.map((name) => name.toLowerCase());

// The text the patterns read at `where`: lower case, one space between words, official names and
// the page's own legal phrases taken out.
export const plainCopy = (where: string, text: string): string =>
  [
    ...officialNames,
    ...Object.entries(PAGE_PHRASES).flatMap(([prefix, phrases]) =>
      where.startsWith(prefix) ? phrases : [],
    ),
  ].reduce(
    (plain, phrase) => plain.replaceAll(phrase, ' '),
    text.toLowerCase().replace(/\s+/g, ' '),
  );

// A built page as a reader sees it in the site's own voice: verbatim legal quotes, which
// <LegalQuote> marks, are the law's words and stay out.
export const publishedCopy = (html: string): string =>
  html
    .replace(/<blockquote\b[^>]*\bdata-legal-quote\b[^>]*>[\s\S]*?<\/blockquote>/g, ' ')
    .replace(/<[^>]+>/g, ' ');

// The patterns `text` breaks, read as copy living at `where`.
export const forbiddenIn = (where: string, text: string): readonly RegExp[] => {
  const plain = plainCopy(where, text);
  return forbiddenFor(where).filter((pattern) => pattern.test(plain));
};
