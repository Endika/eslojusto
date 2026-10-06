import { test, expect } from '@playwright/test';
test('revisar un finiquito no hace ninguna petición ni deja cookies', async ({ page, context }) => {
  const peticiones: string[] = [];
  await page.goto('finiquito/');
  await page.waitForLoadState('networkidle');
  page.on('request', (r) => peticiones.push(r.url()));
  const siguiente = () => page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByLabel('Baja voluntaria (dimisión)').check();
  await siguiente();
  await page.getByLabel('Fecha de alta', { exact: true }).fill('2020-01-01');
  await page.getByLabel('Fecha de baja', { exact: true }).fill('2026-10-15');
  await siguiente();
  await page
    .getByRole('group', { name: '¿Tus pagas extra van prorrateadas en la nómina?' })
    .getByLabel('Sí')
    .check();
  await siguiente();
  await page.getByLabel('Salario bruto mensual').fill('1500');
  await siguiente();
  await page.getByLabel('Días naturales disfrutados').fill('0');
  await siguiente();
  await page.getByRole('button', { name: 'Revisar' }).click();
  await expect(page.getByRole('heading', { name: /Resultado/ })).toBeVisible();
  expect(peticiones).toEqual([]);
  expect(await context.cookies()).toEqual([]);
});
test('ninguna página carga recursos de otro origen', async ({ page }) => {
  for (const ruta of ['./', 'finiquito/', 'aviso-legal/', 'privacidad/']) {
    const ajenas: string[] = [];
    page.on('request', (r) => {
      if (!r.url().startsWith('http://localhost:4321/')) ajenas.push(r.url());
    });
    await page.goto(ruta);
    await page.waitForLoadState('networkidle');
    expect(ajenas, ruta).toEqual([]);
    page.removeAllListeners('request');
  }
});
test('sin clave de analítica, la CSP no deja conectar con nadie', async ({ page }) => {
  for (const ruta of ['./', 'finiquito/', 'privacidad/']) {
    await page.goto(ruta);
    await expect(page.locator('meta[http-equiv="Content-Security-Policy"]'), ruta).toHaveAttribute(
      'content',
      /connect-src 'none';/,
    );
  }
});
test('la página de privacidad cuenta qué se mide, quién lo recibe y que no hay cookies', async ({
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
