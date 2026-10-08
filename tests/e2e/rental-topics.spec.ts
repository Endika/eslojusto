import { test, expect } from '@playwright/test';

const PAGES = [
  {
    path: 'alquiler/devolucion-fianza/',
    h1: 'Tu casero no te devuelve la fianza: plazo e intereses',
  },
  { path: 'alquiler/fianza/', h1: 'Fianza del alquiler: cuánto pueden pedirte' },
  { path: 'alquiler/gastos/', h1: 'IBI, comunidad y basura: qué puede cobrarte tu casero' },
];

for (const { path, h1 } of PAGES) {
  test(`${path} renders its heading`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('h1')).toHaveText(h1);
    await expect(page.locator('.footer__note')).toContainText('Ley de Arrendamientos Urbanos');
  });

  test(`${path} never scrolls sideways at 360 px`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(path);
    const [scroll, client] = await page.evaluate(() => [
      document.documentElement.scrollWidth,
      document.documentElement.clientWidth,
    ]);
    expect(scroll).toBeLessThanOrEqual(client);
  });

  test(`${path} declares its path, its trail and its questions`, async ({ page }) => {
    await page.goto(path);
    expect([...(await page.title())].length).toBeLessThanOrEqual(60);
    const description =
      (await page.locator('meta[name="description"]').getAttribute('content')) ?? '';
    expect([...description].length).toBeLessThanOrEqual(155);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      `https://eslojusto.es/${path}`,
    );
    const json = (await page.locator('script[type="application/ld+json"]').textContent()) ?? '';
    const graph = (JSON.parse(json) as { '@graph': Record<string, unknown>[] })['@graph'];
    expect(graph.map((n) => n['@type'])).toEqual(['BreadcrumbList', 'FAQPage']);
    const faq = graph[1] as { mainEntity: { name: string }[] };
    await expect(page.locator('.faq-item summary')).toHaveText(faq.mainEntity.map((q) => q.name));
  });

  test(`${path} links resolve`, async ({ page, request }) => {
    await page.goto(path);
    const hrefs = await page
      .locator('main a[href^="/"], main a[href^="./"]')
      .evaluateAll((links) => links.map((a) => (a as HTMLAnchorElement).href));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of new Set(hrefs)) {
      const response = await request.get(href.split('#')[0] ?? href);
      expect(response.status(), href).toBe(200);
    }
  });
}

test('the deposit pages link to each other and to the review', async ({ page }) => {
  await page.goto('alquiler/fianza/');
  await page
    .getByRole('main')
    .getByRole('link', { name: 'Devolución de la fianza' })
    .first()
    .click();
  await expect(page).toHaveURL(/\/alquiler\/devolucion-fianza\/$/);
  await page.getByRole('link', { name: 'revisión del alquiler' }).click();
  await expect(page).toHaveURL(/\/alquiler\/$/);
});

test('the worked example crosses the year change with each year’s rate', async ({ page }) => {
  await page.goto('alquiler/devolucion-fianza/');
  const example = page.locator('#ejemplo').locator('xpath=..');
  await expect(example).toContainText('Del 16-12-2022 al 31-12-2022 (16 días)');
  await expect(example).toContainText('Del 01-01-2023 al 19-03-2023 (78 días)');
});

test('the review links to the three pages', async ({ page }) => {
  await page.goto('alquiler/');
  for (const href of ['/alquiler/fianza/', '/alquiler/devolucion-fianza/', '/alquiler/gastos/'])
    await expect(page.locator(`a[href$="${href}"]`).first()).toBeAttached();
});
