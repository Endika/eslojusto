import { t } from '../i18n';
import { link, type Lang } from '../i18n/languages';

// schema.org nodes for each page's @graph. Only what is true of the site: no ratings, no prices.
const SITE_NAME = 'eslojusto.es';
const EMAIL = 'hola@eslojusto.es';

const organization = (home: URL) => ({
  '@type': 'Organization',
  '@id': `${home.href}#organizacion`,
  name: SITE_NAME,
  url: home.href,
});

export const homeGraph = (home: URL, lang: Lang) => [
  {
    '@type': 'WebSite',
    '@id': `${home.href}#sitio`,
    name: SITE_NAME,
    alternateName: 'Es lo justo',
    url: home.href,
    inLanguage: lang,
    publisher: { '@id': `${home.href}#organizacion` },
  },
  {
    ...organization(home),
    logo: new URL('apple-touch-icon.png', home).href,
    email: EMAIL,
    founder: { '@type': 'Person', name: 'Endika Iglesias' },
  },
];

export const calculatorApp = (home: URL, page: URL, lang: Lang) => ({
  '@type': 'WebApplication',
  name: 'Calculadora de finiquito',
  url: page.href,
  description: t(lang, 'final_pay.description'),
  applicationCategory: 'FinanceApplication',
  operatingSystem: 'Any',
  browserRequirements: 'Requires JavaScript',
  isAccessibleForFree: true,
  inLanguage: lang,
  publisher: organization(home),
});

export const rentalApp = (home: URL, page: URL, lang: Lang) => ({
  '@type': 'WebApplication',
  name: t(lang, 'rental.app_name'),
  url: page.href,
  description: t(lang, 'rental.description'),
  applicationCategory: 'FinanceApplication',
  operatingSystem: 'Any',
  browserRequirements: 'Requires JavaScript',
  isAccessibleForFree: true,
  inLanguage: lang,
  publisher: organization(home),
});

export const employmentApp = (home: URL, page: URL, lang: Lang) => ({
  '@type': 'WebApplication',
  name: t(lang, 'employment.app_name'),
  url: page.href,
  description: t(lang, 'employment.description'),
  applicationCategory: 'FinanceApplication',
  operatingSystem: 'Any',
  browserRequirements: 'Requires JavaScript',
  isAccessibleForFree: true,
  inLanguage: lang,
  publisher: organization(home),
});

export const householdApp = (home: URL, page: URL, lang: Lang) => ({
  '@type': 'WebApplication',
  name: t(lang, 'household.app_name'),
  url: page.href,
  description: t(lang, 'household.description'),
  applicationCategory: 'FinanceApplication',
  operatingSystem: 'Any',
  browserRequirements: 'Requires JavaScript',
  isAccessibleForFree: true,
  inLanguage: lang,
  publisher: organization(home),
});

export const creditApp = (home: URL, page: URL, lang: Lang) => ({
  '@type': 'WebApplication',
  name: t(lang, 'credit.app_name'),
  url: page.href,
  description: t(lang, 'credit.description'),
  applicationCategory: 'FinanceApplication',
  operatingSystem: 'Any',
  browserRequirements: 'Requires JavaScript',
  isAccessibleForFree: true,
  inLanguage: lang,
  publisher: organization(home),
});

export const insuranceApp = (home: URL, page: URL, lang: Lang) => ({
  '@type': 'WebApplication',
  name: t(lang, 'insurance.app_name'),
  url: page.href,
  description: t(lang, 'insurance.description'),
  applicationCategory: 'FinanceApplication',
  operatingSystem: 'Any',
  browserRequirements: 'Requires JavaScript',
  isAccessibleForFree: true,
  inLanguage: lang,
  publisher: organization(home),
});

export interface Crumb {
  readonly name: string;
  // From the site root, with its trailing slash.
  readonly path: string;
}

// The trail from the home page to this one; the last crumb is the page itself. The page shows it
// with the Breadcrumbs component and lists the same crumbs in its BreadcrumbList.
export const trail = (lang: Lang, ...crumbs: readonly Crumb[]): readonly Crumb[] => [
  { name: t(lang, 'breadcrumb.home'), path: '/' },
  ...crumbs,
];

export const breadcrumbList = (home: URL, lang: Lang, crumbs: readonly Crumb[]) => ({
  '@type': 'BreadcrumbList',
  itemListElement: crumbs.map(({ name, path }, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name,
    item: new URL(link(lang, path.replace(/^\//, '')), home).href,
  })),
});
