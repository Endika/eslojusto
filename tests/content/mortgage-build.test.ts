import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(p, 'utf8');
const built = existsSync('dist/index.html');

describe.skipIf(!built)('a build with the mortgage review', () => {
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
