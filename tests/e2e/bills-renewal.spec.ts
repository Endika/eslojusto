import { test, expect, type Locator, type Page } from '@playwright/test';
import { fitsScreen, forwardButton, noSideScroll } from '../support/sheets';

// Runs only against a build with /facturas/renovacion/ (PUBLIC_RENEWAL=true, as the e2e config
// builds). Prices of a synthetic letter dated 31-10-2026 that renews on 10-12-2026; the tables
// are read as loaded on this day, so the clock is fixed.
const TODAY = new Date('2026-11-25T12:00:00');

const SIZES = [
  { name: 'desktop', viewport: { width: 1280, height: 800 } },
  { name: '360×640', viewport: { width: 360, height: 640 } },
] as const;

const sheet = (page: Page, name: string) => page.getByRole('group', { name, exact: true });
const type = (scope: Locator, label: string, value: string) =>
  scope.getByLabel(label, { exact: true }).fill(value);
const choose = (scope: Locator, name: string, value: string) =>
  scope.getByRole('group', { name, exact: true }).getByLabel(value, { exact: true }).check();

// The letter's price sheets run taller than a 360 × 640 screen, so only that nothing is wider than
// it and that the buttons stay on screen is checked.
async function next(page: Page) {
  await fitsScreen(page, { whole: false });
  await (await forwardButton(page)).click();
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== 'running'),
  );
}

async function fillLetter(page: Page) {
  const dates = sheet(page, 'Las fechas de la carta');
  await type(dates, 'Fecha de la carta', '2026-10-31');
  await type(dates, 'Fecha en que se renueva', '2026-12-10');
  await next(page);

  const prices = sheet(page, 'Potencia y su precio');
  await type(prices, 'Potencia contratada en P1 (kW)', '5,75');
  await type(prices, 'Potencia contratada en P2 (kW)', '5,75');
  await choose(prices, '¿En qué unidad da la carta el precio de la potencia?', '€/kW y día');
  await type(prices, 'Precio actual de la potencia P1', '0,110283');
  await type(prices, 'Precio actual de la potencia P2', '0,033469');
  await type(prices, 'Precio nuevo de la potencia P1', '0,12303');
  await type(prices, 'Precio nuevo de la potencia P2', '0,052329');
  await next(page);

  const energy = sheet(page, 'Precio de la energía');
  await choose(
    energy,
    '¿Cuántos precios de energía da la carta?',
    'Uno solo, para todas las horas',
  );
  await type(energy, 'Precio actual de la energía (€/kWh)', '0,144972');
  await type(energy, 'Precio nuevo de la energía (€/kWh)', '0,1678');
  await next(page);

  const use = sheet(page, 'Consumo y coste que dice la carta');
  await type(use, 'Consumo anual que usa la carta (kWh)', '4190,2');
  await type(use, 'Coste anual con los precios nuevos, sin impuestos (€)', '1.071,15');
  await type(use, 'Coste anual con los precios nuevos, con impuestos (€)', '1.362,36');
  await next(page);

  const contract = sheet(page, 'Tu contrato');
  await choose(contract, '¿Es un contrato de precio fijo?', 'No');
  await choose(contract, '¿Te llegó la carta aparte de la factura?', 'Sí');
  await next(page);
}

for (const { name, viewport } of SIZES) {
  test(`the Naturgy letter is recalculated by hand at ${name}`, async ({ page }) => {
    await page.clock.setFixedTime(TODAY);
    await page.setViewportSize(viewport);
    await page.goto('facturas/renovacion/');
    await fillLetter(page);

    await expect(page.getByRole('heading', { name: 'Resultado', level: 2 })).toBeFocused();
    const result = page.locator('#resultado');
    await expect(result.locator('[data-lead]')).toContainText('1.071,15 €');
    await expect(result.locator('[data-lead]')).toContainText('+17,8 %');
    await expect(result.locator('[data-renewal]')).toContainText('18,37 €/kW·año');
    await expect(result.locator('[data-renewal]')).toContainText('40 días');
    await noSideScroll(page);
  });
}

test('the guide quotes the notice and the page is listed from /facturas/', async ({ page }) => {
  await page.goto('facturas/');
  await page.getByRole('link', { name: 'Renovación', exact: true }).click();
  await expect(page).toHaveURL(/\/facturas\/renovacion\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('carta de renovación');
  await expect(page.locator('[data-legal-quote]').first()).toBeVisible();
  await expect(page.locator('[data-pass-offer]')).toHaveCount(0);
  await noSideScroll(page);
});
