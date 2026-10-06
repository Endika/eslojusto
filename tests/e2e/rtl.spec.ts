import { test, expect, type Page } from '@playwright/test';

// Runs only against a PRUEBA_RTL=1 build: the ar-test pseudo-locale proves the mirrored layout.

async function hastaElResultado(page: Page) {
  const siguiente = () => page.locator('[data-siguiente]').click();
  await page.locator('#causa-dimision').check();
  await siguiente();
  await page.locator('#fechaAlta').fill('2025-01-01');
  await page.locator('#fechaBaja').fill('2026-09-15');
  await siguiente();
  await page.locator('#prorrateo-si').check();
  await siguiente();
  await page.locator('#salarioMensual').fill('1.850,00');
  await siguiente();
  await page.locator('#diasVacacionesDisfrutadas').fill('0');
  await siguiente();
  await page.locator('#cifra_salario_pendiente').fill('1.234,56');
  await page.locator('[data-revisar]').click();
  await expect(page.locator('#resultado')).toBeVisible();
}

test('la página se declara en ar-test y de derecha a izquierda', async ({ page }) => {
  await page.goto('ar-test/finiquito/');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar-test');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  await expect(page.locator('link[hreflang]')).toHaveCount(0);
});

test('el riel de pestañas va en el canto izquierdo y los taladros a la derecha', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('ar-test/finiquito/');
  const riel = await page.locator('.pestanas').boundingBox();
  expect(riel && riel.x + riel.width <= 1440 / 2).toBe(true);

  const hoja = page.locator('#hoja-causa');
  const caja = await hoja.boundingBox();
  const taladro = await hoja.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const antes = getComputedStyle(el, '::before');
    return r.right - parseFloat(antes.right) - parseFloat(antes.width) / 2;
  });
  expect(caja && taladro > caja.x + caja.width / 2).toBe(true);

  const pestana = await page.locator('.cabecera .logo:visible .logo__pestana').boundingBox();
  const marca = await page.locator('.cabecera .logo:visible .logo__marca').boundingBox();
  expect(pestana && marca && pestana.x + pestana.width / 2 < marca.x + marca.width / 2).toBe(true);
});

test('sin scroll horizontal a 360 px, en las hojas y en el resultado', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('ar-test/finiquito/');
  const sobra = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
  expect(await sobra()).toBeLessThanOrEqual(0);
  await hastaElResultado(page);
  expect(await sobra()).toBeLessThanOrEqual(0);
});

test('los importes siguen en formato español y de izquierda a derecha', async ({ page }) => {
  await page.goto('ar-test/finiquito/');
  await hastaElResultado(page);
  const salario = page.locator('[data-partida][data-estado]').first();
  const empresa = salario.locator('[data-empresa] bdi');
  await expect(empresa).toHaveText(/^1\.234,56\s€$/);
  await expect(empresa).toHaveAttribute('dir', 'ltr');
  await expect(salario.locator('[data-rango] bdi')).toHaveText(/^925,00\s€$/);
});
