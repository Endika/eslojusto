import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { es } from '../../src/i18n/es';
import { forbiddenIn, hasSectionWords, publishedCopy } from '../support/forbidden';

const filesUnder = (dir: string, ext: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? filesUnder(p, ext) : p.endsWith(ext) ? [p] : [];
  });

const check = (where: string, text: string) => {
  expect(forbiddenIn(where, text).map(String), where).toEqual([]);
};

if (!existsSync('dist')) {
  console.warn('published copy: no dist/; run `npm run build` first to check it.');
}

describe.skipIf(!existsSync('dist'))('published copy', () => {
  it.each(existsSync('dist') ? filesUnder('dist', '.html') : [])('%s gives no advice', (file) => {
    check(file, publishedCopy(readFileSync(file, 'utf8')));
  });
});

// legal-quotes.ts is left out: it holds the law's own words, shown only through <LegalQuote>.
const sources = [
  'src/calculator/render.ts',
  'src/i18n/es.ts',
  ...[
    'src/engine',
    'src/rental',
    'src/employment',
    'src/credit',
    'src/insurance',
    'src/household',
    'src/bills',
  ].flatMap((dir) => (existsSync(dir) ? filesUnder(dir, '.ts') : [])),
];

describe('result copy', () => {
  it.each(sources)('%s gives no advice', (file) => {
    check(file, readFileSync(file, 'utf8'));
  });
});

// Each translation key a section claims is read with that section's words too.
describe('section copy', () => {
  it.each(Object.entries(es).filter(([key]) => hasSectionWords(key)))(
    '%s informs without asserting',
    (key, text) => {
      check(key, text);
    },
  );
});

describe('forbidden words', () => {
  it.each([
    ['reclamación previa', ['/\\breclamaci[oó]n(es)?\\b/']],
    ['las reclamaciones', ['/\\breclamaci[oó]n(es)?\\b/']],
    ['la parte demandada', ['/\\bdemandad[oa]s?\\b/']],
    ['el Servicio de Reclamaciones del Banco de España', []],
    ['el Servicio de Reclamaciones de la Dirección General de Seguros y Fondos de Pensiones', []],
    ['el servicio de reclamaciones', ['/\\breclamaci[oó]n(es)?\\b/']],
    [
      'el Servicio de Reclamaciones del Banco de España y otra reclamación',
      ['/\\breclamaci[oó]n(es)?\\b/'],
    ],
  ])('in the shared copy, «%s» breaks %j', (text, broken) => {
    expect(forbiddenIn('src/i18n/es.ts', text).map(String)).toEqual(broken);
  });

  it('allow the complaint to the data protection authority only in the privacy notice', () => {
    const text = 'puedes presentar una reclamación ante la Agencia Española de Protección de Datos';
    expect(forbiddenIn('dist/privacidad/index.html', text)).toEqual([]);
    expect(forbiddenIn('dist/financiacion/index.html', text)).not.toEqual([]);
  });

  it('match across a line break', () => {
    expect(forbiddenIn('src/i18n/es.ts', 'no\n  firmes').map(String)).toEqual([
      '/\\bno firmes\\b/',
    ]);
  });

  it.each([
    ['src/credit/x.ts', ['/\\bes usura\\b/']],
    ['src/engine/credit/x.ts', ['/\\bes usura\\b/']],
    ['credit.result.indicator', ['/\\bes usura\\b/']],
    ['dist/financiacion/index.html', ['/\\bes usura\\b/']],
    ['src/rental/x.ts', []],
    ['src/employment/x.ts', []],
  ])('«esto es usura» at %s breaks %j', (where, broken) => {
    expect(forbiddenIn(where, 'esto es usura').map(String)).toEqual(broken);
  });

  it('«recupera» is the credit copy own word to avoid, not its pages shared pass copy', () => {
    expect(forbiddenIn('src/credit/x.ts', 'recupera aquí tu pase')).not.toEqual([]);
    expect(forbiddenIn('dist/financiacion/index.html', 'recupera aquí tu pase')).toEqual([]);
    expect(forbiddenIn('dist/financiacion/index.html', 'el dinero a recuperar')).not.toEqual([]);
  });

  it.each([
    'para reclamarlo',
    'si reclamas',
    'puedes reclamar',
    'la recuperación del dinero',
    'demandar al banco',
    'si demandas',
  ])('the credit copy and pages never say «%s», the rest may', (text) => {
    expect(forbiddenIn('src/credit/x.ts', text)).not.toEqual([]);
    expect(forbiddenIn('dist/financiacion/index.html', text)).not.toEqual([]);
    expect(forbiddenIn('src/employment/x.ts', text)).toEqual([]);
  });

  it('«te deben» stays forbidden in the employment review', () => {
    expect(forbiddenIn('client.employment.x', 'te deben 10 €')).not.toEqual([]);
    expect(forbiddenIn('client.rental.x', 'te deben 10 €')).toEqual([]);
  });

  it('«tienes derecho» stays out of the household review', () => {
    expect(forbiddenIn('client.household.x', 'tienes derecho a 10 €')).not.toEqual([]);
    expect(forbiddenIn('dist/empleada-de-hogar/index.html', 'tienen derecho')).not.toEqual([]);
    expect(forbiddenIn('client.rental.x', 'tienes derecho a 10 €')).toEqual([]);
  });

  it('a built page leaves out only the marked legal quotes', () => {
    const html =
      '<p>Texto propio</p><blockquote class="quote" data-legal-quote><p>«la parte demandada»</p></blockquote>' +
      '<blockquote class="quote"><p>«la parte demandada»</p></blockquote>';
    const copy = publishedCopy(html);
    expect(copy.match(/demandada/g)).toHaveLength(1);
    expect(copy).toContain('Texto propio');
  });
});

// Each home card carries one line: it must fit an index, not explain the review.
describe('home situation lines', () => {
  it.each(Object.entries(es).filter(([key]) => /^home\..+_situation$/.test(key)))(
    '%s fits in 70 characters',
    (_, text) => {
      expect([...text].length).toBeLessThanOrEqual(70);
    },
  );
});
