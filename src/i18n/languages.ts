export type Lang = 'es' | 'en' | 'ar' | 'ro' | 'fr' | 'uk' | 'zh' | 'ca' | 'eu' | 'gl' | 'ar-test';

export const DEFAULT_LANG: Lang = 'es';

// A published language (`published: true`) builds its routes and appears in hreflang; an
// unpublished one builds nothing.
// `ar-test` is a pseudo-locale that only exists to prove the RTL layout; it is never published.
export const LANGS: Record<Lang, { name: string; dir: 'ltr' | 'rtl'; published: boolean }> = {
  es: { name: 'Español', dir: 'ltr', published: true },
  en: { name: 'English', dir: 'ltr', published: true },
  ar: { name: 'العربية', dir: 'rtl', published: true },
  ro: { name: 'Română', dir: 'ltr', published: true },
  fr: { name: 'Français', dir: 'ltr', published: true },
  uk: { name: 'Українська', dir: 'ltr', published: true },
  zh: { name: '中文', dir: 'ltr', published: true },
  ca: { name: 'Català', dir: 'ltr', published: true },
  eu: { name: 'Euskara', dir: 'ltr', published: true },
  gl: { name: 'Galego', dir: 'ltr', published: true },
  'ar-test': { name: 'Pseudo RTL (solo pruebas)', dir: 'rtl', published: false },
};

const all = Object.keys(LANGS) as Lang[];

const publishedLangs = (): Lang[] => all.filter((i) => LANGS[i].published);

// The languages a build emits routes for: the published ones, plus ar-test under TEST_RTL=1.
export const builtLangs = (env: Record<string, string | undefined> = process.env): Lang[] => [
  ...publishedLangs(),
  ...(env['TEST_RTL'] === '1' ? (['ar-test'] as const) : []),
];

// The prefix of a language's routes: none for the default language.
const prefix = (lang: Lang): string => (lang === DEFAULT_LANG ? '' : `${lang}/`);

// A page's URL in a language, under the site's base.
export const link = (lang: Lang, path = ''): string =>
  `${import.meta.env.BASE_URL}${prefix(lang)}${path}`;

// getStaticPaths for a page under `[lang]/`: every built language but the default one, so a
// normal build (Spanish only) emits no route there.
export const langPaths = () =>
  builtLangs()
    .filter((lang) => lang !== DEFAULT_LANG)
    .map((lang) => ({ params: { lang } }));
