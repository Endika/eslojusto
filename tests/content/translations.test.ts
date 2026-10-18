import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TRANSLATIONS } from '../../src/i18n';
import { es, type Key } from '../../src/i18n/es';
import { SOURCE_LINE, fidelityProblems, figures, sourceHash } from '../../scripts/i18n-fidelity';
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

// Every translated prose file and copy module that exists, with its Spanish file.
const TRANSLATED_FILES: readonly (readonly [string, string])[] = [
  ...readdirSync('src/prose', { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'es')
    .map((entry) => entry.name)
    .flatMap((lang) =>
      readdirSync(`src/prose/${lang}`).map(
        (file) => [`src/prose/${lang}/${file}`, `src/prose/es/${file}`] as const,
      ),
    ),
  ...['src/content/erte', 'src/content/rental-pages'].flatMap((dir) =>
    readdirSync(dir)
      .filter((file) => /^[a-z]{2}\.ts$/.test(file) && file !== 'es.ts')
      .map((file) => [`${dir}/${file}`, `${dir}/es.ts`] as const),
  ),
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

describe('a translation stays faithful to its Spanish', () => {
  it('keeps every variable and every figure', () => {
    expect(
      fidelityProblems('Faltan {importe} (art. 49.1 ET)', 'Missing {importe} (art. 49.1 ET)'),
    ).toEqual([]);
    expect(fidelityProblems('Faltan {importe}', 'Missing {amount}')).toEqual([
      'variables importe → amount',
    ]);
    expect(fidelityProblems('33 días por año', '30 days a year')).toEqual(['figures 33 → 30']);
    expect(fidelityProblems('Ley 29/1994', 'the tenancy act')).toEqual(['figures 1994,29 → ']);
  });

  it.each(Object.keys(TRANSLATIONS) as (keyof typeof TRANSLATIONS)[])(
    '%s: every translated string keeps them',
    (lang) => {
      const wrong = Object.entries(TRANSLATIONS[lang]).flatMap(([key, text]) => {
        const problems = fidelityProblems(es[key as Key], text ?? '');
        return problems.length > 0 ? [`${key}: ${problems.join('; ')}`] : [];
      });
      expect(wrong).toEqual([]);
    },
  );

  // Prose and copy modules keep their code, so a whole file keeps the Spanish file's figures.
  it.each(TRANSLATED_FILES.length > 0 ? TRANSLATED_FILES : [['', ''] as const])(
    '%s keeps the figures of its Spanish file',
    (path, spanish) => {
      if (path === '') return;
      const text = (p: string) => readFileSync(p, 'utf8').replace(SOURCE_LINE, '');
      expect(figures(text(path))).toEqual(figures(text(spanish)));
    },
  );
});

describe('a translation stays on today’s Spanish', () => {
  it.each(Object.keys(TRANSLATIONS) as (keyof typeof TRANSLATIONS)[])(
    '%s: every translated string was stamped on its Spanish as it reads now',
    (lang) => {
      const sources = JSON.parse(readFileSync(`src/i18n/sources/${lang}.json`, 'utf8')) as Record<
        string,
        string
      >;
      const stale = Object.keys(TRANSLATIONS[lang]).filter(
        (key) => sources[key] !== sourceHash(es[key as Key]),
      );
      // Run `npm run i18n:stamp -- <lang> --keys …` once they are translated anew.
      expect(stale).toEqual([]);
    },
  );

  it.each(TRANSLATED_FILES.length > 0 ? TRANSLATED_FILES : [['', ''] as const])(
    '%s was stamped on its Spanish file as it reads now',
    (path, spanish) => {
      if (path === '') return;
      const stamp = SOURCE_LINE.exec(readFileSync(path, 'utf8'))?.[1];
      // Run `npm run i18n:stamp -- <path>` once it is translated anew.
      expect(stamp).toBe(sourceHash(readFileSync(spanish, 'utf8')));
    },
  );
});

describe('the spans of the example tables', () => {
  it('read in Spanish as the labels they replace', async () => {
    const { bySeniority, durationByTime, fixedTerms, spanLabel } =
      await import('../../src/content/examples');
    for (const row of [...bySeniority, ...durationByTime])
      expect(spanLabel(row.months, 'es')).toBe(row.label);
    for (const row of fixedTerms) expect(spanLabel(row.months, 'es', 'months')).toBe(row.label);
    expect(spanLabel(24, 'en')).toBe('2 years');
  });
});

// Astro drops a line break that touches an {expression}, so «{euros(x)}⏎al día» reads «57,53 €al
// día». A word that must follow or precede one across a break needs an explicit {' '}. Chinese
// writes no space there, so it is left out.
const PROSE_FILES = readdirSync('src/prose', { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== 'zh')
  .flatMap((entry) =>
    readdirSync(`src/prose/${entry.name}`).map((file) => `src/prose/${entry.name}/${file}`),
  );

const gluedBreaks = (path: string): string[] => {
  const text = readFileSync(path, 'utf8');
  const lines = text.slice(text.indexOf('---', 3) + 3).split('\n');
  return lines.slice(0, -1).flatMap((line, i) => {
    const end = line.trimEnd();
    const next = (lines[i + 1] ?? '').trimStart();
    const exprThenWord =
      /[^'>]\}$/.test(end) && !end.trimStart().startsWith('<') && /^[\p{L}\d]/u.test(next);
    const wordThenExpr = /[\p{L}\d:;,]$/u.test(end) && /^\{(?![/#:]|' '|` )/.test(next);
    return exprThenWord || wordThenExpr
      ? [`${path}:${i + 1}: «${end.slice(-30)}⏎${next.slice(0, 20)}»`]
      : [];
  });
};

describe('a line break beside an expression', () => {
  it.each(PROSE_FILES)('%s keeps the space Astro would drop', (path) => {
    expect(gluedBreaks(path)).toEqual([]);
  });
});
