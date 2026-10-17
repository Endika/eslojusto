import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(p, 'utf8');
const built = existsSync('dist/index.html');

describe.skipIf(!built)('a build with the insurance review', () => {
  it('has the page, its sitemap entry and the live card', () => {
    expect(read('dist/sitemap-0.xml')).toContain('/seguros/');
    expect(read('dist/index.html')).toContain('href="/seguros/"');
    const page = read('dist/seguros/index.html');
    expect(page).toContain('Día en que vence según tu póliza');
    // Closed to every other origin; a build with the documents API opens it to that API and
    // Turnstile, to read documents and for the letters and the pass.
    const documents = page.includes('data-documents-start');
    expect(page.includes('data-pass-offer')).toBe(documents);
    expect(page).toMatch(
      documents
        ? /connect-src 'self'( https:\/\/[\w.-]+)* https:\/\/challenges\.cloudflare\.com;/
        : /connect-src 'self';/,
    );
  });
  it('carries its guide, its questions and their FAQPage JSON-LD', () => {
    const page = read('dist/seguros/index.html');
    expect(page).toContain('Qué dice la ley de las fechas de tu seguro');
    expect(page).toContain('id="faq-seguro-no-renovar"');
    expect(page).toContain('"@type":"FAQPage"');
  });
  it('describes the review in the privacy and legal notices', () => {
    expect(read('dist/privacidad/index.html')).toContain(
      'Lo que escribes en la revisión de tu seguro',
    );
    expect(read('dist/aviso-legal/index.html')).toContain('id="al-seguros"');
  });
  it('ships its strings only on its own page', () => {
    expect(read('dist/seguros/index.html')).toContain('client.insurance.status.open');
    expect(read('dist/index.html')).not.toContain('client.insurance.');
  });
});
