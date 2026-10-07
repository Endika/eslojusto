import { test, expect, type Page } from '@playwright/test';

const ORIGIN = `http://localhost:${process.env['E2E_PORT'] ?? 4321}`;

test('unfair dismissal with a short severance → below the minimum, with the difference', async ({
  page,
}) => {
  await page.goto('finiquito/');
  const next = () => page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByLabel('Despido improcedente').check();
  await next();
  await page.getByLabel('Fecha de alta', { exact: true }).fill('2010-03-01');
  await page.getByLabel('Fecha de baja', { exact: true }).fill('2026-09-15');
  await next();
  await page
    .getByRole('group', { name: '¿Tus pagas extra van prorrateadas en la nómina?' })
    .getByLabel('Sí')
    .check();
  await next();
  await expect(page.getByText('con la parte de pagas extra incluida')).toBeVisible();
  await page.getByLabel('Salario bruto mensual').fill('2142,86');
  await next();
  await page.getByLabel('Días naturales disfrutados').fill('0');
  await next();
  await page.getByLabel('Ninguno').check();
  await next();
  await next();
  await page.getByLabel('Indemnización').fill('40.000,00');
  await page.getByRole('button', { name: 'Revisar' }).click();
  const card = page.getByRole('region', { name: 'Indemnización' });
  await expect(card).toContainText('Por debajo del mínimo legal');
  await expect(page.getByRole('heading', { name: /Resultado/ })).toBeFocused();
});

test('a date error is announced next to its field', async ({ page }) => {
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

test('each sheet fits in 360×640 and a completed section can be reopened', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto('finiquito/');
  await page.getByLabel('Baja voluntaria (dimisión)').check();
  await expect(page.getByRole('button', { name: 'Siguiente' })).toBeInViewport();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByRole('link', { name: /Causa/ }).click();
  await expect(page.getByLabel('Baja voluntaria (dimisión)')).toBeChecked();
});

test('a pending section is not a link until it is reached', async ({ page }) => {
  await page.goto('finiquito/');
  const strip = page.getByRole('navigation', { name: 'Secciones' });
  await expect(page.locator('a:not([href])')).toHaveCount(0);
  await expect(strip.getByRole('link')).toHaveCount(1);
  await expect(strip.locator('[data-tab="dates"]')).toHaveAttribute('aria-disabled', 'true');
  await page.getByLabel('Baja voluntaria (dimisión)').check();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(strip.getByRole('link')).toHaveCount(2);
  await expect(strip.getByRole('link', { name: /Fechas/ })).toHaveAttribute('aria-current', 'step');
  await expect(page.locator('a:not([href])')).toHaveCount(0);
});

test('the theme follows the system and the button sets it', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('finiquito/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: /Tema|Modo claro/ }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('no horizontal scroll at 360 px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('finiquito/');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('the CSP blocks nothing: the theme and the fonts come from the site itself', async ({
  page,
}) => {
  const blocked: string[] = [];
  page.on('console', (m) => {
    if (/Content Security Policy/i.test(m.text())) blocked.push(m.text());
  });
  const external: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith(`${ORIGIN}/`)) external.push(r.url());
  });
  await page.goto('finiquito/');
  await page.evaluate(() => document.fonts.ready);
  expect(blocked).toEqual([]);
  expect(external).toEqual([]);
});

test('a figure with a decimal comma and thousands dots reads in Spanish format', async ({
  page,
}) => {
  await page.goto('finiquito/');
  const next = () => page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByLabel('Baja voluntaria (dimisión)').check();
  await next();
  await page.getByLabel('Fecha de alta', { exact: true }).fill('2025-01-01');
  await page.getByLabel('Fecha de baja', { exact: true }).fill('2026-09-15');
  await next();
  await page
    .getByRole('group', { name: '¿Tus pagas extra van prorrateadas en la nómina?' })
    .getByLabel('Sí')
    .check();
  await next();
  await page.getByLabel('Salario bruto mensual').fill('1.850,00');
  await next();
  await page.getByLabel('Días naturales disfrutados').fill('0');
  await next();
  await page.getByLabel('Descuento por no preavisar').fill('1,234.56');
  await page.getByRole('button', { name: 'Revisar' }).click();
  await expect(page.getByLabel('Descuento por no preavisar')).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await page.getByLabel('Descuento por no preavisar').fill('');
  await page.getByLabel('Salario del mes de la baja').fill('1.234,56');
  await page.getByRole('button', { name: 'Revisar' }).click();
  const salary = page.getByRole('region', { name: 'Salario del mes de la baja' });
  await expect(salary.locator('[data-employer]')).toHaveText(/^1\.234,56\s€$/);
  // 1.850,00 € a month × 15 days of September = 925,00 €: the salary was read as 1850, not 1,85.
  await expect(salary.locator('[data-range]')).toHaveText(/^925,00\s€$/);
  const severance = page.getByRole('region', { name: 'Indemnización' });
  await expect(severance).toContainText('No te corresponde indemnización por ley en este caso');
  await expect(severance).not.toContainText('Coincide con el mínimo legal');
  await expect(severance).not.toContainText('No has metido la cifra');
});

test('without prorating, extra pay gets its own sheet and fits in 360×640', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto('finiquito/');
  const next = page.getByRole('button', { name: 'Siguiente' });
  await page.getByLabel('Despido objetivo').check();
  await next.click();
  await page.getByLabel('Fecha de alta', { exact: true }).fill('2020-03-01');
  await page.getByLabel('Fecha de baja', { exact: true }).fill('2026-09-15');
  await next.click();
  await page
    .getByRole('group', { name: '¿Tus pagas extra van prorrateadas en la nómina?' })
    .getByLabel('No')
    .check();
  await next.click();
  await expect(page.getByText('Tu bruto mensual sin las pagas extra')).toBeVisible();
  await page.getByLabel('Salario bruto mensual').fill('1850');
  await expect(page.getByLabel('Importe de cada paga')).toBeHidden();
  await next.click();
  await expect(page.getByRole('heading', { name: '¿Cómo son tus pagas extra?' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Salario/ })).toHaveAttribute('aria-current', 'step');
  await next.click();
  await expect(page.getByText('Falta el importe', { exact: true })).toBeVisible();
  await page.getByLabel('Importe de cada paga').fill('1.850,00');
  await page.getByLabel('Semestral').check();
  const last = await page
    .getByRole('group', { name: '¿Cuándo se generan?' })
    .getByLabel('No lo sé')
    .boundingBox();
  const bar = await next.boundingBox();
  expect(last && bar && last.y + last.height <= bar.y).toBe(true);
  await expect(next).toBeInViewport();
  await next.click();
  await expect(page.getByRole('heading', { name: 'Tus vacaciones y tu preaviso' })).toBeVisible();
  await page.getByRole('button', { name: 'Atrás' }).click();
  await expect(page.getByLabel('Importe de cada paga')).toHaveValue('1.850,00');
});

async function fitsAboveBar(page: Page) {
  const action = page.getByRole('button', { name: /^(Siguiente|Revisar)$/ });
  await expect(action).toBeInViewport();
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

test('fixed-term end: every sheet fits in 360×640, the conditional ones too', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto('finiquito/');
  const next = () => page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByLabel('Fin de contrato temporal').check();
  await fitsAboveBar(page);
  await next();
  await expect(
    page.getByRole('heading', { name: '¿Qué tipo de contrato temporal tenías?' }),
  ).toBeVisible();
  await page.getByLabel('Eventual').check();
  await fitsAboveBar(page);
  await next();
  await page.getByLabel('Fecha de alta', { exact: true }).fill('2020-03-01');
  await page.getByLabel('Fecha de baja', { exact: true }).fill('2026-09-15');
  await fitsAboveBar(page);
  await next();
  await expect(
    page.getByRole('heading', { name: '¿Tus pagas extra van prorrateadas en la nómina?' }),
  ).toBeVisible();
  await page
    .getByRole('group', { name: '¿Tus pagas extra van prorrateadas en la nómina?' })
    .getByLabel('No')
    .check();
  await fitsAboveBar(page);
  await next();
  await page.getByLabel('Salario bruto mensual').fill('1850');
  await fitsAboveBar(page);
  await next();
  await page.getByLabel('Importe de cada paga').fill('1850');
  await fitsAboveBar(page);
  await next();
  await page.getByRole('checkbox', { name: 'No lo sé' }).check();
  await expect(page.getByLabel('Días naturales disfrutados')).toBeDisabled();
  await fitsAboveBar(page);
  await next();
  await page.getByLabel('Ninguno').check();
  await fitsAboveBar(page);
  await next();
  await fitsAboveBar(page);
  await next();
  await fitsAboveBar(page);
  for (let i = 0; i < 8; i++) await page.getByRole('button', { name: 'Atrás' }).click();
  await expect(page.getByLabel('Eventual')).toBeChecked();
});

test('whoever is paid exactly the legal minimum sees «Coincide» on every item', async ({
  page,
}) => {
  await page.goto('finiquito/');
  const next = () => page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByLabel('Despido objetivo').check();
  await next();
  await page.getByLabel('Fecha de alta', { exact: true }).fill('2018-05-03');
  await page.getByLabel('Fecha de baja', { exact: true }).fill('2026-07-20');
  await next();
  await page
    .getByRole('group', { name: '¿Tus pagas extra van prorrateadas en la nómina?' })
    .getByLabel('No')
    .check();
  await next();
  await page.getByLabel('Salario bruto mensual').fill('1.500,00');
  await next();
  await page.getByLabel('Importe de cada paga').fill('1.500,00');
  await next();
  await page.getByLabel('Días naturales disfrutados').fill('7');
  await page.getByLabel('Días de preaviso que te dio la empresa').fill('5');
  await next();
  await page.getByLabel('Prefiero no decirlo').check();
  await next();
  await next();
  await page.getByRole('button', { name: 'Revisar' }).click();

  // The first review, with no employer figures, gives each legal minimum.
  const items = page.locator('[data-item]');
  await expect(items.first()).toBeVisible();
  const minimums = new Map<string, string>();
  for (const sheet of await items.all()) {
    const id = (await sheet.getAttribute('data-item')) ?? '';
    const min = (await sheet.locator('[data-range] bdi').first().textContent()) ?? '';
    minimums.set(id, min.replace(/\s€$/, ''));
  }
  expect([...minimums.keys()]).toEqual([
    'pending_salary',
    'holiday_pay',
    'extra_pay',
    'severance',
    'employer_notice',
  ]);

  await page.getByRole('link', { name: /Tu finiquito/ }).click();
  for (const [id, min] of minimums) await page.locator(`#figure_${id}`).fill(min);
  await page.getByRole('button', { name: 'Revisar' }).click();
  for (const id of minimums.keys())
    await expect(page.locator(`[data-item="${id}"] [data-status-text]`)).toHaveText(
      'Coincide con el mínimo legal',
    );
});

test('with prorated extra pay, the salary carries the share and the severance comes out whole', async ({
  page,
}) => {
  await page.goto('finiquito/');
  const next = () => page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByLabel('Despido improcedente').check();
  await next();
  await page.getByLabel('Fecha de alta', { exact: true }).fill('2018-05-03');
  await page.getByLabel('Fecha de baja', { exact: true }).fill('2026-07-20');
  await next();
  await page
    .getByRole('group', { name: '¿Tus pagas extra van prorrateadas en la nómina?' })
    .getByLabel('Sí')
    .check();
  await next();
  // 1,500 € base plus two 1,500 € payments spread over twelve payslips: 1,750 € a month.
  await page.getByLabel('Salario bruto mensual').fill('1.750,00');
  await next();
  await page.getByLabel('Días naturales disfrutados').fill('0');
  await next();
  await page.getByLabel('Ninguno').check();
  await next();
  await next();
  await page.getByRole('button', { name: 'Revisar' }).click();
  // The CGPJ guide's own example: 21,000 € × 272.25 / 365.
  await expect(page.locator('[data-item="severance"] [data-range]')).toContainText('15.663,70');
});
