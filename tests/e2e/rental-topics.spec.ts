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
  {
    path: 'alquiler/fianza/',
    h1: 'Fianza del alquiler: cuánto pueden pedirte',
    text: 'una mensualidad',
  },
  {
    path: 'alquiler/devolucion-fianza/',
    h1: 'Tu casero no te devuelve la fianza: plazo e intereses',
    text: 'un mes',
  },
  {
    path: 'alquiler/gastos/',
    h1: 'IBI, comunidad y basura: qué puede cobrarte tu casero',
    text: 'importe anual',
  },
] as const;

for (const { path, h1, text } of PAGES) {
  test(`${path} renders its heading, its text and its footer`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('h1')).toHaveText(h1);
    await expect(page.locator('main')).toContainText(text);
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

  test(`${path} links resolve and reach the other pages`, async ({ page, request }) => {
    await page.goto(path);
    const hrefs = await page
      .locator('main a[href^="/"], main a[href^="./"]')
      .evaluateAll((links) => links.map((a) => (a as HTMLAnchorElement).href));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of new Set(hrefs)) {
      const response = await request.get(href.split('#')[0] ?? href);
      expect(response.status(), href).toBe(200);
    }
    const next = page.getByRole('navigation', { name: 'Sigue leyendo' });
    for (const to of ['alquiler/', 'alquiler/irav-ipc/', ...PAGES.map((p) => p.path)])
      if (to !== path) await expect(next.locator(`a[href$="/${to}"]`)).toHaveCount(1);
    await expect(next.locator(`a[href$="/${path}"]`)).toHaveCount(0);
  });
}

test('the rise page lists the caps and the pending decree twice over', async ({ page }) => {
  await page.goto('alquiler/subida/');
  const caps = page.locator('dl.caps');
  await expect(caps.locator('dt')).toHaveCount(5);
  await expect(caps.locator('[data-cap="two"]')).toContainText('08-10-2026');
  await expect(page.locator('.status')).toContainText('pendiente de convalidación');
  await expect(page.locator('.example').first()).toContainText('918,00');
  await expect(page.locator('.example').first()).toContainText('no el 2,47');
});

test('the decree page links to the guides in this build', async ({ page }) => {
  await page.goto('alquiler/decreto-2026/');
  for (const path of ['alquiler/subida/', 'alquiler/honorarios-inmobiliaria/'])
    await expect(page.locator('main').locator(`a[href$="/${path}"]`).first()).toBeVisible();
});

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

test('the review lists the six pages', async ({ page }) => {
  await page.goto('alquiler/');
  const guides = page.getByRole('navigation', { name: 'Guías' });
  for (const { path, h1 } of PAGES)
    await expect(guides.locator(`a[href$="/${path}"]`)).toHaveText(h1);
});

test('each block of the review points to the page that goes deeper', async ({ page }) => {
  await page.goto('alquiler/');
  for (const path of [
    'alquiler/honorarios-inmobiliaria/',
    'alquiler/fianza/',
    'alquiler/subida/',
    'alquiler/devolucion-fianza/',
    'alquiler/gastos/',
  ])
    await expect(
      page.locator('.guide__sheets section').locator(`a[href$="/${path}"]`),
    ).toBeAttached();
});
