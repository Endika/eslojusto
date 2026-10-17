import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(p, 'utf8');
const built = existsSync('dist/index.html');
const PAGES = ['/facturas/', '/facturas/luz/', '/facturas/permanencia/'];

describe.skipIf(!built)('a build with the bills reviews', () => {
  it('has the pages, their sitemap entries and the live card', () => {
    const sitemap = read('dist/sitemap-0.xml');
    for (const page of PAGES) expect(sitemap).toContain(page);
    expect(read('dist/index.html')).toContain('href="/facturas/"');
    expect(read('dist/facturas/index.html')).toContain('href="/facturas/luz/"');
    expect(read('dist/facturas/luz/index.html')).toContain('Código postal del suministro');
    expect(read('dist/facturas/permanencia/index.html')).toContain('Día en que pediste la baja');
  });
  it('carries each review’s guide, its questions and their FAQPage JSON-LD', () => {
    for (const [page, title, question, quote] of [
      [
        'luz',
        'Qué dice la norma de tu factura de la luz',
        'faq-luz-iva',
        'de manera separada a su factura',
      ],
      [
        'permanencia',
        'Qué dice la norma de tu permanencia y tu baja',
        'faq-permanencia-penalizacion',
        'proporcional al número de días no efectivos',
      ],
    ]) {
      const html = read(`dist/facturas/${page}/index.html`);
      expect(html).toContain(title);
      expect(html).toContain(`id="${question}"`);
      expect(html).toContain('"@type":"FAQPage"');
      expect(html).toContain('"@type":"WebApplication"');
      expect(html).toContain('data-legal-quote');
      expect(html).toContain(quote);
    }
  });
  it('describes the reviews in the privacy and legal notices', () => {
    const privacy = read('dist/privacidad/index.html');
    expect(privacy).toContain('Lo que escribes en las revisiones de tus facturas');
    expect(privacy).toContain('Al revisar tu factura de la luz');
    const notice = read('dist/aviso-legal/index.html');
    expect(notice).toContain('id="al-facturas"');
    expect(notice).toContain('No recalcula la energía del PVPC hora a hora');
  });
  it('ships its strings only on its review pages', () => {
    expect(read('dist/facturas/luz/index.html')).toContain('client.bills.status.matches');
    expect(read('dist/facturas/permanencia/index.html')).toContain('client.bills.status.matches');
    expect(read('dist/facturas/index.html')).not.toContain('client.bills.');
    expect(read('dist/index.html')).not.toContain('client.bills.');
  });
  it('never says the norm’s «potencia máxima demandada» in its own voice', () => {
    for (const page of ['luz', 'permanencia'])
      expect(read(`dist/facturas/${page}/index.html`).toLowerCase()).not.toContain(
        'potencia máxima demandada',
      );
  });
});
