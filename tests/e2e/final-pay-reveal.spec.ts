import { test, expect, type Page } from '@playwright/test';
import { nextSheet } from '../support/sheets';

// The specs run with reduced motion, which never shows the sequence; this one asks for it and
// draws the staged half.
test.use({ reducedMotion: 'no-preference' });

async function walkToReview(page: Page, half: number) {
  await page.addInitScript((value) => {
    Math.random = () => value;
  }, half);
  await page.goto('finiquito/');
  const next = () => nextSheet(page);
  await page.getByLabel('Despido improcedente').check();
  await next();
  await page.getByLabel('Fecha de alta', { exact: true }).fill('2010-03-01');
  await page.getByLabel('Fecha de baja', { exact: true }).fill('2026-09-15');
  await next();
  await next();
  await page
    .getByRole('group', { name: '¿Tus pagas extra van prorrateadas en la nómina?' })
    .getByLabel('Sí')
    .check();
  await next();
  await page.getByLabel('Salario bruto mensual').fill('2142,86');
  await next();
  await next();
  await page.getByLabel('Disfrutados este año').fill('0');
  await next();
  await page.getByLabel('Ninguno').check();
  await next();
  await next();
  await next();
  await page.getByLabel('Indemnización').fill('40.000,00');
  await page.getByRole('button', { name: 'Revisar' }).click();
}

test('the staged half sees the checks go by, then the result', async ({ page }) => {
  await walkToReview(page, 0.1);
  const result = page.locator('#resultado');
  const card = page.getByRole('region', { name: 'Indemnización' });
  await expect(result.locator('[data-reveal-steps] li').first()).toHaveText(
    /^Comprobado con la ley: /,
  );
  await expect(card).toBeHidden();
  await expect(page.getByRole('heading', { name: /Resultado/ })).toBeFocused();
  await expect(result.getByRole('status')).toHaveText(
    /^Partidas comprobadas: \d+\. Referencias legales: \d+\.$/,
  );
  await expect(card).toContainText('Por debajo del mínimo legal', { timeout: 4000 });
  await expect(result.locator('[data-reveal]')).toBeHidden();
});

test('the other half sees the result at once', async ({ page }) => {
  await walkToReview(page, 0.9);
  await expect(page.getByRole('region', { name: 'Indemnización' })).toContainText(
    'Por debajo del mínimo legal',
  );
  await expect(page.locator('#resultado [data-reveal]')).toBeHidden();
});
