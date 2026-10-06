import { test, expect, type Page } from '@playwright/test';

const siguiente = (page: Page) => page.getByRole('button', { name: 'Siguiente' }).click();

// From the cause to the sheet after holidays, with prorated extra pay and no days taken.
async function hastaVacaciones(page: Page, causa: string, alta: string, baja: string) {
  await page.goto('finiquito/');
  await page.getByLabel(causa).check();
  await siguiente(page);
  await page.getByLabel('Fecha de alta', { exact: true }).fill(alta);
  await page.getByLabel('Fecha de baja', { exact: true }).fill(baja);
  await siguiente(page);
  await page
    .getByRole('group', { name: '¿Tus pagas extra van prorrateadas en la nómina?' })
    .getByLabel('Sí')
    .check();
  await siguiente(page);
  await page.getByLabel('Salario bruto mensual').fill('2.000,00');
  await siguiente(page);
  await page.getByLabel('Días naturales disfrutados').fill('0');
  await siguiente(page);
}

const paro = (page: Page) => page.getByRole('region', { name: 'Tu paro (estimación)' });

async function diasDeParo(page: Page): Promise<number> {
  const texto = (await paro(page).locator('[data-paro-duracion]').textContent()) ?? '';
  const m = /unos (\d+) días/i.exec(texto);
  return m ? Number(m[1]) : 0;
}

async function cabe(page: Page) {
  await expect(page.getByRole('button', { name: /^(Siguiente|Revisar)$/ })).toBeInViewport();
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

test('despido objetivo con un hijo a cargo: la estimación lleva cifras', async ({ page }) => {
  await hastaVacaciones(page, 'Despido objetivo', '2020-03-01', '2026-09-15');
  await expect(
    page.getByRole('heading', { name: /hijos o hijas tienes a tu cargo/ }),
  ).toBeVisible();
  await siguiente(page);
  await expect(
    page.getByText('Elige una opción; «Prefiero no decirlo» también vale'),
  ).toBeVisible();
  await page.getByLabel('1', { exact: true }).check();
  await siguiente(page);
  await expect(
    page.getByRole('heading', { name: /otros sitios en los últimos 6 años/ }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: /informe de vida laboral/ })).toHaveAttribute(
    'href',
    /sede\.seg-social\.gob\.es/,
  );
  await siguiente(page);
  await page.getByRole('button', { name: 'Revisar' }).click();

  const hoja = paro(page);
  await expect(hoja).toContainText(
    'Esta causa da derecho a paro si cumples el resto de requisitos',
  );
  await expect(hoja).toContainText('(art. 267.1.a.4.º LGSS)');
  await expect(hoja.locator('[data-paro-cuantia]')).toHaveText(
    /^Serían unos 1\.400\s€ al mes los primeros 6 meses y unos 1\.200\s€ después, en bruto\.$/,
  );
  await expect(hoja.locator('[data-paro-descuento]')).toContainText(/unos 97\s€ al mes/);
  // 720 days is the legal ceiling: no «al menos», no «puede ser más».
  await expect(hoja.locator('[data-paro-duracion]')).toHaveText(
    'Unos 720 días (24 meses), el máximo.',
  );
  await expect(hoja.locator('[data-paro-duracion-nota]')).toBeHidden();
  await expect(hoja).toContainText(
    'Estas cifras suponen jornada completa; con jornada parcial son menores.',
  );
  await expect(hoja).toContainText('15 días hábiles');
  await expect(hoja.locator('[data-paro-marca] use')).toHaveAttribute('href', '#marca-paro-si');
  await expect(hoja).not.toContainText(/exactamente/);
});

test('baja voluntaria: sin hojas del paro y «No da derecho a paro»', async ({ page }) => {
  await hastaVacaciones(page, 'Baja voluntaria (dimisión)', '2022-01-10', '2026-09-15');
  await expect(page.getByRole('heading', { name: '¿Qué pone tu finiquito?' })).toBeVisible();
  await page.getByRole('button', { name: 'Atrás' }).click();
  await expect(page.getByRole('heading', { name: 'Tus vacaciones y tu preaviso' })).toBeVisible();
  await siguiente(page);
  await page.getByRole('button', { name: 'Revisar' }).click();

  await expect(page.locator('#hoja-hijos')).toBeHidden();
  await expect(page.locator('#hoja-otros')).toBeHidden();
  const hoja = paro(page);
  await expect(hoja.locator('[data-paro-estado-texto]')).toHaveText('No da derecho a paro');
  await expect(hoja).toContainText('(art. 267.2.a LGSS)');
  await expect(hoja).toContainText('art. 267.1.a.5.º LGSS');
  await expect(hoja.locator('[data-paro-cuantia]')).toBeHidden();
  await expect(hoja.locator('[data-paro-marca] use')).toHaveAttribute(
    'href',
    '#marca-sin-indemnizacion',
  );
});

test('tres contratos más alargan la duración frente a este solo', async ({ page }) => {
  await hastaVacaciones(page, 'Despido objetivo', '2025-06-01', '2026-08-31');
  await page.getByLabel('Ninguno').check();
  await siguiente(page);
  await siguiente(page);
  await page.getByRole('button', { name: 'Revisar' }).click();
  await expect(paro(page).locator('[data-paro-duracion]')).toContainText('Al menos unos');
  const solo = await diasDeParo(page);
  expect(solo).toBe(120);

  await page
    .getByRole('navigation', { name: 'Secciones' })
    .getByRole('link', { name: /Vacaciones/ })
    .click();
  await siguiente(page);
  await siguiente(page);
  await page.getByLabel('Sí, añadir fechas').check();
  const filas = [
    ['2022-01-01', '2022-06-30'],
    ['2023-01-01', '2023-12-31'],
    ['2099-01-01', '2099-01-02'],
    ['2024-01-01', '2024-12-31'],
  ];
  for (const [i, [alta, baja]] of filas.entries()) {
    if (i > 0) await page.getByRole('button', { name: 'Añadir otro' }).click();
    const fila = page.getByRole('group', { name: `Otro trabajo ${i + 1}` });
    await fila.getByLabel('Alta').fill(alta ?? '');
    await fila.getByLabel('Baja').fill(baja ?? '');
  }
  await page
    .getByRole('group', { name: '¿Has cobrado paro después de alguno?' })
    .getByLabel('No', { exact: true })
    .check();
  await siguiente(page);
  // The row ending after this contract gets its error next to it, and only it.
  const tercera = page.getByRole('group', { name: 'Otro trabajo 3' });
  await expect(tercera.getByLabel('Baja')).toHaveAttribute('aria-invalid', 'true');
  await expect(tercera).toContainText('posterior a la del contrato que estás revisando');
  await expect(page.locator('.otro .errata:visible')).toHaveCount(1);
  await page.getByRole('button', { name: 'Quitar el otro trabajo 3' }).click();
  await expect(page.getByRole('group', { name: /^Otro trabajo \d$/ })).toHaveCount(3);
  await expect(page.getByRole('group', { name: 'Otro trabajo 3' }).getByLabel('Alta')).toHaveValue(
    '2024-01-01',
  );
  await siguiente(page);
  await page.getByRole('button', { name: 'Revisar' }).click();

  await expect(paro(page).locator('[data-paro-duracion]')).toHaveText(
    /^Unos \d+ días \(\d+ meses\), con las fechas que has puesto\.$/,
  );
  // 457 + 181 + 365 + 366 = 1.369 días cotizados: 420 días de paro.
  expect(await diasDeParo(page)).toBe(420);
  expect(await diasDeParo(page)).toBeGreaterThan(solo);
});

test('las hojas del paro caben en 360×640', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await hastaVacaciones(page, 'Despido improcedente', '2020-03-01', '2026-09-15');
  await page.getByLabel('Prefiero no decirlo').check();
  await cabe(page);
  await siguiente(page);
  await cabe(page);
  // With «Sí» and one row, the paro question and its three options answer above the thumb
  // bar; the rows come after it and scroll inside their own list.
  await page.getByLabel('Sí, añadir fechas').check();
  await expect(page.getByRole('group', { name: 'Otro trabajo 1' })).toBeAttached();
  const pregunta = page.getByRole('group', { name: '¿Has cobrado paro después de alguno?' });
  await expect(pregunta).toBeInViewport();
  const barra = await page.locator('.acciones').boundingBox();
  for (const opcion of ['Sí', 'No', 'No lo sé']) {
    const caja = await pregunta.getByLabel(opcion, { exact: true }).locator('..').boundingBox();
    expect(barra && caja && caja.y >= 0 && caja.y + caja.height <= barra.y, opcion).toBe(true);
  }
  await expect(page.getByRole('button', { name: 'Siguiente' })).toBeInViewport();
  await expect(page.locator('.otros__lista')).toHaveCSS('overflow-y', 'auto');
});

test('al quitar una fila, su error se queda con la fila que lo tiene', async ({ page }) => {
  await hastaVacaciones(page, 'Despido objetivo', '2025-06-01', '2026-08-31');
  await page.getByLabel('Ninguno').check();
  await siguiente(page);
  await page.getByLabel('Sí, añadir fechas').check();
  await page
    .getByRole('group', { name: '¿Has cobrado paro después de alguno?' })
    .getByLabel('No', { exact: true })
    .check();
  await page.getByLabel('Fecha de alta del trabajo 1').fill('2023-01-01');
  await page.getByLabel('Fecha de baja del trabajo 1').fill('2023-12-31');
  await page.getByRole('button', { name: 'Añadir otro' }).click();
  await expect(page.getByLabel('Fecha de alta del trabajo 2')).toBeFocused();
  await page.getByLabel('Fecha de alta del trabajo 2').fill('2024-01-01');
  await page.getByLabel('Fecha de baja del trabajo 2').fill('2027-12-31');
  await siguiente(page);
  await expect(page.getByLabel('Fecha de baja del trabajo 2')).toHaveAttribute(
    'aria-invalid',
    'true',
  );

  await page.getByRole('button', { name: 'Quitar el otro trabajo 1' }).click();
  const unica = page.getByRole('group', { name: 'Otro trabajo 1' });
  const baja = page.getByLabel('Fecha de baja del trabajo 1');
  await expect(baja).toHaveValue('2027-12-31');
  await expect(baja).toHaveAttribute('aria-invalid', 'true');
  await expect(baja).toHaveAttribute('name', 'otrosContratos.0.fechaBaja');
  await expect(unica.locator('.errata:visible')).toHaveAttribute(
    'data-error-de',
    'otrosContratos.0.fechaBaja',
  );
  await expect(unica).toContainText('posterior a la del contrato que estás revisando');

  await baja.fill('2024-12-31');
  await siguiente(page);
  await expect(page.getByRole('heading', { name: '¿Qué pone tu finiquito?' })).toBeVisible();
});
