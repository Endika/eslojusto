import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { INSURANCE_BUILD } from '../../src/content/sections';

const read = (p: string) => readFileSync(p, 'utf8');
const built = existsSync('dist/index.html');
const withInsurance = built && existsSync('dist/seguros/index.html');

describe('the insurance switch', () => {
  it('is off unless PUBLIC_INSURANCE=1', () => {
    expect(INSURANCE_BUILD).toBe(process.env['PUBLIC_INSURANCE'] === '1');
  });
});

// A build without PUBLIC_INSURANCE=1 carries nothing of the page: no route, no live card on the
// home page, no sitemap entry, no script and none of its strings.
describe.skipIf(!built || withInsurance)('a build without the insurance switch', () => {
  it('has no page, no sitemap entry and no script of its own', () => {
    expect(existsSync('dist/seguros')).toBe(false);
    expect(read('dist/sitemap-0.xml')).not.toContain('/seguros/');
    expect(readdirSync('dist/_astro').filter((f) => f.startsWith('Insurance.'))).toEqual([]);
  });
  it('keeps the home page as it was', () => {
    const html = read('dist/index.html');
    expect(html).not.toContain('seguros/');
    expect(html).toContain('Financiación y seguros');
    expect(html).not.toContain('client.insurance.');
  });
});

describe.skipIf(!withInsurance)('a build with the insurance switch', () => {
  it('has the page, its sitemap entry and the live card', () => {
    expect(read('dist/sitemap-0.xml')).toContain('/seguros/');
    expect(read('dist/index.html')).toContain('href="/seguros/"');
    const page = read('dist/seguros/index.html');
    expect(page).toContain('Día en que vence según tu póliza');
    // Closed to every other origin; a build with the documents API opens it to that API and
    // Turnstile, for the letters and the pass.
    expect(page).toMatch(
      page.includes('data-pass-offer')
        ? /connect-src 'self'( https:\/\/[\w.-]+)* https:\/\/challenges\.cloudflare\.com;/
        : /connect-src 'self';/,
    );
  });
  it('ships its strings only on its own page', () => {
    expect(read('dist/seguros/index.html')).toContain('client.insurance.status.open');
    expect(read('dist/index.html')).not.toContain('client.insurance.');
  });
});
