import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(p, 'utf8');
const built = existsSync('dist/index.html');

describe.skipIf(!built)('a build with the credit review', () => {
  it('has the page, its sitemap entry and the live card', () => {
    expect(read('dist/sitemap-0.xml')).toContain('/financiacion/');
    expect(read('dist/index.html')).toContain('href="/financiacion/"');
    const page = read('dist/financiacion/index.html');
    expect(page).toContain('¿Cuándo lo contrataste?');
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
    const page = read('dist/financiacion/index.html');
    expect(page).toContain('Qué dice la ley de tu préstamo o tu tarjeta');
    expect(page).toContain('id="faq-credito-tipo-medio"');
    expect(page).toContain('"@type":"FAQPage"');
  });
  it('describes the review in the privacy and legal notices', () => {
    expect(read('dist/privacidad/index.html')).toContain(
      'Lo que escribes en la revisión de tu crédito',
    );
    expect(read('dist/aviso-legal/index.html')).toContain('id="al-financiacion"');
  });
  it('ships its strings only on its own page', () => {
    expect(read('dist/financiacion/index.html')).toContain('client.credit.status.matches');
    expect(read('dist/index.html')).not.toContain('client.credit.');
  });
});
