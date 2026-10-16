import { existsSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LANGS, type Lang } from '../../src/i18n/languages';

// What is written once per language beside the dictionary: the prose files and the copy modules.
// A published language can't lean on the Spanish fallback for any of them.
const published = (Object.keys(LANGS) as Lang[]).filter(
  (lang) => LANGS[lang].published && lang !== 'es',
);
const PER_LANGUAGE = [
  ...readdirSync('src/prose/es').map((file) => (lang: Lang) => `src/prose/${lang}/${file}`),
  (lang: Lang) => `src/content/erte/${lang}.ts`,
  (lang: Lang) => `src/content/rental-pages/${lang}.ts`,
];

describe('what each language writes on its own', () => {
  it('the Spanish files are all there', () => {
    for (const path of PER_LANGUAGE) expect(existsSync(path('es')), path('es')).toBe(true);
  });

  it.each(published.length > 0 ? published : [null])(
    'a published language has every file: %s',
    (lang) => {
      if (lang === null) return;
      expect(PER_LANGUAGE.map((path) => path(lang)).filter((p) => !existsSync(p))).toEqual([]);
    },
  );
});

describe('the sitemap date of a page in another language', () => {
  it('is its Spanish page’s', async () => {
    const { LAST_UPDATED, lastUpdated } = await import('../../src/content/updated');
    expect(lastUpdated('/eu/finiquito/')).toBe(LAST_UPDATED['/finiquito/']);
    expect(lastUpdated('/zh/')).toBe(LAST_UPDATED['/']);
    expect(lastUpdated('/finiquito/')).toBe(LAST_UPDATED['/finiquito/']);
    expect(lastUpdated('/xx/finiquito/')).toBeUndefined();
  });
});
