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
  it('ships none of its analytics codes', () => {
    const scripts = readdirSync('dist/_astro')
      .filter((f) => f.endsWith('.js'))
      .map((f) => read(`dist/_astro/${f}`));
    for (const code of ['mortgage_review_completed', 'faq-hipoteca-suelo', 'clausula-gastos'])
      expect(
        scripts.filter((js) => js.includes(`\`${code}\``)),
        code,
      ).toEqual([]);
  });
  it('keeps the home page as it was', () => {
    const html = read('dist/index.html');
    expect(html).not.toContain('hipoteca/');
    expect(html).not.toContain('client.mortgage.');
  });
  it('says nothing of it in the privacy and legal notices', () => {
    expect(read('dist/privacidad/index.html')).not.toContain('revisión de tu hipoteca');
    expect(read('dist/aviso-legal/index.html')).not.toContain('al-hipoteca');
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
  it('carries its guide, its questions and their FAQPage JSON-LD', () => {
    const page = read('dist/hipoteca/index.html');
    expect(page).toContain('Qué dicen la ley y los tribunales de tu hipoteca');
    expect(page).toContain('id="faq-hipoteca-suelo"');
    expect(page).toContain('"@type":"FAQPage"');
    expect(page).toContain('data-legal-quote');
  });
  it('describes the review in the privacy and legal notices', () => {
    expect(read('dist/privacidad/index.html')).toContain(
      'Lo que escribes en la revisión de tu hipoteca',
    );
    const notice = read('dist/aviso-legal/index.html');
    expect(notice).toContain('id="al-hipoteca"');
    expect(notice).toContain('No valora si las cláusulas de tu escritura son transparentes');
  });
  it('ships its strings only on its own page', () => {
    expect(read('dist/hipoteca/index.html')).toContain(
      'client.mortgage.status.lender_bears.statute',
    );
    expect(read('dist/index.html')).not.toContain('client.mortgage.');
  });
});
