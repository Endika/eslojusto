export type Lang = 'es' | 'ar-test';

export const DEFAULT_LANG: Lang = 'es';

// A language is published (`published: true`) only after a native speaker has reviewed every
// string in its dictionary. Until then it builds no route and appears in no hreflang.
// `ar-test` is a pseudo-locale that only exists to prove the RTL layout; it is never published.
export const LANGS: Record<Lang, { name: string; dir: 'ltr' | 'rtl'; published: boolean }> = {
  es: { name: 'Español', dir: 'ltr', published: true },
  'ar-test': { name: 'Pseudo RTL (solo pruebas)', dir: 'rtl', published: false },
};

const all = Object.keys(LANGS) as Lang[];

export const publishedLangs = (): Lang[] => all.filter((i) => LANGS[i].published);

// The languages a build emits routes for: the published ones, plus ar-test under TEST_RTL=1.
export const builtLangs = (env: Record<string, string | undefined> = process.env): Lang[] => [
  ...publishedLangs(),
  ...(env['TEST_RTL'] === '1' ? (['ar-test'] as const) : []),
];

// The prefix of a language's routes: none for the default language.
export const prefix = (lang: Lang): string => (lang === DEFAULT_LANG ? '' : `${lang}/`);

// A page's URL in a language, under the site's base.
export const link = (lang: Lang, path = ''): string =>
  `${import.meta.env.BASE_URL}${prefix(lang)}${path}`;

// getStaticPaths for a page under `[lang]/`: every built language but the default one, so a
// normal build (Spanish only) emits no route there.
export const langPaths = () =>
  builtLangs()
    .filter((lang) => lang !== DEFAULT_LANG)
    .map((lang) => ({ params: { lang } }));
