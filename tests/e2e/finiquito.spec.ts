import { test, expect, type Page } from '@playwright/test';

test('improcedente con indemnización corta → por debajo, con la diferencia', async ({ page }) => {
  await page.goto('finiquito/');
  const siguiente = () => page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByLabel('Despido improcedente').check();
  await siguiente();
  await page.getByLabel('Fecha de alta', { exact: true }).fill('2010-03-01');
  await page.getByLabel('Fecha de baja', { exact: true }).fill('2026-09-15');
  await siguiente();
  await page
    .getByRole('group', { name: '¿Tus pagas extra van prorrateadas en la nómina?' })
    .getByLabel('Sí')
    .check();
  await siguiente();
  await expect(page.getByText('con la parte de pagas extra incluida')).toBeVisible();
  await page.getByLabel('Salario bruto mensual').fill('2142,86');
  await siguiente();
  await page.getByLabel('Días naturales disfrutados').fill('0');
  await siguiente();
  await page.getByLabel('Ninguno').check();
  await siguiente();
  await siguiente();
  await page.getByLabel('Indemnización').fill('40.000,00');
  await page.getByRole('button', { name: 'Revisar' }).click();
  const tarjeta = page.getByRole('region', { name: 'Indemnización' });
  await expect(tarjeta).toContainText('Por debajo del mínimo legal');
  await expect(page.getByRole('heading', { name: /Resultado/ })).toBeFocused();
});

test('error de fechas se anuncia junto al campo', async ({ page }) => {
  await page.goto('finiquito/');
  await page.getByLabel('Baja voluntaria (dimisión)').check();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByLabel('Fecha de alta', { exact: true }).fill('2026-05-01');
  await page.getByLabel('Fecha de baja', { exact: true }).fill('2026-04-01');
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page.getByLabel('Fecha de baja', { exact: true })).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expect(page.getByText('La fecha de baja es anterior a la de alta')).toBeVisible();
});

test('cada hoja cabe en 360×640 y se puede volver a una sección completada', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto('finiquito/');
  await page.getByLabel('Baja voluntaria (dimisión)').check();
  await expect(page.getByRole('button', { name: 'Siguiente' })).toBeInViewport();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByRole('link', { name: /Causa/ }).click();
  await expect(page.getByLabel('Baja voluntaria (dimisión)')).toBeChecked();
});

test('una sección pendiente no es un enlace hasta que se alcanza', async ({ page }) => {
  await page.goto('finiquito/');
  const tira = page.getByRole('navigation', { name: 'Secciones' });
  await expect(page.locator('a:not([href])')).toHaveCount(0);
  await expect(tira.getByRole('link')).toHaveCount(1);
  await expect(tira.locator('[data-pestana="fechas"]')).toHaveAttribute('aria-disabled', 'true');
  await page.getByLabel('Baja voluntaria (dimisión)').check();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(tira.getByRole('link')).toHaveCount(2);
  await expect(tira.getByRole('link', { name: /Fechas/ })).toHaveAttribute('aria-current', 'step');
  await expect(page.locator('a:not([href])')).toHaveCount(0);
});

test('el tema sigue al sistema y el botón lo fija', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('finiquito/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: /Tema|Modo claro/ }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('sin scroll horizontal a 360 px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('finiquito/');
  const sobra = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(sobra).toBeLessThanOrEqual(0);
});

test('la CSP no bloquea nada: el tema y las fuentes salen del propio sitio', async ({ page }) => {
  const bloqueos: string[] = [];
  page.on('console', (m) => {
    if (/Content Security Policy/i.test(m.text())) bloqueos.push(m.text());
  });
  const fuera: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith('http://localhost:4321/')) fuera.push(r.url());
  });
  await page.goto('finiquito/');
  await page.evaluate(() => document.fonts.ready);
  expect(bloqueos).toEqual([]);
  expect(fuera).toEqual([]);
});

test('una cifra con coma decimal y puntos de miles se lee en formato español', async ({ page }) => {
  await page.goto('finiquito/');
  const siguiente = () => page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByLabel('Baja voluntaria (dimisión)').check();
  await siguiente();
  await page.getByLabel('Fecha de alta', { exact: true }).fill('2025-01-01');
  await page.getByLabel('Fecha de baja', { exact: true }).fill('2026-09-15');
  await siguiente();
  await page
    .getByRole('group', { name: '¿Tus pagas extra van prorrateadas en la nómina?' })
    .getByLabel('Sí')
    .check();
  await siguiente();
  await page.getByLabel('Salario bruto mensual').fill('1.850,00');
  await siguiente();
  await page.getByLabel('Días naturales disfrutados').fill('0');
  await siguiente();
  await page.getByLabel('Descuento por no preavisar').fill('1,234.56');
  await page.getByRole('button', { name: 'Revisar' }).click();
  await expect(page.getByLabel('Descuento por no preavisar')).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await page.getByLabel('Descuento por no preavisar').fill('');
  await page.getByLabel('Salario del mes de la baja').fill('1.234,56');
  await page.getByRole('button', { name: 'Revisar' }).click();
  const salario = page.getByRole('region', { name: 'Salario del mes de la baja' });
  await expect(salario.locator('[data-empresa]')).toHaveText(/^1\.234,56\s€$/);
  // 1.850,00 € al mes × 15 días de septiembre = 925,00 €: the salary was read as 1850, not 1,85.
  await expect(salario.locator('[data-rango]')).toHaveText(/^925,00\s€$/);
  const indemnizacion = page.getByRole('region', { name: 'Indemnización' });
  await expect(indemnizacion).toContainText('No te corresponde indemnización por ley en este caso');
  await expect(indemnizacion).not.toContainText('Coincide con el mínimo legal');
  await expect(indemnizacion).not.toContainText('No has metido la cifra');
});

test('sin prorrateo, las pagas extra van en su propia hoja y caben en 360×640', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto('finiquito/');
  const siguiente = page.getByRole('button', { name: 'Siguiente' });
  await page.getByLabel('Despido objetivo').check();
  await siguiente.click();
  await page.getByLabel('Fecha de alta', { exact: true }).fill('2020-03-01');
  await page.getByLabel('Fecha de baja', { exact: true }).fill('2026-09-15');
  await siguiente.click();
  await page
    .getByRole('group', { name: '¿Tus pagas extra van prorrateadas en la nómina?' })
    .getByLabel('No')
    .check();
  await siguiente.click();
  await expect(page.getByText('Tu bruto mensual sin las pagas extra')).toBeVisible();
  await page.getByLabel('Salario bruto mensual').fill('1850');
  await expect(page.getByLabel('Importe de cada paga')).toBeHidden();
  await siguiente.click();
  await expect(page.getByRole('heading', { name: '¿Cómo son tus pagas extra?' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Salario/ })).toHaveAttribute('aria-current', 'step');
  await siguiente.click();
  await expect(page.getByText('Falta el importe', { exact: true })).toBeVisible();
  await page.getByLabel('Importe de cada paga').fill('1.850,00');
  await page.getByLabel('Semestral').check();
  const ultimo = await page
    .getByRole('group', { name: '¿Cuándo se generan?' })
    .getByLabel('No lo sé')
    .boundingBox();
  const barra = await siguiente.boundingBox();
  expect(ultimo && barra && ultimo.y + ultimo.height <= barra.y).toBe(true);
  await expect(siguiente).toBeInViewport();
  await siguiente.click();
  await expect(page.getByRole('heading', { name: 'Tus vacaciones y tu preaviso' })).toBeVisible();
  await page.getByRole('button', { name: 'Atrás' }).click();
  await expect(page.getByLabel('Importe de cada paga')).toHaveValue('1.850,00');
});

async function cabe(page: Page) {
  const accion = page.getByRole('button', { name: /^(Siguiente|Revisar)$/ });
  await expect(accion).toBeInViewport();
  const { fondo, barra } = await page.evaluate(() => {
    const hoja = [...document.querySelectorAll<HTMLElement>('.hoja[data-hoja]')].find(
      (h) => !h.hidden,
    );
    const controles = [...(hoja?.querySelectorAll<HTMLElement>('input, .opcion, .ficha') ?? [])];
    const visibles = controles.filter((c) => c.offsetParent !== null);
    return {
      fondo: Math.max(...visibles.map((c) => c.getBoundingClientRect().bottom)),
      barra: document.querySelector('.acciones')?.getBoundingClientRect().top ?? 0,
    };
  });
  expect(fondo).toBeLessThanOrEqual(barra);
}

test('fin de contrato temporal: cada hoja cabe en 360×640, también las condicionales', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto('finiquito/');
  const siguiente = () => page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByLabel('Fin de contrato temporal').check();
  await cabe(page);
  await siguiente();
  await expect(
    page.getByRole('heading', { name: '¿Qué tipo de contrato temporal tenías?' }),
  ).toBeVisible();
  await page.getByLabel('Eventual').check();
  await cabe(page);
  await siguiente();
  await page.getByLabel('Fecha de alta', { exact: true }).fill('2020-03-01');
  await page.getByLabel('Fecha de baja', { exact: true }).fill('2026-09-15');
  await cabe(page);
  await siguiente();
  await expect(
    page.getByRole('heading', { name: '¿Tus pagas extra van prorrateadas en la nómina?' }),
  ).toBeVisible();
  await page
    .getByRole('group', { name: '¿Tus pagas extra van prorrateadas en la nómina?' })
    .getByLabel('No')
    .check();
  await cabe(page);
  await siguiente();
  await page.getByLabel('Salario bruto mensual').fill('1850');
  await cabe(page);
  await siguiente();
  await page.getByLabel('Importe de cada paga').fill('1850');
  await cabe(page);
  await siguiente();
  await page.getByRole('checkbox', { name: 'No lo sé' }).check();
  await expect(page.getByLabel('Días naturales disfrutados')).toBeDisabled();
  await cabe(page);
  await siguiente();
  await page.getByLabel('Ninguno').check();
  await cabe(page);
  await siguiente();
  await cabe(page);
  await siguiente();
  await cabe(page);
  for (let i = 0; i < 8; i++) await page.getByRole('button', { name: 'Atrás' }).click();
  await expect(page.getByLabel('Eventual')).toBeChecked();
});

test('quien cobra justo el mínimo legal ve «Coincide» en todas las partidas', async ({ page }) => {
  await page.goto('finiquito/');
  const siguiente = () => page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByLabel('Despido objetivo').check();
  await siguiente();
  await page.getByLabel('Fecha de alta', { exact: true }).fill('2018-05-03');
  await page.getByLabel('Fecha de baja', { exact: true }).fill('2026-07-20');
  await siguiente();
  await page
    .getByRole('group', { name: '¿Tus pagas extra van prorrateadas en la nómina?' })
    .getByLabel('No')
    .check();
  await siguiente();
  await page.getByLabel('Salario bruto mensual').fill('1.500,00');
  await siguiente();
  await page.getByLabel('Importe de cada paga').fill('1.500,00');
  await siguiente();
  await page.getByLabel('Días naturales disfrutados').fill('7');
  await page.getByLabel('Días de preaviso que te dio la empresa').fill('5');
  await siguiente();
  await page.getByLabel('Prefiero no decirlo').check();
  await siguiente();
  await siguiente();
  await page.getByRole('button', { name: 'Revisar' }).click();

  // The first revision, with no employer figures, gives each legal minimum.
  const partidas = page.locator('[data-partida]');
  await expect(partidas.first()).toBeVisible();
  const minimos = new Map<string, string>();
  for (const hoja of await partidas.all()) {
    const id = (await hoja.getAttribute('data-partida')) ?? '';
    const minimo = (await hoja.locator('[data-rango] bdi').first().textContent()) ?? '';
    minimos.set(id, minimo.replace(/\s€$/, ''));
  }
  expect([...minimos.keys()]).toEqual([
    'salario_pendiente',
    'vacaciones',
    'pagas_extra',
    'indemnizacion',
    'preaviso_empresa',
  ]);

  await page.getByRole('link', { name: /Tu finiquito/ }).click();
  for (const [id, minimo] of minimos) await page.locator(`#cifra_${id}`).fill(minimo);
  await page.getByRole('button', { name: 'Revisar' }).click();
  for (const id of minimos.keys())
    await expect(page.locator(`[data-partida="${id}"] [data-estado-texto]`)).toHaveText(
      'Coincide con el mínimo legal',
    );
});

test('con pagas prorrateadas, el salario lleva la prorrata y la indemnización sale entera', async ({
  page,
}) => {
  await page.goto('finiquito/');
  const siguiente = () => page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByLabel('Despido improcedente').check();
  await siguiente();
  await page.getByLabel('Fecha de alta', { exact: true }).fill('2018-05-03');
  await page.getByLabel('Fecha de baja', { exact: true }).fill('2026-07-20');
  await siguiente();
  await page
    .getByRole('group', { name: '¿Tus pagas extra van prorrateadas en la nómina?' })
    .getByLabel('Sí')
    .check();
  await siguiente();
  // 1.500 € de base más dos pagas de 1.500 € repartidas en doce nóminas: 1.750 € al mes.
  await page.getByLabel('Salario bruto mensual').fill('1.750,00');
  await siguiente();
  await page.getByLabel('Días naturales disfrutados').fill('0');
  await siguiente();
  await page.getByLabel('Ninguno').check();
  await siguiente();
  await siguiente();
  await page.getByRole('button', { name: 'Revisar' }).click();
  // The CGPJ guide's own example: 21.000 € × 272,25 / 365.
  await expect(page.locator('[data-partida="indemnizacion"] [data-rango]')).toContainText(
    '15.663,70',
  );
});
