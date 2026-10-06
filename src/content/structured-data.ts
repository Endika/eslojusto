import { t } from '../i18n';
import type { Lang } from '../i18n/languages';

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
