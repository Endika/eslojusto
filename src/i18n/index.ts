import { es, type Key } from './es';
import type { Lang } from './languages';
import { interpolate, type Variables } from './interpolate';

export type { Key } from './es';
export type { Lang } from './languages';

// Arabic-script markers around the Spanish text: every string reads right to left, and an
// untranslated one (a literal left in a component) stands out at a glance.
const pseudoRtl = (text: string): string => `ع\u200f ${text} \u200fع`;

export const DICTIONARIES: Record<Lang, Readonly<Record<Key, string>>> = {
  es,
  'ar-test': Object.fromEntries(
    Object.entries(es).map(([key, text]) => [key, pseudoRtl(text)]),
  ) as Record<Key, string>,
};

export function t(lang: Lang, key: Key, vars?: Variables): string {
  return interpolate(DICTIONARIES[lang][key], vars);
}

// The credit page's strings: its own, and the theme switch and other-language notice every page
// reads.
const CREDIT_PAGE = ['client.credit.', 'client.theme.', 'client.other_language.'];
// The mortgage page's likewise.
const MORTGAGE_PAGE = ['client.mortgage.', 'client.theme.', 'client.other_language.'];
// What they take of document reading: none of the final pay's report, letter or pass notices.
const NOT_READING = [
  'client.documents.report.',
  'client.documents.letter.',
  'client.documents.notice.',
  'client.documents.verify.',
];
const readingString = (key: string): boolean =>
  key.startsWith('client.documents.') && !NOT_READING.some((prefix) => key.startsWith(prefix));

// The words document reading has only for the credit, the insurance or the mortgage review's
// documents: what each kind is called, the figures their summary names, why a page was set aside
// and which page a read missed. Each ships only on its reviews' pages, so no other page changes
// while those reviews wait behind a switch.
const sectionReading = (
  kinds: readonly string[],
  fields: readonly string[],
  extra: readonly string[],
): ReadonlySet<string> =>
  new Set([
    ...kinds.flatMap((k) => [`client.documents.kind.${k}`, `client.documents.source.${k}`]),
    ...fields.map((f) => `client.documents.field.${f}`),
    ...extra,
  ]);
export const CREDIT_READING = sectionReading(
  [
    'credit_agreement',
    'credit_precontract_info',
    'amortization_schedule',
    'early_repayment_statement',
    'revolving_agreement',
    'card_statement',
  ],
  [
    'agreedOn',
    'principal',
    'nominalRate',
    'declaredApr',
    'declaredTotalPayable',
    'instalmentCount',
    'instalmentAmount',
    'agreedEndOn',
  ],
  ['client.documents.kind.card_statement_month', 'client.documents.skipped.not_credit_document'],
);
export const INSURANCE_READING = sectionReading(
  ['insurance_policy', 'insurance_renewal_notice'],
  ['expiresOn'],
  ['client.documents.skipped.not_insurance_document'],
);
export const MORTGAGE_READING = sectionReading(
  [
    'mortgage_deed',
    'notary_invoice',
    'registry_invoice',
    'agency_invoice_mortgage',
    'valuation_invoice',
    'ajd_form',
    'fein',
    'fiae',
    'transparency_deed',
    'prepayment_statement',
  ],
  ['principal', 'initialRate'],
  [
    'client.documents.skipped.not_mortgage_document',
    'client.documents.missing_key_page',
    'client.documents.key_page.expenses_clause',
    'client.documents.key_page_hint.expenses_clause',
  ],
);
const SECTION_READING = [CREDIT_READING, INSURANCE_READING, MORTGAGE_READING] as const;

// The strings the browser scripts need, for the page to ship as JSON. Those of document reading
// and the pass ship only in a build that has them, and each review section's only on its page.
// The credit page ships only its own, what every page reads and, with documents, what reading them
// says: the rest speak of claiming what a final pay owes, which the credit copy never does. The
// mortgage page likewise.
export const clientStrings = (
  lang: Lang,
  {
    documents = false,
    rental = false,
    employment = false,
    household = false,
    insurance = false,
    credit = false,
    mortgage = false,
  }: {
    documents?: boolean;
    rental?: boolean;
    employment?: boolean;
    household?: boolean;
    insurance?: boolean;
    credit?: boolean;
    mortgage?: boolean;
  } = {},
): Partial<Record<Key, string>> => {
  // A word of some reviews' documents ships on any of their pages, and on no other.
  const onPage = [credit, insurance, mortgage];
  const sectionWord = (key: string) => {
    const owners = SECTION_READING.flatMap((words, i) => (words.has(key) ? [onPage[i]] : []));
    return owners.length === 0 || owners.includes(true);
  };
  return Object.fromEntries(
    Object.entries(DICTIONARIES[lang]).filter(
      ([key]) =>
        key.startsWith('client.') &&
        (documents || !key.startsWith('client.documents.')) &&
        sectionWord(key) &&
        (rental || !key.startsWith('client.rental.')) &&
        (employment || !key.startsWith('client.employment.')) &&
        (household || !key.startsWith('client.household.')) &&
        (insurance || !key.startsWith('client.insurance.')) &&
        (credit
          ? CREDIT_PAGE.some((prefix) => key.startsWith(prefix)) ||
            (documents && readingString(key))
          : !key.startsWith('client.credit.')) &&
        (mortgage
          ? MORTGAGE_PAGE.some((prefix) => key.startsWith(prefix)) ||
            (documents && readingString(key))
          : !key.startsWith('client.mortgage.')),
    ),
  );
};
