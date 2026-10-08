import { test, expect } from '@playwright/test';

// A plain build: Alquiler and Contrato wait behind their build switches.
test('the home page files each review under its theme', async ({ page }) => {
  await page.goto('./');
  const groups = page.locator('main').getByRole('heading', { level: 2 });
  await expect(groups).toHaveText(['Trabajo', 'Vivienda', 'Dinero']);

  const work = page.getByRole('region', { name: 'Trabajo' });
  await expect(work.getByRole('article')).toHaveCount(2);
  await expect(work.getByRole('link', { name: 'Finiquito' })).toHaveAttribute(
    'href',
    '/finiquito/',
  );
  await expect(work.getByRole('link', { name: 'Paro' })).toHaveAttribute('href', '/paro/');
  await expect(work.getByText('Próximamente: Contrato de trabajo')).toBeVisible();

  const housing = page.getByRole('region', { name: 'Vivienda' });
  await expect(housing.getByRole('article')).toHaveCount(0);
  await expect(housing.getByText('Próximamente: Alquiler, Hipoteca')).toBeVisible();
  await expect(housing.getByRole('link', { name: 'IRAV e IPC de cada mes' })).toBeVisible();

  const money = page.getByRole('region', { name: 'Dinero' });
  await expect(money.getByRole('article')).toHaveCount(0);
  await expect(money.getByText('Próximamente: Financiación y seguros, Facturas')).toBeVisible();
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
