import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ERTE_LEGAL } from '../../src/content/erte';

const read = (p: string) => readFileSync(p, 'utf8');
const built = existsSync('dist/paro/index.html');

describe.skipIf(!built)('a build with the ERTE page', () => {
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
