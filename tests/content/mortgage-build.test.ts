import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MORTGAGE_BUILD } from '../../src/content/sections';
import { LAST_UPDATED } from '../../src/content/updated';

const read = (p: string) => readFileSync(p, 'utf8');
const built = existsSync('dist/index.html');
const withMortgage = built && existsSync('dist/hipoteca/index.html');

describe('the mortgage switch', () => {
  it('is off unless PUBLIC_MORTGAGE=1', () => {
    expect(MORTGAGE_BUILD).toBe(process.env['PUBLIC_MORTGAGE'] === '1');
  });
  it('dates the page only in a build with it', () => {
    expect('/hipoteca/' in LAST_UPDATED).toBe(process.env['PUBLIC_MORTGAGE'] === '1');
  });
});

// A build without PUBLIC_MORTGAGE=1 carries nothing of the page: no route, no live card on the home
// page, no sitemap entry, no script and none of its strings.
describe.skipIf(!built || withMortgage)('a build without the mortgage switch', () => {
  it('has no page, no sitemap entry and no script of its own', () => {
    expect(existsSync('dist/hipoteca')).toBe(false);
    expect(read('dist/sitemap-0.xml')).not.toContain('/hipoteca/');
    expect(readdirSync('dist/_astro').filter((f) => f.startsWith('Mortgage.'))).toEqual([]);
  });
  it('keeps the home page as it was', () => {
    const html = read('dist/index.html');
    expect(html).not.toContain('hipoteca/');
    expect(html).not.toContain('client.mortgage.');
  });
});

describe.skipIf(!withMortgage)('a build with the mortgage switch', () => {
  it('has the page, its sitemap entry and the live card', () => {
    expect(read('dist/sitemap-0.xml')).toContain('/hipoteca/');
    expect(read('dist/index.html')).toContain('href="/hipoteca/"');
    const page = read('dist/hipoteca/index.html');
    expect(page).toContain('Fecha de la escritura');
    expect(page).toContain("connect-src 'self';");
  });
  it('ships its strings only on its own page', () => {
    expect(read('dist/hipoteca/index.html')).toContain(
      'client.mortgage.status.lender_bears.statute',
    );
    expect(read('dist/index.html')).not.toContain('client.mortgage.');
  });
});
