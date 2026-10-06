import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PROHIBIDAS = [
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

const comprobar = (fichero: string, texto: string) => {
  for (const prohibida of PROHIBIDAS) {
    expect(texto, `${fichero}: ${prohibida}`).not.toMatch(prohibida);
  }
};

if (!existsSync('dist')) {
  console.warn('textos publicados: no hay dist/; ejecuta `npm run build` antes para comprobarlos.');
}

describe.skipIf(!existsSync('dist'))('textos publicados', () => {
  it.each(existsSync('dist') ? html('dist') : [])('%s no aconseja', (fichero) => {
    comprobar(
      fichero,
      readFileSync(fichero, 'utf8')
        .replace(/<[^>]+>/g, ' ')
        .toLowerCase(),
    );
  });
});

const fuentes = [
  'src/calculadora/render.ts',
  ...readdirSync('src/motor')
    .filter((n) => n.endsWith('.ts'))
    .map((n) => join('src/motor', n)),
];

describe('textos del resultado', () => {
  it.each(fuentes)('%s no aconseja', (fichero) => {
    comprobar(fichero, readFileSync(fichero, 'utf8').toLowerCase());
  });
});
