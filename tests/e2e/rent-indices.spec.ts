import { test, expect } from '@playwright/test';
import { monthRows } from '../../src/content/rent-indices';

const PATH = 'alquiler/irav-ipc/';

test('the rent indices page shows one row per month with its sources', async ({ page }) => {
  await page.goto(PATH);
  await expect(page.locator('h1')).toHaveText('IRAV e IPC de cada mes');
  const table = page.getByRole('table', { name: /IRAV, IPC e IGC por mes/ });
  await expect(table.locator('tbody tr')).toHaveCount(monthRows().length);
  await expect(table.getByRole('columnheader')).toHaveText([
    'Mes',
    'IRAV',
    'IPC adelantado',
    'IPC definitivo',
    'IGC',
  ]);
  const august = table.locator('tr[data-month="2026-08"]');
  await expect(august.getByRole('rowheader')).toHaveText('agosto de 2026');
  await expect(
    august.getByRole('link', { name: 'publicado el 15-09-2026' }).first(),
  ).toHaveAttribute('href', /^https:\/\/www\.ine\.es\//);
  await expect(page.getByText('pendiente de convalidación')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Próximamente: comprueba tu subida' }),
  ).toBeVisible();
});

test('the rent indices page never scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(PATH);
  const [scroll, client] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(scroll).toBeLessThanOrEqual(client);
});

test('the rent indices page declares its data, its path and its questions', async ({ page }) => {
  await page.goto(PATH);
  const title = await page.title();
  expect(title).toMatch(/^IRAV e IPC para el alquiler: \w+ \d{4}$/);
  expect([...title].length).toBeLessThanOrEqual(60);
  const description =
    (await page.locator('meta[name="description"]').getAttribute('content')) ?? '';
  expect([...description].length).toBeLessThanOrEqual(155);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://eslojusto.es/alquiler/irav-ipc/',
  );
  const json = (await page.locator('script[type="application/ld+json"]').textContent()) ?? '';
  const graph = (JSON.parse(json) as { '@graph': Record<string, unknown>[] })['@graph'];
  expect(graph.map((n) => n['@type'])).toEqual(['Dataset', 'BreadcrumbList', 'FAQPage']);
  const faq = graph[2] as { mainEntity: { name: string }[] };
  await expect(page.locator('.faq-item summary')).toHaveText(faq.mainEntity.map((q) => q.name));
});

test('the home page links to the rent indices', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('link', { name: 'IRAV e IPC de cada mes' }).click();
  await expect(page).toHaveURL(/\/alquiler\/irav-ipc\/$/);
});

test('the footer names the rental norms, and the final pay keeps its own', async ({ page }) => {
  await page.goto('alquiler/irav-ipc/');
  await expect(page.locator('.footer__note')).toContainText('Ley de Arrendamientos Urbanos');
  await expect(page.locator('.footer__note')).not.toContainText('Estatuto de los Trabajadores');
  await page.goto('finiquito/');
  await expect(page.locator('.footer__note')).toContainText('Estatuto de los Trabajadores');
});
