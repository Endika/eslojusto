import { test, expect, type Page } from '@playwright/test';
import { LAST_UPDATED } from '../../src/content/updated';

const PATHS = ['./', 'finiquito/', 'aviso-legal/', 'privacidad/', 'alquiler/irav-ipc/'];

for (const path of PATHS) {
  test(`${path} has an h1, a title, a description and a canonical`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toBeVisible();
    const title = (await page.title()).trim();
    expect(title).not.toBe('');
    // What Google shows before it cuts the line.
    expect([...title].length).toBeLessThanOrEqual(60);
    const description = await page.locator('meta[name="description"]').getAttribute('content');
    expect(description?.trim()).toBeTruthy();
    expect([...(description ?? '')].length).toBeLessThanOrEqual(155);
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(canonical).toMatch(/^https:\/\/eslojusto\.es\//);
  });
}

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('the final pay explanation reads without JavaScript', async ({ page }) => {
    await page.goto('finiquito/');
    await expect(page.getByText('45 días').first()).toBeVisible();
    await expect(page.getByText('12 de febrero de 2012').first()).toBeVisible();
    await expect(
      page.getByRole('article').getByText('Sin inscribirte como demandante de empleo no hay paro'),
    ).toBeVisible();
  });
});

const data = async (page: Page) =>
  JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? '{}') as {
    '@graph': Record<string, unknown>[];
  };

test('the home page declares the site and who is behind it', async ({ page }) => {
  await page.goto('./');
  const types = (await data(page))['@graph'].map((n) => n['@type']);
  expect(types).toEqual(['WebSite', 'Organization']);
});

test('the final pay page declares a free application, with no ratings or prices', async ({
  page,
}) => {
  await page.goto('finiquito/');
  const graph = (await data(page))['@graph'];
  expect(graph.map((n) => n['@type'])).toEqual(['WebApplication', 'FAQPage']);
  expect(graph[0]).toMatchObject({ isAccessibleForFree: true });
  const text = JSON.stringify(graph);
  for (const field of ['aggregateRating', 'review', 'offers', 'price'])
    expect(text).not.toContain(field);
});

test('the final pay page carries its visible title, the date and the sources', async ({ page }) => {
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

test('the guide explains the benefit with its law, and the FAQ and JSON-LD carry its questions', async ({
  page,
}) => {
  await page.goto('finiquito/');
  const guide = page.getByRole('article');
  await expect(guide.getByRole('heading', { level: 2, name: 'Y el paro' })).toBeVisible();
  await expect(
    guide.getByRole('heading', { level: 2, name: 'Preguntas frecuentes' }),
  ).toBeVisible();
  for (const name of ['Cuánto paro se cobra', 'Cuánto dura el paro', 'Plazo para pedir el paro'])
    await expect(guide.getByRole('heading', { level: 3, name: name })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Ley General de la Seguridad Social (BOE)' }),
  ).toHaveAttribute('href', /^https:\/\/www\.boe\.es\/buscar\/act\.php\?id=BOE-A-2015-11724$/);
  await expect(page.getByRole('link', { name: 'cuantías del SEPE' })).toHaveAttribute(
    'href',
    /^https:\/\/www\.sepe\.es\//,
  );
  await expect(
    guide.getByRole('link', { name: 'informe de tu vida laboral (sede de la Seguridad Social)' }),
  ).toHaveAttribute('href', /^https:\/\/sede\.seg-social\.gob\.es\//);

  const questions = [
    '¿Tengo paro si me despiden o se acaba mi contrato?',
    '¿Cuánto paro voy a cobrar?',
  ];
  const faq = (await data(page))['@graph'].find((n) => n['@type'] === 'FAQPage') as {
    mainEntity: { name: string; acceptedAnswer: { text: string } }[];
  };
  for (const question of questions) {
    const summary = guide.locator('summary', { hasText: question });
    await expect(summary).toBeVisible();
    await summary.click();
    const answer = faq.mainEntity.find((q) => q.name === question)?.acceptedAnswer.text;
    expect(answer).toBeTruthy();
    await expect(guide.getByText(answer ?? '')).toBeVisible();
  }
});

test('an address that does not exist gives the 404 page, unindexed and with a way out', async ({
  page,
}) => {
  const response = await page.goto('no-existe/');
  expect(response?.status()).toBe(404);
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

test('robots.txt points to the sitemap', async ({ request }) => {
  const text = await (await request.get('robots.txt')).text();
  expect(text).toContain('Sitemap:');
});

// Every indexable page has its date of last change, so the dates' list is the sitemap's list:
// a new page joins both at once and this test needs no count.
const SITEMAP_URLS = Object.keys(LAST_UPDATED)
  .map((path) => `https://eslojusto.es${path}`)
  .toSorted();

test('the sitemap lists every page', async ({ request }) => {
  const index = await (await request.get('sitemap-index.xml')).text();
  const parts = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1] ?? '');
  const urls: string[] = [];
  for (const part of parts) {
    const xml = await (await request.get(new URL(part).pathname.slice(1))).text();
    urls.push(...[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1] ?? ''));
  }
  expect(urls.toSorted()).toEqual(SITEMAP_URLS);
  for (const path of ['', 'finiquito/', 'paro/', 'paro/baja-voluntaria/', 'alquiler/irav-ipc/'])
    expect(urls).toContain(`https://eslojusto.es/${path}`);
});

test('every sitemap URL carries the date of its last change', async ({ request }) => {
  const xml = await (await request.get('sitemap-0.xml')).text();
  const urls = [...xml.matchAll(/<url>(.*?)<\/url>/g)].map((m) => m[1] ?? '');
  expect(urls).toHaveLength(SITEMAP_URLS.length);
  for (const url of urls) expect(url).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}/);
});
