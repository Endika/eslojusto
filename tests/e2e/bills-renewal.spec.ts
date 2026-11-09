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

async function next(page: Page) {
  await fitsScreen(page);
  await (await forwardButton(page)).click();
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== 'running'),
  );
}

// Every question the form can ask is asked when the letter gives its energy prices by period.
async function fillLetter(page: Page, { longest = false } = {}) {
  await type(sheet(page, 'Las fechas de la carta'), 'Fecha de la carta', '2026-10-31');
  await type(sheet(page, 'Las fechas de la carta'), 'Fecha en que se renueva', '2026-12-10');
  await next(page);

  const power = sheet(page, 'Tu potencia');
  await type(power, 'Potencia contratada en P1 (kW)', '5,75');
  await type(power, 'Potencia contratada en P2 (kW)', '5,75');
  await choose(power, '¿En qué unidad da la carta el precio de la potencia?', '€/kW y día');
  await next(page);
  const current = sheet(page, 'Precio actual de la potencia');
  await type(current, 'Precio actual de la potencia P1', '0,110283');
  await type(current, 'Precio actual de la potencia P2', '0,033469');
  await next(page);
  const fresh = sheet(page, 'Precio nuevo de la potencia');
  await type(fresh, 'Precio nuevo de la potencia P1', '0,12303');
  await type(fresh, 'Precio nuevo de la potencia P2', '0,052329');
  await next(page);

  const pricing = sheet(page, 'Precios de la energía');
  const energy = sheet(page, 'Precio actual de la energía');
  const newEnergy = sheet(page, 'Precio nuevo de la energía');
  const periods = 'Uno por periodo (P1, P2 y P3)';
  const single = 'Uno solo, para todas las horas';
  await choose(pricing, '¿Cuántos precios actuales?', longest ? periods : single);
  await choose(pricing, '¿Cuántos precios nuevos?', longest ? periods : single);
  await next(page);
  if (longest) {
    await type(energy, 'Precio actual de la energía P1 (€/kWh)', '0,2');
    await type(energy, 'Precio actual de la energía P2 (€/kWh)', '0,15');
    await type(energy, 'Precio actual de la energía P3 (€/kWh)', '0,1');
    await next(page);
    await type(newEnergy, 'Precio nuevo de la energía P1 (€/kWh)', '0,22');
    await type(newEnergy, 'Precio nuevo de la energía P2 (€/kWh)', '0,17');
    await type(newEnergy, 'Precio nuevo de la energía P3 (€/kWh)', '0,12');
  } else {
    await type(energy, 'Precio actual de la energía (€/kWh)', '0,144972');
    await next(page);
    await type(newEnergy, 'Precio nuevo de la energía (€/kWh)', '0,1678');
  }
  await next(page);

  await type(sheet(page, 'Consumo anual'), 'Consumo anual que usa la carta (kWh)', '4190,2');
  await next(page);
  const letter = sheet(page, 'Coste que dice la carta');
  await type(letter, 'Coste anual con los precios nuevos, sin impuestos (€)', '1.071,15');
  await type(letter, 'Coste anual con los precios nuevos, con impuestos (€)', '1.362,36');
  await next(page);

  await choose(
    sheet(page, 'Cómo te llegó la carta'),
    '¿Te llegó la carta aparte de la factura?',
    'Sí',
  );
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
    await expect(result.locator('[data-renewal]')).toContainText('La carta cambia los precios');
    await noSideScroll(page);
  });
}

test('the guide quotes the notice and the page is listed from /facturas/', async ({ page }) => {
  await page.goto('facturas/');
  await page.getByRole('link', { name: 'Renovación', exact: true }).click();
  await expect(page).toHaveURL(/\/facturas\/renovacion\/(#[a-z-]+)?$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('carta de renovación');
  await expect(page.locator('[data-legal-quote]').first()).toBeVisible();
  await expect(page.locator('[data-pass-offer]')).toHaveCount(0);
  await noSideScroll(page);
});

test('every sheet of the longest path fits in 360×640', async ({ page }) => {
  await page.clock.setFixedTime(TODAY);
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto('facturas/renovacion/');
  await fillLetter(page, { longest: true });
  await expect(page.getByRole('heading', { name: 'Resultado', level: 2 })).toBeFocused();
  await noSideScroll(page);
});
