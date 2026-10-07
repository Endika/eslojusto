import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const FORBIDDEN = [
  /\bfirma(lo)?\b/,
  /\bno firmes\b/,
  /\breclama(lo)?\b/,
  /\bdemanda\b/,
  /\best[aá] bien\b/,
  /\bes correcto\b/,
  /\breclamo\b/,
  /\bexij[oa]\b/,
  /\babusiv[ao]s?\b/,
  /\bilegal(es)?\b/,
  /\bdenuncia\b/,
];

const filesUnder = (dir: string, ext: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? filesUnder(p, ext) : p.endsWith(ext) ? [p] : [];
  });

const check = (file: string, text: string) => {
  for (const forbidden of FORBIDDEN) {
    expect(text, `${file}: ${forbidden}`).not.toMatch(forbidden);
  }
};

if (!existsSync('dist')) {
  console.warn('published copy: no dist/; run `npm run build` first to check it.');
}

describe.skipIf(!existsSync('dist'))('published copy', () => {
  it.each(existsSync('dist') ? filesUnder('dist', '.html') : [])('%s gives no advice', (file) => {
    check(
      file,
      readFileSync(file, 'utf8')
        .replace(/<[^>]+>/g, ' ')
        .toLowerCase(),
    );
  });
});

const sources = [
  'src/calculator/render.ts',
  'src/i18n/es.ts',
  ...['src/engine', 'src/rental'].flatMap((dir) => (existsSync(dir) ? filesUnder(dir, '.ts') : [])),
];

describe('result copy', () => {
  it.each(sources)('%s gives no advice', (file) => {
    check(file, readFileSync(file, 'utf8').toLowerCase());
  });
});
