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
// back. On its pages, «usura» alone stays allowed: it is what people search for.
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
// Its own copy never says «recupera» nor «usura» in its own voice; the 1908 law is named only as an
// official name. Its pages may say «recupera» in the shared pass copy («recupera aquí tu pase»).
const CREDIT_OWN_FORBIDDEN = [...CREDIT_FORBIDDEN, /\brecupera(r)?\b/, /\busura\b/];

// The mortgage review separates what the law says from what depends on a judge and never sounds
// like a firm chasing cases: no money back promised, no ceiling of euros, no count of people
// affected, no hurry, no verdict on a clause and no word on whether a time limit has run.
const MORTGAGE_FORBIDDEN = [
  ...CREDIT_FORBIDDEN,
  /\bte devuelven\b/,
  /\bgana\b/,
  /\bsin coste\b/,
  /\bhasta \{?[\w.,]*\}? ?€/,
  /\bafectados\b/,
  /prescri(to|ba|be)\b/,
  /\bnul[ao]s?\b/,
  /\bfecha de firma\b/,
  /\bantes de que\b/,
];
// Its own copy never says any form of «recuperar»; its pages may, in the shared pass copy
// («recupera aquí tu pase»).
const MORTGAGE_OWN_FORBIDDEN = [...MORTGAGE_FORBIDDEN, /\brecuper/];

// The household review speaks to the worker but never says what she is entitled to: where the law
// is not decisive it says «podría».
const HOUSEHOLD_FORBIDDEN = [/\btienes derecho\b/, /\btienen derecho\b/];

// The bills reviews show figures and the norm, never what to do about them: no power to lower, no
// tariff to switch to and no offer that suits better.
const BILLS_FORBIDDEN = [
  /\bbaja tu potencia\b/,
  /\bc[aá]mbiate\b/,
  /\bte conviene\b/,
  /\bte recomendamos\b/,
  /\bdeber[ií]as\b/,
];

// What each section adds, by where its copy lives: a source folder, a built page or a prefix of
// its translation keys. What is forbidden in one section may be the law's own words in another.
const SECTION_FORBIDDEN: Readonly<Record<string, readonly RegExp[]>> = {
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
  'privacy.credit.': CREDIT_OWN_FORBIDDEN,
  'legal_notice.credit': CREDIT_OWN_FORBIDDEN,
  'home.credit': CREDIT_OWN_FORBIDDEN,
  'footer.note_credit': CREDIT_OWN_FORBIDDEN,
  'dist/financiacion': CREDIT_FORBIDDEN,
  'src/mortgage': MORTGAGE_OWN_FORBIDDEN,
  'src/engine/mortgage': MORTGAGE_OWN_FORBIDDEN,
  'mortgage.': MORTGAGE_OWN_FORBIDDEN,
  'client.mortgage.': MORTGAGE_OWN_FORBIDDEN,
  'privacy.mortgage.': MORTGAGE_OWN_FORBIDDEN,
  'legal_notice.mortgage': MORTGAGE_OWN_FORBIDDEN,
  'dist/hipoteca': MORTGAGE_FORBIDDEN,
  'src/household': HOUSEHOLD_FORBIDDEN,
  'dist/empleada-de-hogar': HOUSEHOLD_FORBIDDEN,
  'household.': HOUSEHOLD_FORBIDDEN,
  'client.household.': HOUSEHOLD_FORBIDDEN,
  'privacy.household.': HOUSEHOLD_FORBIDDEN,
  'legal_notice.household': HOUSEHOLD_FORBIDDEN,
  'home.household': HOUSEHOLD_FORBIDDEN,
  'footer.note_household': HOUSEHOLD_FORBIDDEN,
  'src/bills': BILLS_FORBIDDEN,
  'src/engine/bills': BILLS_FORBIDDEN,
  'dist/facturas': BILLS_FORBIDDEN,
  'bills.': BILLS_FORBIDDEN,
  'client.bills.': BILLS_FORBIDDEN,
  'privacy.bills.': BILLS_FORBIDDEN,
  'legal_notice.bills': BILLS_FORBIDDEN,
  'home.bills': BILLS_FORBIDDEN,
  'footer.note_bills': BILLS_FORBIDDEN,
};

const sectionsOf = (where: string) =>
  Object.keys(SECTION_FORBIDDEN).filter((prefix) => where.startsWith(prefix));

// Whether any section adds its own words for the copy at `where`.
export const hasSectionWords = (where: string): boolean => sectionsOf(where).length > 0;

// The same advice in each translation, read on its built pages (dist/<lang>/), where the Spanish
// lists would only catch other words: «firma» is the company in Romanian. Bounds are letters, since
// \b does not see accented ones.
const word = (source: string) => new RegExp(`(?<!\\p{L})(?:${source})(?!\\p{L})`, 'u');
const TRANSLATED_FORBIDDEN: Readonly<Record<string, readonly RegExp[]>> = {
  en: [
    word('you should'),
    word('we recommend'),
    word('claim it'),
    word('sue'),
    word('illegal'),
    word('abusive'),
    word('usury|usurious'),
    word('they owe you'),
    word("you('ll| will) get (it|your money) back"),
  ],
  ar: [/يجب عليك/, /ننصح/, /نوصي/, /طالِ?ب ب/, /ارفع دعوى/, /غير قانوني/, /تعسف/, /مستحقة? لك/],
  ro: [
    word('ar trebui s[ăa]'),
    word('recomand(ăm|am)'),
    word('reclam[ăa]'),
    /în judecată/,
    word('ilegal\\p{L}*'),
    word('abuziv\\p{L}*'),
    word('c[aă]m[aă]t\\p{L}*'),
    /îți datorează/,
    /îți vei recupera/,
  ],
  fr: [
    word('vous devriez'),
    word('(nous )?(vous )?(recommandons|conseillons)'),
    word('réclamez'),
    word('portez plainte'),
    word('(poursuivre|attaquer) en justice'),
    word('illégal\\p{L}*'),
    word('abusi(f|ve)s?'),
    word('usur(e|aire)s?'),
    word('vous doi(t|vent)'),
    word('vous récupérerez'),
  ],
  uk: [
    /вам (слід|варто)/,
    /радимо|рекомендуємо/,
    /вимагайте/,
    /подайте (до суду|позов)/,
    /незаконн/,
    /зловжив/,
    /кабальн/,
    /лихвар/,
    /(вам|вас) (винні|заборгува)/,
    /ви повернете (собі )?(гроші|кошти)/,
  ],
  zh: [
    /(您|你)(应该|应当)/,
    /(建议|推荐)(您|你)/,
    /我们(建议|推荐)/,
    /索赔/,
    /起诉/,
    /提起诉讼/,
    /违法/,
    /非法/,
    /滥用/,
    /霸王条款/,
    /高利贷/,
    /欠(您|你)/,
    /(您|你)(能|将|会)拿回/,
  ],
  ca: [
    word('hauries de'),
    word('(et |us )?(recomanem|aconsellem)'),
    word('reclama(-ho|-la|-lo)?'),
    /(?<!\p{L})demanda(-la|-lo)?(?!\p{L})(?! de)/u,
    word('il·legal\\p{L}*'),
    word('abusi(u|va|us|ves)'),
    word('usura(ri|ria)?'),
    word('et deuen'),
    word('recuperaràs'),
  ],
  eu: [
    word('beharko zenuke'),
    word('gomendatzen (dizugu|dizuegu|dugu)'),
    word('erreklama(tu)? ezazu'),
    word('salatu'),
    word('auzitara eraman'),
    word('legez kanpo'),
    word('abusibo(a|ak)?'),
    word('usura\\p{L}*'),
    word('zor dizute'),
    word('berreskuratuko duzu'),
  ],
  gl: [
    word('deberías'),
    word('terías que'),
    word('recomendámosche|aconsellámosche|recomendamos|aconsellamos'),
    word('reclám?a(o|a|lle)?'),
    /(?<!\p{L})demanda(o|a)?(?!\p{L})(?! de)/u,
    word('ilegal\\p{L}*'),
    word('abusiv[oa]s?'),
    word('usura(rio|ria)?'),
    word('débenche'),
    word('recuperarás'),
  ],
};

const langOf = (where: string): string | undefined =>
  Object.keys(TRANSLATED_FORBIDDEN).find((lang) => where.startsWith(`dist/${lang}/`));

const forbiddenFor = (where: string): readonly RegExp[] => {
  const lang = langOf(where);
  if (lang) return TRANSLATED_FORBIDDEN[lang] ?? [];
  return [...FORBIDDEN, ...sectionsOf(where).flatMap((prefix) => SECTION_FORBIDDEN[prefix] ?? [])];
};

// Phrases a page must carry in the law's terms, allowed only where they live: the privacy notice
// states the right to lodge a complaint with the supervisory authority (GDPR arts. 13.2.d and 77).
const PAGE_PHRASES: Readonly<Record<string, readonly string[]>> = {
  'dist/privacidad/': ['presentar una reclamación ante la agencia española de protección de datos'],
};

const officialNames = OFFICIAL_NAMES.map((name) => name.toLowerCase());

// The text the patterns read at `where`: lower case, one space between words, official names and
// the page's own legal phrases taken out.
const plainCopy = (where: string, text: string): string =>
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
