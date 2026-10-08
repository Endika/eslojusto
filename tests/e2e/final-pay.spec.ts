import { test, expect, type Page } from '@playwright/test';
import { nextSheet } from '../support/sheets';

const ORIGIN = `http://localhost:${process.env['E2E_PORT'] ?? 4321}`;

test('unfair dismissal with a short severance → below the minimum, with the difference', async ({
  page,
}) => {
  await page.goto('finiquito/');
  const next = () => nextSheet(page);
  await page.getByLabel('Despido improcedente').check();
  await next();
  await page.getByLabel('Fecha de alta', { exact: true }).fill('2010-03-01');
  await page.getByLabel('Fecha de baja', { exact: true }).fill('2026-09-15');
  await next();
  await expect(
    page.getByRole('heading', {
      name: '¿Se daba alguna situación que pueda hacer nulo el despido?',
    }),
  ).toBeVisible();
  await next();
  await page
    .getByRole('group', { name: '¿Tus pagas extra van prorrateadas en la nómina?' })
    .getByLabel('Sí')
    .check();
  await next();
  await expect(page.getByText('con la parte de pagas extra incluida')).toBeVisible();
  await page.getByLabel('Salario bruto mensual').fill('2142,86');
  await next();
  await expect(
    page.getByRole('heading', { name: '¿Estabas en un ERTE cuando te despidieron?' }),
  ).toBeVisible();
  await next();
  await page.getByLabel('Disfrutados este año').fill('0');
  await next();
  await page.getByLabel('Ninguno').check();
  await next();
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
  await nextSheet(page);
  await page.getByLabel('Fecha de alta', { exact: true }).fill('2026-05-01');
  await page.getByLabel('Fecha de baja', { exact: true }).fill('2026-04-01');
  await nextSheet(page);
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
  await nextSheet(page);
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
  await nextSheet(page);
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
  const next = () => nextSheet(page);
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
  await page.getByLabel('Disfrutados este año').fill('0');
  await next();
  await next();
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
  await expect(page.getByRole('heading', { name: 'Tus vacaciones' })).toBeVisible();
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
  const next = () => nextSheet(page);
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
  await expect(page.getByLabel('Disfrutados este año')).toBeDisabled();
  await fitsAboveBar(page);
  await next();
  await expect(page.getByRole('heading', { name: 'Tu preaviso' })).toBeVisible();
  await fitsAboveBar(page);
  await next();
  await page.getByLabel('Ninguno').check();
  await fitsAboveBar(page);
  await next();
  await fitsAboveBar(page);
  await next();
  await expect(
    page.getByRole('heading', { name: '¿Te han pagado ya el finiquito?' }),
  ).toBeVisible();
  await fitsAboveBar(page);
  await next();
  await fitsAboveBar(page);
  for (let i = 0; i < 10; i++) await page.getByRole('button', { name: 'Atrás' }).click();
  await expect(page.getByLabel('Eventual')).toBeChecked();
});

test('whoever is paid exactly the legal minimum sees «Coincide» on every item', async ({
  page,
}) => {
  await page.goto('finiquito/');
  const next = () => nextSheet(page);
  await page.getByLabel('Despido objetivo').check();
  await next();
  await page.getByLabel('Fecha de alta', { exact: true }).fill('2018-05-03');
  await page.getByLabel('Fecha de baja', { exact: true }).fill('2026-07-20');
  await next();
  await next();
  await page
    .getByRole('group', { name: '¿Tus pagas extra van prorrateadas en la nómina?' })
    .getByLabel('No')
    .check();
  await next();
  await page.getByLabel('Salario bruto mensual').fill('1.500,00');
  await next();
  await next();
  await page.getByLabel('Importe de cada paga').fill('1.500,00');
  await next();
  await page.getByLabel('Disfrutados este año').fill('7');
  await next();
  await page.getByLabel('Días de preaviso que te dio la empresa').fill('5');
  await next();
  await page.getByLabel('Prefiero no decirlo').check();
  await next();
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
  await next();
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
  const next = () => nextSheet(page);
  await page.getByLabel('Despido improcedente').check();
  await next();
  await page.getByLabel('Fecha de alta', { exact: true }).fill('2018-05-03');
  await page.getByLabel('Fecha de baja', { exact: true }).fill('2026-07-20');
  await next();
  await next();
  await page
    .getByRole('group', { name: '¿Tus pagas extra van prorrateadas en la nómina?' })
    .getByLabel('Sí')
    .check();
  await next();
  // 1,500 € base plus two 1,500 € payments spread over twelve payslips: 1,750 € a month.
  await page.getByLabel('Salario bruto mensual').fill('1.750,00');
  await next();
  await next();
  await page.getByLabel('Disfrutados este año').fill('0');
  await next();
  await page.getByLabel('Ninguno').check();
  await next();
  await next();
  await next();
  await page.getByRole('button', { name: 'Revisar' }).click();
  // The CGPJ guide's own example: 21,000 € × 272.25 / 365.
  await expect(page.locator('[data-item="severance"] [data-range]')).toContainText('15.663,70');
});

test('holidays count in working days by default; the yearly figure follows the unit', async ({
  page,
}) => {
  await page.goto('finiquito/');
  const next = () => nextSheet(page);
  await page.getByLabel('Despido improcedente').check();
  await next();
  await page.getByLabel('Fecha de alta', { exact: true }).fill('2021-04-12');
  await page.getByLabel('Fecha de baja', { exact: true }).fill('2026-09-26');
  await next();
  await next();
  await page
    .getByRole('group', { name: '¿Tus pagas extra van prorrateadas en la nómina?' })
    .getByLabel('Sí')
    .check();
  await next();
  await page.getByLabel('Salario bruto mensual').fill('4.300,00');
  await next();
  await next();
  await expect(page.getByLabel('Días laborables', { exact: true })).toBeChecked();
  await expect(page.getByLabel('5 (de lunes a viernes)')).toBeChecked();
  await expect(page.getByLabel('Vacaciones al año')).toHaveValue('22');
  await expect(
    page.getByText(
      '22 laborables equivalen a los 30 naturales de la ley; 26 si trabajas de lunes a sábado.',
    ),
  ).toBeVisible();
  await page.getByLabel('6 (de lunes a sábado)').check();
  await expect(page.getByLabel('Vacaciones al año')).toHaveValue('26');
  await page.getByLabel('Días naturales', { exact: true }).check();
  await expect(page.getByLabel('Vacaciones al año')).toHaveValue('30');
  await expect(
    page.getByRole('group', { name: '¿Cuántos días a la semana trabajas?' }),
  ).toBeHidden();
  await expect(page.getByText('Este año. Una semana son 7.')).toBeVisible();
  await page.getByLabel('Días laborables', { exact: true }).check();
  await page.getByLabel('5 (de lunes a viernes)').check();
  await expect(page.getByLabel('Vacaciones al año')).toHaveValue('22');
  await page.getByLabel('Disfrutados este año').fill('20');
  await next();
  await page.getByLabel('Ninguno').check();
  await next();
  await next();
  await next();
  await page.getByLabel('Vacaciones no disfrutadas').fill('0');
  await page.getByRole('button', { name: 'Revisar' }).click();
  const card = page.locator('[data-item="holiday_pay"]');
  await expect(card).toContainText(
    'Hemos contado 20 días laborables (5 por semana) disfrutados de 22 al año.',
  );
  await expect(card).not.toContainText('Por debajo del mínimo legal');
});

test('a collective dismissal during a reduced ERTE: the salary from before, «o más» and the interest', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto('finiquito/');
  const next = () => nextSheet(page);
  await page.getByLabel('Despido colectivo (ERE)').check();
  await expect(page.getByText('Por un ERE de tu empresa.')).toBeVisible();
  await fitsAboveBar(page);
  await next();
  await page.getByLabel('Fecha de alta', { exact: true }).fill('2020-01-01');
  await page.getByLabel('Fecha de baja', { exact: true }).fill('2026-08-31');
  await next();
  await expect(
    page
      .getByRole('group', { name: '¿Se daba alguna situación que pueda hacer nulo el despido?' })
      .getByLabel('No', { exact: true }),
  ).toBeChecked();
  await fitsAboveBar(page);
  await next();
  await page
    .getByRole('group', { name: '¿Tus pagas extra van prorrateadas en la nómina?' })
    .getByLabel('Sí')
    .check();
  await next();
  await page.getByLabel('Salario bruto mensual').fill('1.000');
  await next();
  await expect(page.getByLabel('Salario de antes del ERTE')).toBeHidden();
  await page.getByLabel('Sí, con jornada reducida').check();
  await page.getByLabel('Salario de antes del ERTE').fill('2.000');
  await fitsAboveBar(page);
  await next();
  await page.getByLabel('Disfrutados este año').fill('0');
  await next();
  await expect(page.getByLabel('Días de preaviso que te dio la empresa')).toBeVisible();
  await next();
  await page.getByLabel('Ninguno').check();
  await next();
  await next();
  await page
    .getByRole('group', { name: '¿Te han pagado ya el finiquito?' })
    .getByLabel('No', { exact: true })
    .check();
  await fitsAboveBar(page);
  await next();
  await page.getByRole('button', { name: 'Revisar' }).click();

  const severance = page.getByRole('region', { name: 'Indemnización' });
  await expect(severance).toContainText('O más, según el acuerdo del ERE');
  await severance.getByText('Cómo se calcula').click();
  await expect(severance).toContainText('(STS 678/2018, de 27 de junio): 2.000,00');
  await expect(severance).toContainText('Estatuto de los Trabajadores, art. 51');
  await expect(page.getByRole('region', { name: 'Preaviso no dado por la empresa' })).toBeVisible();
  const interest = page.getByRole('region', { name: 'Si aún no te han pagado' });
  await expect(interest).toContainText('interés por el retraso del 10 % al año (art. 29.3 ET)');
  await expect(interest).toContainText(/te quedan \d+ días para reclamarlo/);
  await expect(interest).toContainText('20 días hábiles para impugnar un despido');
  await expect(page.getByRole('region', { name: 'Este despido podría ser nulo' })).toHaveCount(0);
});

test('«No lo sé» as the cause: no severance, and the null warning for what was ticked', async ({
  page,
}) => {
  await page.goto('finiquito/');
  const next = () => nextSheet(page);
  await page.getByRole('radio', { name: 'No lo sé' }).check();
  await expect(page.getByText('Está en la carta y en el certificado de empresa.')).toBeVisible();
  await next();
  await page.getByLabel('Fecha de alta', { exact: true }).fill('2020-01-01');
  await page.getByLabel('Fecha de baja', { exact: true }).fill('2026-09-15');
  await next();
  await expect(page.getByText('no se envía a ningún sitio')).toBeVisible();
  await page.getByLabel('Sí, marcar cuáles').check();
  await page.getByLabel('Estabas embarazada').check();
  await page.getByLabel('Estabas de baja médica').check();
  await next();
  await page
    .getByRole('group', { name: '¿Tus pagas extra van prorrateadas en la nómina?' })
    .getByLabel('Sí')
    .check();
  await next();
  await page.getByLabel('Salario bruto mensual').fill('1.500');
  await next();
  // No ERTE nor notice without a cause: straight to the holidays.
  await expect(page.getByRole('heading', { name: 'Tus vacaciones' })).toBeVisible();
  await page.getByLabel('Disfrutados este año').fill('0');
  await next();
  await page.getByLabel('Ninguno').check();
  await next();
  await next();
  await next();
  await page.getByRole('button', { name: 'Revisar' }).click();

  await expect(page.getByRole('region', { name: 'Indemnización' })).toContainText(
    'Sin la causa no se calcula la indemnización',
  );
  await expect(page.getByRole('region', { name: 'Sin la causa' })).toContainText(
    'causa de la situación legal de desempleo',
  );
  const warning = page.getByRole('region', { name: 'Este despido podría ser nulo' });
  await expect(warning).toContainText('podría ser nulo (art. 55.5 ET)');
  await expect(warning).toContainText('Ley 15/2022');
  await expect(warning).toContainText('20 días hábiles');
  await expect(warning).toContainText('abogado laboralista o a un sindicato');
  await expect(warning).not.toContainText(/\bes nulo\b/);
  await expect(page.getByRole('region', { name: 'Tu paro (estimación)' })).toContainText(
    'Depende de la causa',
  );
});

test('an ERTE not known gives a warning only', async ({ page }) => {
  await page.goto('finiquito/');
  const next = () => nextSheet(page);
  await page.getByLabel('Despido improcedente').check();
  await next();
  await page.getByLabel('Fecha de alta', { exact: true }).fill('2020-01-01');
  await page.getByLabel('Fecha de baja', { exact: true }).fill('2026-09-15');
  await next();
  await next();
  await page
    .getByRole('group', { name: '¿Tus pagas extra van prorrateadas en la nómina?' })
    .getByLabel('Sí')
    .check();
  await next();
  await page.getByLabel('Salario bruto mensual').fill('1.500');
  await next();
  await page.locator('#erte-unknown').check();
  await expect(page.getByLabel('Salario de antes del ERTE')).toBeHidden();
  await next();
  await page.getByLabel('Disfrutados este año').fill('0');
  await next();
  await page.getByLabel('Ninguno').check();
  await next();
  await next();
  await next();
  await page.getByRole('button', { name: 'Revisar' }).click();
  await expect(page.getByRole('region', { name: 'Si estabas en un ERTE' })).toContainText(
    'STS 638/2022',
  );
  await expect(page.locator('[data-item="severance"] [data-range]')).toContainText('€');
});
