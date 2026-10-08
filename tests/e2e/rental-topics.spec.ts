import { test, expect } from '@playwright/test';

const PAGES = [
  {
    path: 'alquiler/subida/',
    h1: 'Cuánto te pueden subir el alquiler en 2026',
    text: '918,00',
  },
  {
    path: 'alquiler/decreto-2026/',
    h1: 'Decreto del alquiler 2026: qué cambia y en qué estado está',
    text: 'pendiente de convalidación',
  },
  {
    path: 'alquiler/honorarios-inmobiliaria/',
    h1: '¿Puede la inmobiliaria cobrarte a ti? Honorarios en el alquiler',
    text: '1.089,00',
  },
] as const;

for (const { path, h1, text } of PAGES) {
  test(`${path} renders its heading, its figure and its metadata`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('h1')).toHaveText(h1);
    await expect(page.locator('main')).toContainText(text);
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

  test(`${path} has links that resolve`, async ({ page, request }) => {
    await page.goto(path);
    const hrefs = await page
      .locator('main a[href^="/"]')
      .evaluateAll((links) => links.map((a) => a.getAttribute('href') ?? ''));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      const response = await request.get(href.split('#')[0] ?? href);
      expect(response.ok(), href).toBe(true);
    }
  });
}

test('the rise page shows the caps table and the pending decree twice over', async ({ page }) => {
  await page.goto('alquiler/subida/');
  const table = page.getByRole('table', { name: /Tope de la subida anual/ });
  await expect(table.getByRole('columnheader')).toHaveText(['Aniversario', 'Tope', 'Norma']);
  await expect(table.locator('tbody tr')).toHaveCount(5);
  await expect(table.locator('tr[data-cap="two"]')).toContainText('08-10-2026');
  await expect(page.locator('.status')).toContainText('pendiente de convalidación');
  await expect(page.locator('.example').first()).toContainText('918,00');
  await expect(page.locator('.example').first()).toContainText('no el 2,47');
});

test('the decree page links to the guides in this build', async ({ page }) => {
  await page.goto('alquiler/decreto-2026/');
  for (const path of ['alquiler/subida/', 'alquiler/honorarios-inmobiliaria/'])
    await expect(page.locator('main').locator(`a[href$="/${path}"]`).first()).toBeVisible();
});

test('the rental hub links to the three guides', async ({ page }) => {
  await page.goto('alquiler/');
  for (const { path, h1 } of PAGES)
    await expect(page.locator('.guide').locator(`a[href$="/${path}"]`)).toHaveText(h1);
});
