import { expect, test, type Page } from '@playwright/test';
import { nextSheet } from '../support/sheets';
import { syntheticPhoto } from '../support/synthetic-photo';
import { expectShownAndFocused } from '../support/reads';

// Runs only against a TEST_DOCUMENTS=1 build: each read comes from a fake extract function, in
// order. Two reads in a row, through «Subir más documentos»: the second adds to what the first
// filled, and never quietly replaces it. The documents and figures are synthetic.

const EXTRACT = 'https://extract.api.eslojusto.test/';
// Every case reads the indices and norms as loaded on this day.
const TODAY = new Date('2026-10-08T12:00:00');
const PHOTO = syntheticPhoto();

type Confidence = 'high' | 'medium' | 'low';
const from = (source: string, value: string | number | boolean, c: Confidence = 'high') => ({
  value,
  confidence: c,
  source,
});
const row = (source: string, values: object, c: Confidence = 'high') => ({
  values,
  confidence: c,
  source,
});

// A read of `kinds`, one page each, with what it states.
function reading(kinds: readonly string[], fields: object, lists: object) {
  return {
    code: 'ok',
    extraction: {
      pages: kinds.map((kind, i) => ({
        page: i + 1,
        kind,
        document: i + 1,
        readability: { value: 'ok', confidence: 'high' },
        confidence: 'high',
      })),
      documents: kinds.map((kind, i) => ({ kind, pages: [i + 1] })),
      fields,
      lists,
      conflicts: [],
    },
    failedChecks: [],
    allowance: 'v1.quota.e2e',
  };
}

// Turnstile answers at once; the extract function answers each read with the next body.
async function fakeReads(page: Page, bodies: readonly object[]) {
  const queue = [...bodies];
  await page.clock.setFixedTime(TODAY);
  await page.route('https://challenges.cloudflare.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.turnstile = { render(el, o) { setTimeout(() => o.callback(o.action + '-token')); return 'w'; }, remove() {} };`,
    }),
  );
  await page.route(EXTRACT, (route) => route.fulfill({ json: queue.shift() }));
}

async function read(page: Page, files: readonly string[]) {
  await page
    .getByLabel('Elegir fotos o PDF')
    .setInputFiles(files.map((name) => ({ name, mimeType: 'image/png', buffer: PHOTO })));
  await page.getByLabel(/Doy mi consentimiento explícito/).check();
  await page.getByRole('button', { name: 'Leer los documentos' }).click();
  await expectShownAndFocused(page.getByRole('heading', { name: 'Datos leídos' }));
}

// The first read from the start sheet, then «Subir más documentos» and the second.
async function readTwice(
  page: Page,
  path: string,
  start: RegExp,
  first: readonly string[],
  second: readonly string[],
) {
  await page.goto(path);
  await page.getByRole('button', { name: start }).click();
  await read(page, first);
  await page.getByRole('button', { name: 'Subir más documentos' }).click();
  await expect(page.getByRole('heading', { name: 'Sube tus documentos' })).toBeFocused();
  await read(page, second);
}

// Every answer of the form, hidden sheets included: chosen radios and options, typed fields.
const answers = (page: Page, form: string) =>
  page.evaluate((id) => {
    const out: Record<string, string> = {};
    for (const el of document.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
      `#${id} input[name], #${id} select[name]`,
    )) {
      if (el instanceof HTMLInputElement && (el.type === 'radio' || el.type === 'checkbox')) {
        if (el.checked) out[el.name] = el.value;
      } else if (el.value !== '') out[el.name] = el.value;
    }
    return out;
  }, form);

// One list's rows, in order, each with the keys asked for.
function rows(all: Record<string, string>, list: string, keys: readonly string[]) {
  const found: Record<string, string>[] = [];
  for (const [name, value] of Object.entries(all)) {
    const m = new RegExp(`^${list}\\.(\\d+)\\.(\\w+)$`).exec(name);
    if (!m || !keys.includes(m[2] ?? '')) continue;
    const i = Number(m[1]);
    found[i] = { ...found[i], [m[2] ?? '']: value };
  }
  return [...found].map((r) => r ?? {});
}

const notes = (page: Page) => page.locator('[data-done-notes] li');
const markOf = (page: Page, field: string) => page.locator(`[data-field="${field}"] > .read-mark`);
const DIFFER = /no dice lo mismo que lo leído antes: se ha dejado lo que ya había/;
const CONFLICT_MARK = 'Leído del documento · otro documento dice otra cosa: compáralos';

test.describe('finiquito', () => {
  const job = (startDate: string, endDate: string) => row('work_history', { startDate, endDate });
  const FIRST = reading(
    ['settlement_proposal', 'work_history'],
    {
      cause: from('settlement_proposal', 'unfair_dismissal'),
      startDate: from('settlement_proposal', '2010-03-01'),
      endDate: from('settlement_proposal', '2026-09-15'),
      monthlySalary: from('settlement_proposal', 2142.86),
    },
    { contracts: [job('2021-01-10', '2021-06-30'), job('2022-02-01', '2022-12-31')] },
  );
  // Another work history, which repeats a job and adds one, and a letter with another end date.
  const SECOND = reading(
    ['dismissal_letter', 'work_history'],
    {
      endDate: from('dismissal_letter', '2026-09-30'),
      severance: from('dismissal_letter', 5000),
    },
    { contracts: [job('2022-02-01', '2022-12-31'), job('2023-03-01', '2023-08-31')] },
  );

  test('a second read adds its jobs and keeps what the first read', async ({ page }) => {
    await fakeReads(page, [FIRST, SECOND]);
    await readTwice(
      page,
      'finiquito/',
      /Sube tus documentos/,
      ['propuesta.png', 'vida-laboral.png'],
      ['carta.png', 'vida-laboral-2.png'],
    );
    await expect(notes(page).filter({ hasText: DIFFER })).toHaveCount(1);

    const all = await answers(page, 'calculator');
    // Not stated again: kept. Stated again otherwise: kept as first read, and marked.
    expect(all['startDate']).toBe('2010-03-01');
    expect(all['monthlySalary']).toBe('2.142,86');
    expect(all['endDate']).toBe('2026-09-15');
    await expect(markOf(page, 'endDate')).toHaveText(CONFLICT_MARK);
    // Stated only by the second read: filled.
    expect(all['figure_severance']).toBe('5.000,00');
    expect(rows(all, 'otherContracts', ['startDate', 'endDate'])).toEqual([
      { startDate: '2021-01-10', endDate: '2021-06-30' },
      { startDate: '2022-02-01', endDate: '2022-12-31' },
      { startDate: '2023-03-01', endDate: '2023-08-31' },
    ]);
    await expect(page.locator('[data-other-contract] .read-mark')).toHaveCount(3);
  });
});

test.describe('alquiler', () => {
  const receipt = (month: string, rent: number) =>
    row('rent_receipt', { month, total: rent + 50, rent, community: 50 });
  const FIRST = reading(
    ['lease', 'rent_update_notice', 'rent_receipt', 'rent_receipt', 'agency_invoice'],
    {
      signedOn: from('lease', '2024-03-15'),
      startDate: from('lease', '2024-03-20'),
      use: from('lease', 'main_home'),
      initialRent: from('lease', 1000),
      deposit: from('lease', 1000),
    },
    {
      charges: [row('lease', { kind: 'community', annualAmount: 600, concept: 'Comunidad' })],
      notices: [
        row('rent_update_notice', {
          noticeOn: '2025-02-01',
          medium: 'letter',
          percent: 3,
          previousRent: 1000,
          newRent: 1030,
          appliesFrom: '2025-03-20',
        }),
      ],
      receipts: [receipt('2025-02', 1000), receipt('2025-03', 1030)],
      invoices: [
        row('agency_invoice', { conceptKind: 'solvency_check', base: 200, vat: 42, total: 242 }),
      ],
    },
  );
  // Three more receipts, another invoice, and the deposit return, which states another deposit.
  const SECOND = reading(
    ['rent_receipt', 'rent_receipt', 'rent_receipt', 'agency_invoice', 'deposit_return'],
    { deposit: from('deposit_return', 900) },
    {
      receipts: [receipt('2025-04', 1030), receipt('2025-05', 1030), receipt('2025-06', 1030)],
      invoices: [row('agency_invoice', { conceptKind: 'agency_fee', total: 1210 })],
      returns: [row('deposit_return', { on: '2026-08-14', amount: 850 })],
    },
  );

  test('a second read adds its rows, sums every receipt and keeps the first read', async ({
    page,
  }) => {
    await fakeReads(page, [FIRST, SECOND]);
    await readTwice(
      page,
      'alquiler/',
      /^Sube tu contrato y, si los tienes/,
      ['contrato.png', 'aviso.png', 'recibo-1.png', 'recibo-2.png', 'factura.png'],
      ['recibo-3.png', 'recibo-4.png', 'recibo-5.png', 'factura-2.png', 'fianza.png'],
    );
    await expect(notes(page).filter({ hasText: DIFFER })).toHaveCount(1);
    await expect(notes(page).filter({ hasText: /se han vuelto a calcular/ })).toHaveCount(1);

    const all = await answers(page, 'rental');
    expect(all['initialRent']).toBe('1.000,00');
    expect(all['startDate']).toBe('2024-03-20');
    expect(all['deposit']).toBe('1.000,00');
    await expect(markOf(page, 'deposit')).toHaveText(CONFLICT_MARK);
    expect(rows(all, 'fees', ['kind', 'amount'])).toEqual([
      { kind: 'solvency_check', amount: '242,00' },
      { kind: 'agency_fee', amount: '1.210,00' },
    ]);
    expect(rows(all, 'updates', ['previousRent', 'newRent'])).toEqual([
      { previousRent: '1.000,00', newRent: '1.030,00' },
    ]);
    // The year's community fees from all five receipts, beside what the contract agreed.
    expect(rows(all, 'charges', ['kind', 'inContract', 'annualAgreed', 'year', 'amount'])).toEqual([
      {
        kind: 'community',
        inContract: 'yes',
        annualAgreed: '600,00',
        year: '2025',
        amount: '250,00',
      },
    ]);
    expect(rows(all, 'returns', ['on', 'amount'])).toEqual([
      { on: '2026-08-14', amount: '850,00' },
    ]);
  });
  // The concept list starts on «Comunidad», so a row typed with it looks untouched there. No
  // sheet leads back to the upload once typing, so the test opens it as the start sheet would.
  test('a read never turns a typed row into another concept’s', async ({ page }) => {
    const ibi = reading(
      ['rent_receipt'],
      {},
      {
        receipts: [
          row('rent_receipt', { month: '2025-05', total: 1300, rent: 1000, propertyTax: 300 }),
        ],
      },
    );
    await fakeReads(page, [ibi]);
    await page.goto('alquiler/');
    await page.getByRole('button', { name: /Rellenar a mano/ }).click();
    const sheet = (name: string) => page.getByRole('group', { name, exact: true });
    await sheet('Tu contrato')
      .getByLabel('¿Qué tipo de contrato es?')
      .selectOption({ label: 'Vivienda habitual' });
    await nextSheet(page);
    const dates = sheet('Las fechas del contrato');
    await dates.getByLabel('Fecha del contrato', { exact: true }).fill('2024-03-15');
    await dates.getByLabel('Fecha de entrada', { exact: true }).fill('2024-03-20');
    await nextSheet(page);
    await sheet('Tu casero').getByLabel('Una persona').check();
    await nextSheet(page);
    await sheet('Gran tenedor').getByLabel('No', { exact: true }).check();
    await nextSheet(page);
    const home = sheet('Dónde está la vivienda');
    await home.getByLabel('Comunidad autónoma').selectOption({ label: 'Comunidad de Madrid' });
    await home
      .getByRole('group', { name: '¿Está la vivienda en una zona tensionada?' })
      .getByLabel('No', { exact: true })
      .check();
    // The deposit, the guarantees and the fees stay blank.
    await nextSheet(page);
    await nextSheet(page);
    await nextSheet(page);
    await nextSheet(page);
    const rent = sheet('La renta');
    await rent.getByLabel('Renta al empezar').fill('1.000,00');
    await rent.getByLabel('Duración pactada, en meses').fill('60');
    await nextSheet(page);
    await sheet('La actualización de la renta')
      .getByLabel('¿Qué dice el contrato sobre actualizar la renta?')
      .selectOption({ label: 'El IPC' });
    await nextSheet(page);
    await sheet('Las subidas').getByLabel('No ha habido subidas').check();
    await nextSheet(page);
    await nextSheet(page);
    const charges = sheet('Los gastos');
    await charges.getByLabel('Sí, añadirlos').check();
    const charge = charges.getByRole('group', { name: 'Gasto 1' });
    await expect(charge.getByLabel('Concepto')).toHaveValue('community');
    await charge.getByLabel('Año', { exact: true }).fill('2025');
    await charge.getByLabel('Sí', { exact: true }).check();
    await charge.getByLabel('Importe al año que fija el contrato').fill('600,00');
    await charge
      .getByLabel('Importe de los gastos de ese año (el año al que corresponden)')
      .fill('700,00');
    await page.evaluate(() => {
      document.querySelector<HTMLElement>('[data-documents-start]')?.removeAttribute('hidden');
      document.querySelector<HTMLElement>('#rental')?.setAttribute('hidden', '');
      document
        .querySelector<HTMLElement>('[data-start-panel="choose"] [data-start-upload]')
        ?.click();
    });
    await read(page, ['recibo.png']);
    await expect(notes(page).filter({ hasText: DIFFER })).toHaveCount(0);

    const all = await answers(page, 'rental');
    expect(rows(all, 'charges', ['kind', 'inContract', 'annualAgreed', 'year', 'amount'])).toEqual([
      {
        kind: 'community',
        inContract: 'yes',
        annualAgreed: '600,00',
        year: '2025',
        amount: '700,00',
      },
      { kind: 'property_tax', year: '2025', amount: '300,00' },
    ]);
  });
});

test.describe('contrato', () => {
  const payslip = (month: string, last: number) =>
    row('payslip', {
      month,
      periodStart: `${month}-01`,
      periodEnd: `${month}-${last}`,
      incidents: false,
    });
  const salaryLine = (month: string) =>
    row('payslip', { month, concept: 'Salario base', amount: 1400, category: 'salary' });
  const history = (startDate: string, endDate?: string) =>
    row('work_history', {
      startDate,
      ...(endDate && { endDate }),
      employerName: 'Otra Empresa Inventada, S.A.',
    });
  const LISTS = {
    salaryParts: [],
    clauses: [],
    information: [],
    relationshipHints: [],
    payslips: [],
    lines: [],
    contracts: [],
  };
  const FIRST = reading(
    ['employment_contract', 'payslip', 'payslip', 'work_history'],
    {
      companyName: from('employment_contract', 'Talleres Ficticios del Norte, S.L.'),
      startDate: from('employment_contract', '2025-04-01'),
      endDate: from('employment_contract', '2025-12-31'),
      modality: from('employment_contract', 'production'),
      salaryAmount: from('employment_contract', 1400),
      salaryPeriod: from('employment_contract', 'month'),
      weeklyHours: from('employment_contract', 40),
    },
    {
      ...LISTS,
      payslips: [payslip('2025-04', 30), payslip('2025-05', 31)],
      lines: [salaryLine('2025-04'), salaryLine('2025-05')],
      contracts: [history('2024-06-01', '2024-11-30')],
    },
  );
  // Two more payslips, the same May one again, an older job, and other weekly hours.
  const SECOND = reading(
    ['payslip', 'payslip', 'payslip', 'work_history'],
    { weeklyHours: from('payslip', 38) },
    {
      ...LISTS,
      payslips: [payslip('2025-05', 31), payslip('2025-06', 30), payslip('2025-07', 31)],
      lines: [salaryLine('2025-05'), salaryLine('2025-06'), salaryLine('2025-07')],
      contracts: [history('2023-02-01', '2023-07-31')],
    },
  );

  test('a second read adds its payslips and jobs and keeps the first read', async ({ page }) => {
    await fakeReads(page, [FIRST, SECOND]);
    await readTwice(
      page,
      'contrato/',
      /^Sube tu contrato y, si los tienes/,
      ['contrato.png', 'nomina-abril.png', 'nomina-mayo.png', 'vida-laboral.png'],
      ['nomina-mayo.png', 'nomina-junio.png', 'nomina-julio.png', 'vida-laboral-2.png'],
    );
    await expect(notes(page).filter({ hasText: DIFFER })).toHaveCount(1);

    const all = await answers(page, 'employment');
    expect(all['startDate']).toBe('2025-04-01');
    expect(all['salaryAmount']).toBe('1.400,00');
    expect(all['weeklyHours']).toBe('40,00');
    await expect(markOf(page, 'weeklyHours')).toHaveText(CONFLICT_MARK);
    expect(rows(all, 'payslips', ['month', 'salary'])).toEqual([
      { month: '2025-04', salary: '1.400,00' },
      { month: '2025-05', salary: '1.400,00' },
      { month: '2025-06', salary: '1.400,00' },
      { month: '2025-07', salary: '1.400,00' },
    ]);
    expect(rows(all, 'history', ['startDate', 'endDate'])).toEqual([
      { startDate: '2024-06-01', endDate: '2024-11-30' },
      { startDate: '2023-02-01', endDate: '2023-07-31' },
    ]);
  });
});
