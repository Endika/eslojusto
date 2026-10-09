import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CREDIT_BUILD } from '../../src/content/sections';
import { LAST_UPDATED } from '../../src/content/updated';

const read = (p: string) => readFileSync(p, 'utf8');
const built = existsSync('dist/index.html');
const withCredit = built && existsSync('dist/financiacion/index.html');

describe('the credit switch', () => {
  it('is off unless PUBLIC_CREDIT=1', () => {
    expect(CREDIT_BUILD).toBe(process.env['PUBLIC_CREDIT'] === '1');
  });
  it('dates the page only in a build with it', () => {
    expect('/financiacion/' in LAST_UPDATED).toBe(process.env['PUBLIC_CREDIT'] === '1');
  });
});

// A build without PUBLIC_CREDIT=1 carries nothing of the page: no route, no live card on the home
// page, no sitemap entry, no script and none of its strings.
describe.skipIf(!built || withCredit)('a build without the credit switch', () => {
  it('has no page, no sitemap entry and no script of its own', () => {
    expect(existsSync('dist/financiacion')).toBe(false);
    expect(read('dist/sitemap-0.xml')).not.toContain('/financiacion/');
    expect(readdirSync('dist/_astro').filter((f) => f.startsWith('Credit.'))).toEqual([]);
  });
  it('keeps the home page as it was', () => {
    const html = read('dist/index.html');
    expect(html).not.toContain('financiacion/');
    expect(html).not.toContain('client.credit.');
  });
});

describe.skipIf(!withCredit)('a build with the credit switch', () => {
  it('has the page, its sitemap entry and the live card', () => {
    expect(read('dist/sitemap-0.xml')).toContain('/financiacion/');
    expect(read('dist/index.html')).toContain('href="/financiacion/"');
    const page = read('dist/financiacion/index.html');
    expect(page).toContain('¿Cuándo lo contrataste?');
    // Closed to every other origin; a build with the documents API opens it to that API and
    // Turnstile, for the letters and the pass.
    expect(page).toMatch(
      page.includes('data-pass-offer')
        ? /connect-src 'self'( https:\/\/[\w.-]+)* https:\/\/challenges\.cloudflare\.com;/
        : /connect-src 'self';/,
    );
  });
  it('ships its strings only on its own page', () => {
    expect(read('dist/financiacion/index.html')).toContain('client.credit.status.matches');
    expect(read('dist/index.html')).not.toContain('client.credit.');
  });
});
