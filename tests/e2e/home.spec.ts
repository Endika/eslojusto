import { test, expect } from '@playwright/test';

test('the home page files each review under its theme', async ({ page }) => {
  await page.goto('./');
  const groups = page.locator('main').getByRole('heading', { level: 2 });
  await expect(groups).toHaveText(['Trabajo', 'Vivienda', 'Dinero']);

  for (const [group, reviews] of [
    [
      'Trabajo',
      [
        ['Finiquito', '/finiquito/'],
        ['Paro', '/paro/'],
        ['Contrato de trabajo', '/contrato/'],
        ['Empleada de hogar', '/empleada-de-hogar/'],
      ],
    ],
    [
      'Vivienda',
      [
        ['Alquiler', '/alquiler/'],
        ['Hipoteca', '/hipoteca/'],
      ],
    ],
    [
      'Dinero',
      [
        ['Seguros', '/seguros/'],
        ['Financiación', '/financiacion/'],
        ['Facturas', '/facturas/'],
      ],
    ],
  ] as const) {
    const region = page.getByRole('region', { name: group });
    await expect(region.getByRole('article')).toHaveCount(reviews.length);
    for (const [name, href] of reviews)
      await expect(region.getByRole('link', { name, exact: true })).toHaveAttribute('href', href);
  }
  await expect(page.getByText(/^Próximamente/)).toHaveCount(0);
  await expect(
    page
      .getByRole('region', { name: 'Vivienda' })
      .getByRole('link', { name: 'IRAV e IPC de cada mes' }),
  ).toBeVisible();
});

test('a card is one link, and the whole card answers to it', async ({ page }) => {
  await page.goto('./');
  const card = page.getByRole('article', { name: 'Finiquito' });
  await expect(card.getByRole('link')).toHaveCount(1);
  await expect(card.getByText('Revisar')).toBeVisible();
  // A real click on the situation line, plain text outside the link, lands on the stretched link.
  const line = await card.getByText('Te vas o te echan').boundingBox();
  if (!line) throw new Error('the situation line is not on screen');
  await page.mouse.click(line.x + line.width / 2, line.y + line.height / 2);
  await expect(page).toHaveURL(/\/finiquito\/$/);
});

test('the first card starts within the first screen, and nothing scrolls sideways', async ({
  page,
}) => {
  await page.goto('./');
  const viewport = page.viewportSize();
  const card = await page.getByRole('article', { name: 'Finiquito' }).boundingBox();
  expect(viewport && card && card.y + card.height <= viewport.height).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
});

test('the title, text and citation faces are preloaded, and nothing shifts as the page loads', async ({
  page,
}) => {
  await page.goto('./');
  const preloaded = await page
    .locator('link[rel="preload"][as="font"]')
    .evaluateAll((links) => links.map((l) => l.getAttribute('href') ?? ''));
  for (const face of [
    /golos-text-latin-wght-normal\..+\.woff2$/,
    /source-serif-4-latin-wght-normal\..+\.woff2$/,
    /martian-mono-latin-standard-normal\..+\.woff2$/,
  ])
    expect(
      preloaded.some((href) => face.test(href)),
      String(face),
    ).toBe(true);
  const swaps = await page
    .locator('style')
    .evaluateAll((styles) => styles.some((s) => /font-display:\s*swap/.test(s.textContent ?? '')));
  expect(swaps, 'a face that swaps in late reflows the page').toBe(false);

  const shift = await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return new Promise<number>((resolve) => {
      new PerformanceObserver((list) => {
        let total = 0;
        for (const entry of list.getEntries() as unknown as { value: number }[])
          total += entry.value;
        resolve(total);
      }).observe({ type: 'layout-shift', buffered: true });
      // With no shift at all, the observer is never called.
      setTimeout(() => resolve(0), 500);
    });
  });
  expect(shift).toBeLessThan(0.01);
});
