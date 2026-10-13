import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BILLS_BUILD } from '../../src/content/sections';
import { LAST_UPDATED } from '../../src/content/updated';

const read = (p: string) => readFileSync(p, 'utf8');
const built = existsSync('dist/index.html');
const withBills = built && existsSync('dist/facturas/index.html');
const PAGES = ['/facturas/', '/facturas/luz/', '/facturas/permanencia/'];

describe('the bills switch', () => {
  it('is off unless PUBLIC_BILLS=1', () => {
    expect(BILLS_BUILD).toBe(process.env['PUBLIC_BILLS'] === '1');
  });
  it('dates the pages only in a build with them', () => {
    for (const page of PAGES)
      expect(page in LAST_UPDATED, page).toBe(process.env['PUBLIC_BILLS'] === '1');
  });
});

// A build without PUBLIC_BILLS=1 carries nothing of the section: no route, no live card on the
// home page, no sitemap entry, no script and none of its strings.
describe.skipIf(!built || withBills)('a build without the bills switch', () => {
  it('has no page, no sitemap entry and no script of its own', () => {
    expect(existsSync('dist/facturas')).toBe(false);
    expect(read('dist/sitemap-0.xml')).not.toContain('/facturas/');
    expect(
      readdirSync('dist/_astro').filter((f) => /^(Electricity|Telecom|Bills)\./.test(f)),
    ).toEqual([]);
  });
  it('keeps the home page as it was', () => {
    const html = read('dist/index.html');
    expect(html).not.toContain('facturas/');
    expect(html).not.toContain('client.bills.');
  });
  it('ships none of its analytics codes', () => {
    const scripts = readdirSync('dist/_astro')
      .filter((f) => f.endsWith('.js'))
      .map((f) => read(`dist/_astro/${f}`));
    for (const code of ['electricity_bill_reviewed', 'faq-luz-iva', 'bono-social-consumo'])
      expect(
        scripts.filter((js) => js.includes(`\`${code}\``) || js.includes(`"${code}"`)),
        code,
      ).toEqual([]);
  });
  it('says nothing of it in the privacy and legal notices', () => {
    expect(read('dist/privacidad/index.html')).not.toContain('revisiones de tus facturas');
    expect(read('dist/aviso-legal/index.html')).not.toContain('al-facturas');
  });
});

describe.skipIf(!withBills)('a build with the bills switch', () => {
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
