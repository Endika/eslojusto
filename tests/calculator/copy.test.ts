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
];

const html = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? html(p) : p.endsWith('.html') ? [p] : [];
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
  it.each(existsSync('dist') ? html('dist') : [])('%s gives no advice', (file) => {
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
  ...readdirSync('src/engine')
    .filter((n) => n.endsWith('.ts'))
    .map((n) => join('src/engine', n)),
];

describe('result copy', () => {
  it.each(sources)('%s gives no advice', (file) => {
    check(file, readFileSync(file, 'utf8').toLowerCase());
  });
});
