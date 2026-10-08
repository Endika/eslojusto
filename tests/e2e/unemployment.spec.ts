import { test, expect, type Page } from '@playwright/test';

const next = (page: Page) => page.getByRole('button', { name: 'Siguiente' }).click();

// From the cause to the sheet after holidays and notice, with prorated extra pay and no days taken.
async function toHolidays(page: Page, cause: string, startDate: string, endDate: string) {
  await page.goto('finiquito/');
  await page.getByLabel(cause).check();
  await next(page);
  await page.getByLabel('Fecha de alta', { exact: true }).fill(startDate);
  await page.getByLabel('Fecha de baja', { exact: true }).fill(endDate);
  await next(page);
  const dismissal = /despido/i.test(cause);
  // A dismissal asks for the situations that may make it null, and for an ERTE.
  if (dismissal) await next(page);
  await page
    .getByRole('group', { name: '¿Tus pagas extra van prorrateadas en la nómina?' })
    .getByLabel('Sí')
    .check();
  await next(page);
  await page.getByLabel('Salario bruto mensual').fill('2.000,00');
  await next(page);
  if (dismissal) await next(page);
  await page.getByLabel('Disfrutados este año').fill('0');
  await next(page);
  // An unfair or disciplinary dismissal has no notice sheet.
  if (!/improcedente|disciplinario/i.test(cause)) await next(page);
}

const benefit = (page: Page) => page.getByRole('region', { name: 'Tu paro (estimación)' });

async function benefitDays(page: Page): Promise<number> {
  const text = (await benefit(page).locator('[data-benefit-duration]').textContent()) ?? '';
  const m = /unos (\d+) días/i.exec(text);
  return m ? Number(m[1]) : 0;
}

async function fitsAboveBar(page: Page) {
  await expect(page.getByRole('button', { name: /^(Siguiente|Revisar)$/ })).toBeInViewport();
  const { bottom, bar } = await page.evaluate(() => {
    const sheet = [...document.querySelectorAll<HTMLElement>('.sheet[data-sheet]')].find(
      (h) => !h.hidden,
    );
    const controls = [...(sheet?.querySelectorAll<HTMLElement>('input, .option, .chip') ?? [])];
    const visible = controls.filter((c) => c.offsetParent !== null);
    return {
      bottom: Math.max(...visible.map((c) => c.getBoundingClientRect().bottom)),
      bar: document.querySelector('.actions')?.getBoundingClientRect().top ?? 0,
    };
  });
  expect(bottom).toBeLessThanOrEqual(bar);
}

test('objective dismissal with one dependent child: the estimate carries figures', async ({
  page,
}) => {
  await toHolidays(page, 'Despido objetivo', '2020-03-01', '2026-09-15');
  await expect(
    page.getByRole('heading', { name: /hijos o hijas tienes a tu cargo/ }),
  ).toBeVisible();
  await next(page);
  await expect(
    page.getByText('Elige una opción; «Prefiero no decirlo» también vale'),
  ).toBeVisible();
  await page.getByLabel('1', { exact: true }).check();
  await next(page);
  await expect(
    page.getByRole('heading', { name: /otros sitios en los últimos 6 años/ }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: /informe de vida laboral/ })).toHaveAttribute(
    'href',
    /sede\.seg-social\.gob\.es/,
  );
  await next(page);
  await next(page);
  await page.getByRole('button', { name: 'Revisar' }).click();

  const sheet = benefit(page);
  await expect(sheet).toContainText(
    'Esta causa da derecho a paro si cumples el resto de requisitos',
  );
  await expect(sheet).toContainText('(art. 267.1.a.4.º LGSS)');
  await expect(sheet.locator('[data-benefit-amount]')).toHaveText(
    /^Serían unos 1\.400\s€ al mes los primeros 6 meses y unos 1\.200\s€ después, en bruto\.$/,
  );
  await expect(sheet.locator('[data-benefit-deduction]')).toContainText(/unos 97\s€ al mes/);
  // 720 days is the legal ceiling: no «al menos», no «puede ser más».
  await expect(sheet.locator('[data-benefit-duration]')).toHaveText(
    'Unos 720 días (24 meses), el máximo.',
  );
  await expect(sheet.locator('[data-benefit-duration-note]')).toBeHidden();
  await expect(sheet).toContainText(
    'Estas cifras suponen jornada completa; con jornada parcial son menores.',
  );
  await expect(sheet).toContainText('15 días hábiles');
  await expect(sheet.locator('[data-benefit-mark] use')).toHaveAttribute(
    'href',
    '#mark-benefit-yes',
  );
  await expect(sheet).not.toContainText(/exactamente/);
});

test('resignation: no benefit sheets and «No da derecho a paro»', async ({ page }) => {
  await toHolidays(page, 'Baja voluntaria (dimisión)', '2022-01-10', '2026-09-15');
  await expect(
    page.getByRole('heading', { name: '¿Te han pagado ya el finiquito?' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Atrás' }).click();
  await expect(page.getByRole('heading', { name: 'Tu preaviso' })).toBeVisible();
  await next(page);
  await next(page);
  await expect(page.getByRole('heading', { name: '¿Qué pone tu finiquito?' })).toBeVisible();
  await page.getByRole('button', { name: 'Revisar' }).click();

  await expect(page.locator('#sheet-hijos')).toBeHidden();
  await expect(page.locator('#sheet-otros')).toBeHidden();
  const sheet = benefit(page);
  await expect(sheet.locator('[data-benefit-status-text]')).toHaveText('No da derecho a paro');
  await expect(sheet).toContainText('(art. 267.2.a LGSS)');
  await expect(sheet).toContainText('art. 267.1.a.5.º LGSS');
  await expect(sheet.locator('[data-benefit-amount]')).toBeHidden();
  await expect(sheet.locator('[data-benefit-mark] use')).toHaveAttribute(
    'href',
    '#mark-no-severance',
  );
});

test('three more contracts lengthen the duration against this one alone', async ({ page }) => {
  await toHolidays(page, 'Despido objetivo', '2025-06-01', '2026-08-31');
  await page.getByLabel('Ninguno').check();
  await next(page);
  await next(page);
  await next(page);
  await page.getByRole('button', { name: 'Revisar' }).click();
  await expect(benefit(page).locator('[data-benefit-duration]')).toContainText('Al menos unos');
  const alone = await benefitDays(page);
  expect(alone).toBe(120);

  await page
    .getByRole('navigation', { name: 'Secciones' })
    .getByRole('link', { name: /Vacaciones/ })
    .click();
  await next(page);
  await next(page);
  await next(page);
  await page.getByLabel('Sí, añadir fechas').check();
  const rows = [
    ['2022-01-01', '2022-06-30'],
    ['2023-01-01', '2023-12-31'],
    ['2099-01-01', '2099-01-02'],
    ['2024-01-01', '2024-12-31'],
  ];
  for (const [i, [startDate, endDate]] of rows.entries()) {
    if (i > 0) await page.getByRole('button', { name: 'Añadir otro' }).click();
    const row = page.getByRole('group', { name: `Otro trabajo ${i + 1}` });
    await row.getByLabel('Alta').fill(startDate ?? '');
    await row.getByLabel('Baja').fill(endDate ?? '');
  }
  await page
    .getByRole('group', { name: '¿Has cobrado paro después de alguno?' })
    .getByLabel('No', { exact: true })
    .check();
  await next(page);
  // The row ending after this contract gets its error next to it, and only it.
  const third = page.getByRole('group', { name: 'Otro trabajo 3' });
  await expect(third.getByLabel('Baja')).toHaveAttribute('aria-invalid', 'true');
  await expect(third).toContainText('posterior a la del contrato que estás revisando');
  await expect(page.locator('.other-contract .errata:visible')).toHaveCount(1);
  await page.getByRole('button', { name: 'Quitar el otro trabajo 3' }).click();
  await expect(page.getByRole('group', { name: /^Otro trabajo \d$/ })).toHaveCount(3);
  await expect(page.getByRole('group', { name: 'Otro trabajo 3' }).getByLabel('Alta')).toHaveValue(
    '2024-01-01',
  );
  await next(page);
  await next(page);
  await page.getByRole('button', { name: 'Revisar' }).click();

  await expect(benefit(page).locator('[data-benefit-duration]')).toHaveText(
    /^Unos \d+ días \(\d+ meses\), con las fechas que has puesto\.$/,
  );
  // 457 + 181 + 365 + 366 = 1,369 contributed days: 420 days of benefit.
  expect(await benefitDays(page)).toBe(420);
  expect(await benefitDays(page)).toBeGreaterThan(alone);
});

test('the benefit sheets fit in 360×640', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await toHolidays(page, 'Despido improcedente', '2020-03-01', '2026-09-15');
  await page.getByLabel('Prefiero no decirlo').check();
  await fitsAboveBar(page);
  await next(page);
  await fitsAboveBar(page);
  // With «Sí» and one row, the benefit question and its three options answer above the thumb
  // bar; the rows come after it and scroll inside their own list.
  await page.getByLabel('Sí, añadir fechas').check();
  await expect(page.getByRole('group', { name: 'Otro trabajo 1' })).toBeAttached();
  const question = page.getByRole('group', { name: '¿Has cobrado paro después de alguno?' });
  await expect(question).toBeInViewport();
  const bar = await page.locator('.actions').boundingBox();
  for (const option of ['Sí', 'No', 'No lo sé']) {
    const box = await question.getByLabel(option, { exact: true }).locator('..').boundingBox();
    expect(bar && box && box.y >= 0 && box.y + box.height <= bar.y, option).toBe(true);
  }
  await expect(page.getByRole('button', { name: 'Siguiente' })).toBeInViewport();
  await expect(page.locator('.other-contracts__list')).toHaveCSS('overflow-y', 'auto');
});

test('removing a row, its error stays with the row that has it', async ({ page }) => {
  await toHolidays(page, 'Despido objetivo', '2025-06-01', '2026-08-31');
  await page.getByLabel('Ninguno').check();
  await next(page);
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
  await next(page);
  await expect(page.getByLabel('Fecha de baja del trabajo 2')).toHaveAttribute(
    'aria-invalid',
    'true',
  );

  await page.getByRole('button', { name: 'Quitar el otro trabajo 1' }).click();
  const single = page.getByRole('group', { name: 'Otro trabajo 1' });
  const endDate = page.getByLabel('Fecha de baja del trabajo 1');
  await expect(endDate).toHaveValue('2027-12-31');
  await expect(endDate).toHaveAttribute('aria-invalid', 'true');
  await expect(endDate).toHaveAttribute('name', 'otherContracts.0.endDate');
  await expect(single.locator('.errata:visible')).toHaveAttribute(
    'data-error-for',
    'otherContracts.0.endDate',
  );
  await expect(single).toContainText('posterior a la del contrato que estás revisando');

  await endDate.fill('2024-12-31');
  await next(page);
  await expect(
    page.getByRole('heading', { name: '¿Te han pagado ya el finiquito?' }),
  ).toBeVisible();
});
