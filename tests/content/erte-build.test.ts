import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ERTE_LEGAL } from '../../src/content/erte';
import { ERTE_BUILD } from '../../src/content/sections';

const read = (p: string) => readFileSync(p, 'utf8');
const built = existsSync('dist/paro/index.html');
const withErte = built && existsSync('dist/paro/erte/index.html');

describe('the ERTE switch', () => {
  it('is off unless PUBLIC_ERTE=1', () => {
    expect(ERTE_BUILD).toBe(process.env['PUBLIC_ERTE'] === '1');
  });
});

// A build without PUBLIC_ERTE=1 carries nothing of the page: no route, no link from /paro/, no
// sitemap entry and no script of its own.
describe.skipIf(!built || withErte)('a build without the ERTE switch', () => {
  it('has no page, no sitemap entry and no script of its own', () => {
    expect(existsSync('dist/paro/erte')).toBe(false);
    expect(read('dist/sitemap-0.xml')).not.toContain('/paro/erte/');
    expect(readdirSync('dist/_astro').filter((f) => f.startsWith('Erte.'))).toEqual([]);
  });
  it('leaves /paro/ without the link', () => {
    const html = read('dist/paro/index.html');
    expect(html).not.toContain('paro/erte');
    expect(html).not.toContain('Si estás en un ERTE');
  });
  it('leaves the legal notice without its section', () => {
    expect(read('dist/aviso-legal/index.html')).not.toContain(ERTE_LEGAL.title);
  });
});

describe.skipIf(!withErte)('a build with the ERTE switch', () => {
  it('has the page, its sitemap entry and the link from /paro/', () => {
    expect(read('dist/sitemap-0.xml')).toContain('/paro/erte/');
    expect(read('dist/paro/index.html')).toContain('href="/paro/erte/"');
    const page = read('dist/paro/erte/index.html');
    expect(page).toContain('¿Qué tipo de ERTE tienes?');
    expect(page).toContain("connect-src 'self';");
  });
  it('gives it a beta section in the legal notice, like the other beta reviews', () => {
    const notice = read('dist/aviso-legal/index.html');
    expect(notice).toContain('id="al-erte"');
    expect(notice).toContain(ERTE_LEGAL.title);
  });
});
