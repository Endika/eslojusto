import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { es } from '../../src/i18n/es';
import { EMPLOYMENT_FORBIDDEN, FORBIDDEN } from '../support/forbidden';

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
  ...['src/engine', 'src/rental', 'src/employment'].flatMap((dir) =>
    existsSync(dir) ? filesUnder(dir, '.ts') : [],
  ),
];

describe('result copy', () => {
  it.each(sources)('%s gives no advice', (file) => {
    check(file, readFileSync(file, 'utf8').toLowerCase());
  });
});

const employmentCopy: readonly (readonly [string, string])[] = [
  ...Object.entries(es)
    .filter(([key]) => key.startsWith('employment.') || key.startsWith('client.employment.'))
    .map(([key, text]): [string, string] => [key, text]),
  ...(existsSync('src/employment') ? filesUnder('src/employment', '.ts') : []).map(
    (file): [string, string] => [file, readFileSync(file, 'utf8')],
  ),
  ...(existsSync('dist/contrato/index.html')
    ? [
        [
          'dist/contrato/index.html',
          readFileSync('dist/contrato/index.html', 'utf8').replace(/<[^>]+>/g, ' '),
        ] as [string, string],
      ]
    : []),
];

describe('employment contract copy', () => {
  it.each(employmentCopy)('%s informs without asserting', (name, text) => {
    for (const forbidden of [...FORBIDDEN, ...EMPLOYMENT_FORBIDDEN])
      expect(text.toLowerCase(), `${name}: ${forbidden}`).not.toMatch(forbidden);
  });
});
