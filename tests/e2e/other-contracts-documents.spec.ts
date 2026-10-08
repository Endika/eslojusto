import { expect, test, type Page } from '@playwright/test';
import { syntheticPhoto } from '../support/synthetic-photo';

// Runs only against a TEST_DOCUMENTS=1 build: the read below comes from a fake extract function.
// The work history is synthetic.

const EXTRACT = 'https://extract.api.eslojusto.test/';
const from = (value: string | number) => ({ value, confidence: 'high', source: 'work_history' });
const job = (startDate: string, endDate: string) => ({
  values: { startDate, endDate },
  confidence: 'high',
  source: 'work_history',
});
const READ = {
  code: 'ok',
  extraction: {
    pages: [
      {
        page: 1,
        kind: 'work_history',
        document: 1,
        readability: { value: 'ok', confidence: 'high' },
        confidence: 'high',
      },
    ],
    documents: [{ kind: 'work_history', pages: [1] }],
    fields: {
      cause: { ...from('unfair_dismissal'), source: 'dismissal_letter' },
      startDate: from('2010-03-01'),
      endDate: from('2026-09-15'),
      monthlySalary: { ...from(2142.86), source: 'payslip' },
    },
    lists: { contracts: [job('2021-01-10', '2021-06-30'), job('2022-02-01', '2022-12-31')] },
    conflicts: [],
  },
  failedChecks: [],
  allowance: 'v1.quota.e2e',
};

// Reads the work history and walks to «Otros trabajos», where its two jobs wear their marks.
async function readToOtherJobs(page: Page) {
  await page.route('https://challenges.cloudflare.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.turnstile = { render(el, o) { setTimeout(() => o.callback(o.action + '-token')); return 'w'; }, remove() {} };`,
    }),
  );
  await page.route(EXTRACT, (route) => route.fulfill({ json: READ }));
  await page.goto('finiquito/');
  await page.getByRole('button', { name: /Sube tus documentos/ }).click();
  await page
    .getByLabel('Elegir fotos o PDF')
    .setInputFiles({ name: 'vida-laboral.png', mimeType: 'image/png', buffer: syntheticPhoto() });
  await page.getByLabel(/Doy mi consentimiento explícito/).check();
  await page.getByRole('button', { name: 'Leer los documentos' }).click();
  await page.getByRole('button', { name: 'Revisar los datos' }).click();
  const next = () => page.getByRole('button', { name: 'Siguiente' }).click();
  await next();
  await next();
  await next();
  await page
    .getByRole('group', { name: '¿Tus pagas extra van prorrateadas en la nómina?' })
    .getByLabel('Sí')
    .check();
  await next();
  await next();
  await next();
  await page.getByLabel('Disfrutados este año').fill('0');
  await next();
  await page.getByLabel('Ninguno').check();
  await next();
  const marks = page.locator('[data-other-contract] .read-mark');
  await expect(marks).toHaveCount(2);
  return marks;
}

const row = (page: Page, i: number) => page.locator(`[data-other-contract="${i}"]`);

test('after «Añadir otro», editing a read job takes its mark away, and only its own', async ({
  page,
}) => {
  const marks = await readToOtherJobs(page);
  await page.getByRole('button', { name: 'Añadir otro' }).click();
  await expect(page.locator('[data-other-contract]')).toHaveCount(3);
  await page.getByLabel('Fecha de alta del trabajo 1').fill('2021-02-01');
  await expect(marks).toHaveCount(1);
  await expect(row(page, 0).locator('.read-mark')).toHaveCount(0);
  await expect(row(page, 1).locator('.read-mark')).toHaveCount(1);
});

test('after «Quitar», editing the read job that moved up takes its mark away', async ({ page }) => {
  const marks = await readToOtherJobs(page);
  await page.getByRole('button', { name: 'Quitar el otro trabajo 1' }).click();
  await expect(page.locator('[data-other-contract]')).toHaveCount(1);
  await expect(marks).toHaveCount(1);
  await page.getByLabel('Fecha de baja del trabajo 1').fill('2022-11-30');
  await expect(marks).toHaveCount(0);
});
