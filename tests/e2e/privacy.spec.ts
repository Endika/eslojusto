import { test, expect } from '@playwright/test';
import { nextSheet } from '../support/sheets';

const ORIGIN = `http://localhost:${process.env['E2E_PORT'] ?? 4321}`;
test('reviewing a final pay makes no request and leaves no cookies', async ({ page, context }) => {
  const requests: string[] = [];
  await page.goto('finiquito/');
  await page.waitForLoadState('networkidle');
  page.on('request', (r) => requests.push(r.url()));
  const next = () => nextSheet(page);
  await page.getByLabel('Baja voluntaria (dimisión)').check();
  await next();
  await page.getByLabel('Fecha de alta', { exact: true }).fill('2020-01-01');
  await page.getByLabel('Fecha de baja', { exact: true }).fill('2026-10-15');
  await next();
  await page
    .getByRole('group', { name: '¿Tus pagas extra van prorrateadas en la nómina?' })
    .getByLabel('Sí')
    .check();
  await next();
  await page.getByLabel('Salario bruto mensual').fill('1500');
  await next();
  await page.getByLabel('Disfrutados este año').fill('0');
  await next();
  await next();
  await next();
  await page.getByRole('button', { name: 'Revisar' }).click();
  await expect(page.getByRole('heading', { name: /Resultado/ })).toBeVisible();
  expect(requests).toEqual([]);
  expect(await context.cookies()).toEqual([]);
});
test('no page loads resources from another origin', async ({ page }) => {
  for (const path of ['./', 'finiquito/', 'aviso-legal/', 'privacidad/']) {
    const external: string[] = [];
    page.on('request', (r) => {
      if (!r.url().startsWith(`${ORIGIN}/`)) external.push(r.url());
    });
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    expect(external, path).toEqual([]);
    page.removeAllListeners('request');
  }
});
test('without an analytics key, the CSP lets the page connect only to its own site', async ({
  page,
}) => {
  for (const path of ['./', 'finiquito/', 'privacidad/']) {
    await page.goto(path);
    await expect(page.locator('meta[http-equiv="Content-Security-Policy"]'), path).toHaveAttribute(
      'content',
      /connect-src 'self';/,
    );
  }
});
test('the privacy page says what is tracked, who receives it and that there are no cookies', async ({
  page,
}) => {
  await page.goto('privacidad/');
  const main = page.locator('main');
  await expect(main).toContainText('Lo que escribes en la revisión no sale de tu dispositivo');
  await expect(main).toContainText('PostHog');
  await expect(main).toContainText('Unión Europea');
  await expect(main).toContainText('Esta web no usa cookies');
  await expect(main).toContainText('Fráncfort');
  await expect(main).toContainText('se conservan un año');
  await expect(main).not.toContainText('sessionStorage');
  await expect(main.getByRole('link', { name: 'página de privacidad' })).toHaveAttribute(
    'href',
    'https://posthog.com/docs/privacy',
  );
  await expect(main).toContainText('interés legítimo');
  await expect(main).toContainText('Puedes oponerte a esta medición (art. 21');
  await expect(main).toContainText('Global Privacy Control o Do Not Track');
  await expect(main).not.toContainText('anónim');
  await expect(main).toContainText('GitHub Pages');
  await expect(main.getByRole('link', { name: 'hola@eslojusto.es' })).toBeVisible();
  await expect(main.getByRole('link', { name: /Protección de Datos/ })).toBeVisible();
});
test('the legal notice identifies the owner on every build', async ({ page }) => {
  await page.goto('aviso-legal/');
  const owner = page.locator('[data-owner]');
  await expect(owner).toContainText('Titular');
  await expect(owner).toContainText('Endika Iglesias');
  await expect(owner).toContainText('NIF');
  await expect(owner).toContainText('Domicilio');
  await expect(owner).toContainText('Calle Barranco del Novillo 26, 28051 Madrid');
  await expect(owner.getByRole('link', { name: 'hola@eslojusto.es' })).toBeVisible();
  await expect(page.locator('main')).toContainText('Actualizado el 9 de octubre de 2026');
});
