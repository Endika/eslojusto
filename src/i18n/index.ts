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

// The strings the browser scripts need, for the page to ship as JSON. Those of document reading
// and the pass ship only in a build that has them, and each review section's only on its page.
export const clientStrings = (
  lang: Lang,
  {
    documents = false,
    rental = false,
    employment = false,
    household = false,
    insurance = false,
  }: {
    documents?: boolean;
    rental?: boolean;
    employment?: boolean;
    household?: boolean;
    insurance?: boolean;
  } = {},
): Partial<Record<Key, string>> =>
  Object.fromEntries(
    Object.entries(DICTIONARIES[lang]).filter(
      ([key]) =>
        key.startsWith('client.') &&
        (documents || !key.startsWith('client.documents.')) &&
        (rental || !key.startsWith('client.rental.')) &&
        (employment || !key.startsWith('client.employment.')) &&
        (household || !key.startsWith('client.household.')) &&
        (insurance || !key.startsWith('client.insurance.')),
    ),
  );
