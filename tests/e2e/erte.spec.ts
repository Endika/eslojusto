import { test, expect, type Page } from '@playwright/test';

const result = (page: Page) =>
  page.getByRole('region', { name: /Tu paro durante el ERTE|Sin el tipo/ });
const calculate = (page: Page) => page.getByRole('button', { name: 'Calcular' }).click();
const sheet = (page: Page, name: string | RegExp) => page.getByRole('group', { name });

async function answer(page: Page, group: string | RegExp, option: string) {
  await sheet(page, group).getByLabel(option, { exact: true }).check();
}

test.beforeEach(async ({ page }) => {
  await page.goto('paro/erte/');
});

test('the page exists, is linked from /paro/ and asks only for the type first', async ({
  page,
}) => {
  await expect(page.getByRole('heading', { level: 1, name: 'Paro durante un ERTE' })).toBeVisible();
  await expect(sheet(page, '¿Qué tipo de ERTE tienes?')).toBeVisible();
  await expect(page.getByText('Lo pone en la comunicación que te mandó la empresa.')).toBeVisible();
  await expect(sheet(page, '¿Tu ERTE suspende el contrato o reduce la jornada?')).toBeHidden();
  await page.goto('paro/');
  await page.getByRole('link', { name: 'calcula tu paro durante un ERTE' }).click();
  await expect(page).toHaveURL(/paro\/erte\/$/);
});

test('ETOP suspension: 70 % then 60 %, consumes, 360 days', async ({ page }) => {
  await answer(
    page,
    '¿Qué tipo de ERTE tienes?',
    'Por causas económicas, técnicas, organizativas o de producción',
  );
  await answer(page, '¿Tu ERTE suspende el contrato o reduce la jornada?', 'Suspende el contrato');
  await page.getByLabel('Base reguladora al mes', { exact: true }).fill('1.500,00');
  await answer(page, '¿Cuántos hijos o hijas tienes a tu cargo?', 'Ninguno');
  await calculate(page);
  const r = result(page);
  await expect(r).toContainText('1.050 € al mes los primeros 180 días');
  await expect(r).toContainText('900 € desde el día 181');
  await expect(r).toContainText('Sí. Cada día de ERTE');
  await expect(r).toContainText(
    '360 días cotizados en los últimos 6 años que no hayas usado para otro paro',
  );
  await expect(r).toContainText('Arts. 266.b y 269 LGSS');
  await expect(r).toContainText('Arts. 262.2 y 267.1.b.1.º LGSS');
  await expect(r).not.toContainText('inscrito como demandante');
});

test('force majeure: 70 % throughout, no consumption, no minimum period', async ({ page }) => {
  await answer(page, '¿Qué tipo de ERTE tienes?', 'Por fuerza mayor');
  await answer(page, '¿Tu ERTE suspende el contrato o reduce la jornada?', 'Suspende el contrato');
  await page.getByLabel('Base reguladora al mes', { exact: true }).fill('3000');
  await answer(page, '¿Cuántos hijos o hijas tienes a tu cargo?', '1');
  await calculate(page);
  const r = result(page);
  await expect(r).toContainText('Unos 1.400 € al mes.');
  await expect(r).toContainText('no gasta las cotizaciones que ya tenías');
  await expect(r).toContainText('No hace falta un período mínimo de cotización');
  await expect(r).toContainText('DA 46.ª LGSS');
});

test('RED reduction: capped, proportional, no children question, registration notice', async ({
  page,
}) => {
  await answer(page, '¿Qué tipo de ERTE tienes?', 'Mecanismo RED');
  await expect(sheet(page, '¿Cuántos hijos o hijas tienes a tu cargo?')).toBeHidden();
  await answer(page, '¿Tu ERTE suspende el contrato o reduce la jornada?', 'Reduce la jornada');
  await page.getByLabel('Porcentaje de reducción de la jornada').fill('50');
  await page.getByLabel('Base reguladora al mes', { exact: true }).fill('3000');
  await calculate(page);
  const r = result(page);
  await expect(r).toContainText('Unos 788 € al mes.');
  await expect(r).toContainText('tope de 1.575,00 €');
  await expect(r).toContainText('proporcional a esa reducción (art. 270.5 LGSS)');
  await expect(r).toContainText('no se considera consumido');
  await expect(r).toContainText('DA 41.ª.1 LGSS');
  await expect(r).toContainText('inscrito como demandante de empleo');
  await expect(r).toContainText('DA 41.ª.2.c LGSS');
});

test('«No lo sé» explains the three regimes and gives no single figure', async ({ page }) => {
  await answer(page, '¿Qué tipo de ERTE tienes?', 'No lo sé');
  await expect(sheet(page, '¿Cuál es tu base reguladora?')).toBeHidden();
  await calculate(page);
  const r = result(page);
  await expect(r).toContainText('Sin el tipo de ERTE no hay una sola cifra');
  await expect(r.getByRole('heading', { level: 3 })).toHaveText([
    'Causas económicas, técnicas, organizativas o de producción',
    'Fuerza mayor',
    'Mecanismo RED',
  ]);
  await expect(r).not.toContainText('Unos');
});

test('a reduction outside 10 to 70 % is refused with its range', async ({ page }) => {
  await answer(page, '¿Qué tipo de ERTE tienes?', 'Mecanismo RED');
  await answer(page, '¿Tu ERTE suspende el contrato o reduce la jornada?', 'Reduce la jornada');
  await page.getByLabel('Base reguladora al mes', { exact: true }).fill('1.500,00');
  await page.getByLabel('Porcentaje de reducción de la jornada').fill('5');
  await calculate(page);
  await expect(page.getByText('Escribe un porcentaje entre 10 y 70')).toBeVisible();
  await expect(page.locator('#erte-result')).toBeHidden();
});

test('has the guide, the questions and the way back to /paro/', async ({ page }) => {
  await expect(
    page.getByRole('heading', { name: 'Cómo se calcula el paro durante un ERTE' }),
  ).toBeVisible();
  await expect(page.locator('section:has(#erte-tipos) dt')).toHaveText([
    'Causas económicas, técnicas, organizativas o de producción',
    'Fuerza mayor',
    'Mecanismo RED',
  ]);
  await expect(page.getByText('¿Cobro paro si mi ERTE reduce la jornada?')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Sigue leyendo' })
    .getByRole('link', { name: 'Paro' })
    .click();
  await expect(page).toHaveURL(/paro\/$/);
});

test('missing answers are named and nothing is shown', async ({ page }) => {
  await answer(page, '¿Qué tipo de ERTE tienes?', 'Por fuerza mayor');
  await calculate(page);
  await expect(page.getByText('Elige una opción', { exact: true }).first()).toBeVisible();
  await expect(
    page.getByText('Escribe la base en euros al mes, por ejemplo 1.500,00'),
  ).toBeVisible();
  await expect(page.locator('#erte-result')).toBeHidden();
});

test('changing an answer hides a stale result, and starting over clears the form', async ({
  page,
}) => {
  await answer(page, '¿Qué tipo de ERTE tienes?', 'No lo sé');
  await calculate(page);
  await expect(page.locator('#erte-result')).toBeVisible();
  await answer(page, '¿Qué tipo de ERTE tienes?', 'Mecanismo RED');
  await expect(page.locator('#erte-result')).toBeHidden();
  await answer(page, '¿Qué tipo de ERTE tienes?', 'No lo sé');
  await calculate(page);
  await page.getByRole('button', { name: 'Empezar de nuevo' }).click();
  await expect(page.getByLabel('No lo sé', { exact: true })).not.toBeChecked();
});

test('fits a phone without scrolling sideways', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto('paro/erte/');
  const wide = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(wide).toBe(false);
});
