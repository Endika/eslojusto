export type Lang = 'es' | 'en' | 'ar' | 'ro' | 'fr' | 'uk' | 'zh' | 'ca' | 'eu' | 'gl' | 'ar-test';

export const DEFAULT_LANG: Lang = 'es';

// A language is published (`published: true`) only after a native speaker has reviewed every
// string in its dictionary. Until then it builds no route and appears in no hreflang, except in a
// review build (REVIEW_LANGS), which serves it noindexed for its reviewer.
// `ar-test` is a pseudo-locale that only exists to prove the RTL layout; it is never published.
export const LANGS: Record<Lang, { name: string; dir: 'ltr' | 'rtl'; published: boolean }> = {
  es: { name: 'Español', dir: 'ltr', published: true },
  en: { name: 'English', dir: 'ltr', published: false },
  ar: { name: 'العربية', dir: 'rtl', published: false },
  ro: { name: 'Română', dir: 'ltr', published: false },
  fr: { name: 'Français', dir: 'ltr', published: false },
  uk: { name: 'Українська', dir: 'ltr', published: false },
  zh: { name: '中文', dir: 'ltr', published: false },
  ca: { name: 'Català', dir: 'ltr', published: false },
  eu: { name: 'Euskara', dir: 'ltr', published: false },
  gl: { name: 'Galego', dir: 'ltr', published: false },
  'ar-test': { name: 'Pseudo RTL (solo pruebas)', dir: 'rtl', published: false },
};

const all = Object.keys(LANGS) as Lang[];

export const publishedLangs = (): Lang[] => all.filter((i) => LANGS[i].published);

// The unpublished real languages a review build serves: REVIEW_LANGS=eu,ca. Anything else in the
// list is ignored, so the pseudo-locale can't sneak in this way.
export const reviewLangs = (env: Record<string, string | undefined> = process.env): Lang[] => {
  const asked = (env['REVIEW_LANGS'] ?? '').split(',').map((i) => i.trim());
  return all.filter((i) => i !== 'ar-test' && !LANGS[i].published && asked.includes(i));
};

// The languages a build emits routes for: the published ones, those under review, plus ar-test
// under TEST_RTL=1.
export const builtLangs = (env: Record<string, string | undefined> = process.env): Lang[] => [
  ...publishedLangs(),
  ...reviewLangs(env),
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
