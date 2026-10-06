import { test, expect, type Page } from '@playwright/test';

const RUTAS = ['./', 'finiquito/', 'aviso-legal/', 'privacidad/'];

for (const ruta of RUTAS) {
  test(`${ruta} tiene un h1, título, descripción y canónica`, async ({ page }) => {
    await page.goto(ruta);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toBeVisible();
    const titulo = (await page.title()).trim();
    expect(titulo).not.toBe('');
    // What Google shows before it cuts the line.
    expect([...titulo].length).toBeLessThanOrEqual(60);
    const descripcion = await page.locator('meta[name="description"]').getAttribute('content');
    expect(descripcion?.trim()).toBeTruthy();
    expect([...(descripcion ?? '')].length).toBeLessThanOrEqual(155);
    const canonica = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(canonica).toMatch(/^https:\/\/eslojusto\.es\//);
  });
}

test.describe('sin JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('la explicación del finiquito se lee sin JavaScript', async ({ page }) => {
    await page.goto('finiquito/');
    await expect(page.getByText('45 días').first()).toBeVisible();
    await expect(page.getByText('12 de febrero de 2012').first()).toBeVisible();
    await expect(
      page.getByRole('article').getByText('Se pide en los 15 días hábiles siguientes'),
    ).toBeVisible();
  });
});

const datos = async (page: Page) =>
  JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? '{}') as {
    '@graph': Record<string, unknown>[];
  };

test('la portada declara el sitio y quién está detrás', async ({ page }) => {
  await page.goto('./');
  const tipos = (await datos(page))['@graph'].map((n) => n['@type']);
  expect(tipos).toEqual(['WebSite', 'Organization']);
});

test('el finiquito se declara como aplicación gratuita, sin valoraciones ni precios', async ({
  page,
}) => {
  await page.goto('finiquito/');
  const grafo = (await datos(page))['@graph'];
  expect(grafo.map((n) => n['@type'])).toEqual(['WebApplication', 'FAQPage']);
  expect(grafo[0]).toMatchObject({ isAccessibleForFree: true });
  const texto = JSON.stringify(grafo);
  for (const campo of ['aggregateRating', 'review', 'offers', 'price'])
    expect(texto).not.toContain(campo);
});

test('el finiquito lleva su título visible, la fecha y las fuentes', async ({ page }) => {
  await page.goto('finiquito/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('finiquito');
  await expect(page.getByText('Actualizado: octubre de 2026')).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Estatuto de los Trabajadores (BOE)' }),
  ).toHaveAttribute('href', /^https:\/\/www\.boe\.es\//);
  await expect(page.getByRole('link', { name: 'guía del CGPJ v0.6' })).toHaveAttribute(
    'href',
    /^https:\/\/www\.poderjudicial\.es\//,
  );
});

test('la guía explica el paro con su ley, y la FAQ y el JSON-LD llevan sus preguntas', async ({
  page,
}) => {
  await page.goto('finiquito/');
  const guia = page.getByRole('article');
  await expect(guia.getByRole('heading', { level: 2, name: 'Y el paro' })).toBeVisible();
  await expect(guia.getByRole('heading', { level: 2, name: 'Preguntas frecuentes' })).toBeVisible();
  for (const nombre of ['Cuánto paro se cobra', 'Cuánto dura el paro', 'Plazo para pedir el paro'])
    await expect(guia.getByRole('heading', { level: 3, name: nombre })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Ley General de la Seguridad Social (BOE)' }),
  ).toHaveAttribute('href', /^https:\/\/www\.boe\.es\/buscar\/act\.php\?id=BOE-A-2015-11724$/);
  await expect(page.getByRole('link', { name: 'cuantías del SEPE' })).toHaveAttribute(
    'href',
    /^https:\/\/www\.sepe\.es\//,
  );
  await expect(
    guia.getByRole('link', { name: 'informe de tu vida laboral (sede de la Seguridad Social)' }),
  ).toHaveAttribute('href', /^https:\/\/sede\.seg-social\.gob\.es\//);

  const preguntas = [
    '¿Tengo paro si me despiden o se acaba mi contrato?',
    '¿Cuánto paro voy a cobrar?',
  ];
  const faq = (await datos(page))['@graph'].find((n) => n['@type'] === 'FAQPage') as {
    mainEntity: { name: string; acceptedAnswer: { text: string } }[];
  };
  for (const pregunta of preguntas) {
    const resumen = guia.locator('summary', { hasText: pregunta });
    await expect(resumen).toBeVisible();
    await resumen.click();
    const respuesta = faq.mainEntity.find((q) => q.name === pregunta)?.acceptedAnswer.text;
    expect(respuesta).toBeTruthy();
    await expect(guia.getByText(respuesta ?? '')).toBeVisible();
  }
});

test('una dirección que no existe da la página 404, sin indexar y con salida', async ({ page }) => {
  const respuesta = await page.goto('no-existe/');
  expect(respuesta?.status()).toBe(404);
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  const main = page.getByRole('main');
  await expect(main.getByRole('link', { name: 'Finiquito' })).toHaveAttribute(
    'href',
    '/finiquito/',
  );
  await expect(main.getByRole('link', { name: 'Portada' })).toHaveAttribute('href', '/');
});

test('robots.txt apunta al sitemap', async ({ request }) => {
  const texto = await (await request.get('robots.txt')).text();
  expect(texto).toContain('Sitemap:');
});

test('el sitemap lista las cuatro rutas', async ({ request }) => {
  const indice = await (await request.get('sitemap-index.xml')).text();
  const partes = [...indice.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1] ?? '');
  const urls: string[] = [];
  for (const parte of partes) {
    const xml = await (await request.get(new URL(parte).pathname.slice(1))).text();
    urls.push(...[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1] ?? ''));
  }
  expect(urls.toSorted()).toEqual(
    ['', 'aviso-legal/', 'finiquito/', 'privacidad/'].map((r) => `https://eslojusto.es/${r}`),
  );
});

test('cada URL del sitemap lleva la fecha de su último cambio', async ({ request }) => {
  const xml = await (await request.get('sitemap-0.xml')).text();
  const urls = [...xml.matchAll(/<url>(.*?)<\/url>/g)].map((m) => m[1] ?? '');
  expect(urls).toHaveLength(4);
  for (const url of urls) expect(url).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}/);
});
