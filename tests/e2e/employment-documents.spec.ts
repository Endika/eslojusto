import { test, expect, type Locator, type Page, type Request } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { syntheticPhoto } from '../support/synthetic-photo';
import { nextSheet } from '../support/sheets';

// Runs only against a TEST_DOCUMENTS=1 build, which has /contrato/ too: every request to the fake
// API, to Turnstile and to Stripe is answered here. The documents, companies and figures are
// synthetic.

const ORIGIN = `http://localhost:${process.env['E2E_PORT'] ?? 4321}`;
const API = {
  extract: 'https://extract.api.eslojusto.test/',
  checkout: 'https://checkout.api.eslojusto.test/',
  pass: 'https://pass.api.eslojusto.test/',
};
const STRIPE = 'https://checkout.stripe.com/c/pay/cs_test_e2e';
// Every case reads the minimum wage and the norms as loaded on this day.
const TODAY = new Date('2026-10-08T12:00:00');

const PHOTO = syntheticPhoto();
const photo = (name: string) => ({ name, mimeType: 'image/png', buffer: PHOTO });

const b64url = (v: object) => Buffer.from(JSON.stringify(v)).toString('base64url');
const expiresAt = Math.floor(Date.now() / 1000) + 7 * 86400;
const PASS = `v1.${b64url({ typ: 'pass', sid: 'cs_test_e2e', exp: expiresAt })}.c2ln`;

type Confidence = 'high' | 'medium' | 'low';
const from = (
  source: string,
  value: string | number | boolean,
  confidence: Confidence = 'high',
) => ({ value, confidence, source });
const contractField = (value: string | number | boolean, confidence: Confidence = 'high') =>
  from('employment_contract', value, confidence);
const offerField = (value: string | number | boolean) => from('job_offer', value);
const row = (source: string, values: object, confidence: Confidence = 'high') => ({
  values,
  confidence,
  source,
});
const readPage = (n: number, kind: string, readability = 'ok', month?: string) => ({
  page: n,
  kind,
  document: n,
  ...(month && { month }),
  readability: { value: readability, confidence: 'high' },
  confidence: 'high',
});

const NO_LISTS = {
  salaryParts: [],
  clauses: [],
  information: [],
  relationshipHints: [],
  payslips: [],
  lines: [],
  contracts: [],
};

// A fixed-term production contract at a fictitious company, from 01-04-2025 to 31-12-2025.
const CONTRACT = {
  employerType: contractField('company'),
  companyName: contractField('Talleres Ficticios del Norte, S.L.'),
  signedOn: contractField('2025-03-28'),
  startDate: contractField('2025-04-01'),
  endDate: contractField('2025-12-31'),
  modalityText: contractField('Contrato temporal por circunstancias de la producción'),
  modality: contractField('production'),
  partTime: contractField(false),
  causeText: contractField('Aumento de pedidos por la campaña de otoño de la línea de montaje.'),
  category: contractField('Oficial de segunda'),
  agreementName: contractField('Convenio colectivo ficticio del metal'),
  salaryAmount: contractField(1400),
  salaryPeriod: contractField('month'),
  payments: contractField(14),
  prorated: contractField(false),
  weeklyHours: contractField(40),
  scheduleText: contractField('De lunes a viernes, de 8:00 a 16:00.'),
  shifts: contractField(false),
  night: contractField(false),
  overtimeAgreed: contractField('none'),
  holidayDays: contractField(30),
  holidayUnit: contractField('calendar'),
  trialAmount: contractField(1),
  trialUnit: contractField('months'),
};

const workHistory = (
  start: string,
  end: string | null,
  employerName: string,
  accountCode: string,
) =>
  row('work_history', {
    startDate: start,
    ...(end && { endDate: end }),
    employerType: 'company',
    employerName,
    accountCode,
  });

// The contract, two payslips, the offer and the work history. The category in the June payslip
// is not the contract's; that payslip shows an incident; the work history holds the contract
// itself and two contracts at another company.
const PACK = {
  code: 'ok',
  extraction: {
    pages: [
      readPage(1, 'employment_contract'),
      readPage(2, 'employment_contract'),
      readPage(3, 'payslip', 'ok', '2025-05'),
      readPage(4, 'payslip', 'ok', '2025-06'),
      readPage(5, 'job_offer'),
      readPage(6, 'work_history'),
    ],
    documents: [
      { kind: 'employment_contract', pages: [1, 2] },
      { kind: 'payslip', pages: [3], month: '2025-05' },
      { kind: 'payslip', pages: [4], month: '2025-06' },
      { kind: 'job_offer', pages: [5] },
      { kind: 'work_history', pages: [6] },
    ],
    fields: {
      ...CONTRACT,
      offerSalaryAmount: offerField(20000),
      offerSalaryPeriod: offerField('year'),
      offerNet: offerField(false),
      offerWeeklyHours: offerField(40),
      offerModality: offerField('permanent'),
      offerRemote: offerField('none'),
    },
    lists: {
      ...NO_LISTS,
      clauses: [
        row('employment_contract', {
          label: 'non_compete',
          literal:
            'Durante un año tras el fin del contrato no trabajarás para empresas del sector.',
          months: 12,
          compensationStated: false,
        }),
      ],
      information: [
        row('employment_contract', { element: 'a', presence: 'present' }),
        row('employment_contract', { element: 'o', presence: 'present' }),
      ],
      payslips: [
        row('payslip', {
          month: '2025-05',
          periodStart: '2025-05-01',
          periodEnd: '2025-05-31',
          incidents: false,
          category: 'Oficial de segunda',
        }),
        row('payslip', {
          month: '2025-06',
          periodStart: '2025-06-01',
          periodEnd: '2025-06-30',
          incidents: true,
          category: 'Peón',
        }),
      ],
      lines: [
        row('payslip', {
          month: '2025-05',
          concept: 'Salario base',
          amount: 1300,
          category: 'salary',
        }),
        row('payslip', {
          month: '2025-05',
          concept: 'Plus convenio',
          amount: 100,
          category: 'fixed_complement',
        }),
        row('payslip', {
          month: '2025-05',
          concept: 'Horas extra',
          amount: 80,
          category: 'overtime',
        }),
        // A concept the API dropped: only its amount and category arrive.
        row('payslip', { month: '2025-06', amount: 1400, category: 'salary' }),
      ],
      contracts: [
        workHistory('2025-04-01', null, 'TALLERES FICTICIOS DEL NORTE SL', '48 1234567 89'),
        workHistory('2024-06-01', '2024-11-30', 'Otra Empresa Inventada, S.A.', '28 7654321 00'),
        workHistory('2023-02-01', '2023-07-31', 'Otra Empresa Inventada, S.A.', '28 7654321 00'),
      ],
    },
    conflicts: [{ field: 'category', sources: ['employment_contract', 'payslip'] }],
  },
  failedChecks: [],
  allowance: 'v1.quota.e2e',
};
const PACK_FILES = [
  'contrato-1.png',
  'contrato-2.png',
  'nomina-mayo.png',
  'nomina-junio.png',
  'oferta.png',
  'vida-laboral.png',
];

interface Fake {
  readonly extract: Request[];
  readonly checkout: Request[];
  readonly pass: Request[];
}

async function fakeServices(
  page: Page,
  extract: { status: number; body: object } = { status: 200, body: PACK },
): Promise<Fake> {
  const fake: Fake = { extract: [], checkout: [], pass: [] };
  await page.clock.setFixedTime(TODAY);
  await page.route('https://challenges.cloudflare.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.turnstile = { render(el, o) { setTimeout(() => o.callback(o.action + '-token')); return 'w'; }, remove() {} };`,
    }),
  );
  await page.route(API.extract, (route) => {
    fake.extract.push(route.request());
    return route.fulfill({ status: extract.status, json: extract.body });
  });
  await page.route(API.checkout, (route) => {
    fake.checkout.push(route.request());
    return route.fulfill({ json: { code: 'ok', sessionId: 'cs_test_e2e', url: STRIPE } });
  });
  await page.route(API.pass, (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if ('pass' in body) return route.fulfill({ json: { code: 'ok', expiresAt, readsLeft: 15 } });
    fake.pass.push(route.request());
    return route.fulfill({ json: { code: 'ok', pass: PASS, expiresAt, readsLeft: 15 } });
  });
  await page.route('https://checkout.stripe.com/**', (route) =>
    route.fulfill({
      status: 302,
      headers: { location: `${ORIGIN}/contrato/?session_id=cs_test_e2e` },
    }),
  );
  return fake;
}

async function upload(page: Page, files: readonly string[]) {
  await page.goto('contrato/');
  await page.getByRole('button', { name: /^Sube tu contrato y, si los tienes/ }).click();
  await expect(page.getByRole('heading', { name: 'Sube tus documentos' })).toBeFocused();
  await page.getByLabel('Elegir fotos o PDF').setInputFiles(files.map(photo));
  await page.getByLabel(/Doy mi consentimiento explícito/).check();
  await page.getByRole('button', { name: 'Leer los documentos' }).click();
  // Several photos take a while to draw and encode.
  await expect(page.getByRole('heading', { name: 'Datos leídos' })).toBeFocused({
    timeout: 30_000,
  });
}

const sheet = (page: Page, name: string) => page.getByRole('group', { name, exact: true });
const question = (scope: Locator, name: string) => scope.getByRole('group', { name, exact: true });
const choose = (scope: Locator, name: string, value: string) =>
  question(scope, name).getByLabel(value, { exact: true }).check();
const markOf = (page: Page, field: string) => page.locator(`[data-field="${field}"] > .read-mark`);

const next = nextSheet;

// The relationship and the contract's type, read; the answers no document gives.
async function confirmStart(page: Page) {
  await page.getByRole('button', { name: 'Revisar los datos' }).click();
  const relation = sheet(page, 'Tu relación laboral');
  await expect(relation.getByLabel('Trabajo por cuenta ajena', { exact: true })).toBeChecked();
  await expect(markOf(page, 'relationship')).toHaveText(
    'Sale de lo leído en tus documentos · confianza media',
  );
  await expect(relation.getByLabel('Fecha de inicio', { exact: true })).toHaveValue('2025-04-01');
  await expect(relation.getByLabel('Fecha de fin', { exact: true })).toHaveValue('2025-12-31');
  await expect(markOf(page, 'startDate')).toHaveText('Leído del documento · confianza alta');
  await choose(relation, '¿Tienes menos de 18 años?', 'No');
  await next(page);

  const modality = sheet(page, 'Tu tipo de contrato');
  await expect(
    modality.getByLabel('Por circunstancias de la producción', { exact: true }),
  ).toBeChecked();
  await expect(modality.locator('[data-read-quote="modality"] blockquote')).toHaveText(
    'Contrato temporal por circunstancias de la producción',
  );
  // The cause as the contract words it, beside the question the person answers.
  await expect(modality.locator('[data-read-quote="causeStated"] blockquote')).toHaveText(
    'Aumento de pedidos por la campaña de otoño de la línea de montaje.',
  );
  await choose(modality, '¿El contrato explica la causa de que sea temporal?', 'Sí');
  await choose(
    modality,
    '¿Y explica las circunstancias concretas y su relación con la duración?',
    'Sí',
  );
  await next(page);
}

// The rest of the sheets after the work history, as a whole contract fills them.
async function confirmRest(page: Page) {
  const salary = sheet(page, 'Tu salario');
  await expect(salary.getByLabel('Salario bruto', { exact: true })).toHaveValue('1.400,00');
  await expect(salary.getByLabel('Al mes', { exact: true })).toBeChecked();
  await expect(salary.getByLabel('Pagas extra al año', { exact: true })).toHaveValue('2');
  await expect(markOf(page, 'extraPays')).toHaveText(
    'Sale de lo leído en tus documentos · confianza alta',
  );
  await expect(salary.getByLabel('Horas a la semana', { exact: true })).toHaveValue('40,00');
  await expect(salary.locator('[data-read-quote="categorySalary"] blockquote')).toHaveText(
    'Oficial de segunda',
  );
  await next(page);

  const payslips = sheet(page, 'Tus nóminas');
  const may = payslips.getByRole('group', { name: 'Nómina 1' });
  await expect(may.getByLabel('Mes', { exact: true })).toHaveValue('2025-05');
  // Base and fixed complements; the overtime line is left out.
  await expect(may.getByLabel('Devengos salariales en dinero', { exact: true })).toHaveValue(
    '1.400,00',
  );
  await expect(
    question(may, '¿Trabajaste el mes completo?').getByLabel('Sí', { exact: true }),
  ).toBeChecked();
  const june = payslips.getByRole('group', { name: 'Nómina 2' });
  await expect(
    question(june, '¿Tiene incidencias (baja, ausencias)?').getByLabel('Sí', { exact: true }),
  ).toBeChecked();
  await next(page);

  const time = sheet(page, 'Tu jornada');
  await expect(time.locator('[data-read-quote="hasSchedule"] blockquote')).toHaveText(
    'De lunes a viernes, de 8:00 a 16:00.',
  );
  await expect(
    question(time, '¿Trabajas a turnos?').getByLabel('No', { exact: true }),
  ).toBeChecked();
  await choose(time, '¿El contrato reparte la jornada de forma irregular en el año?', 'No');
  await next(page);

  const trial = sheet(page, 'Tu periodo de prueba');
  await expect(trial.getByLabel('Duración', { exact: true })).toHaveValue('1,00');
  await choose(trial, '¿Eres técnico titulado?', 'No');
  await choose(trial, '¿Tu empresa tiene menos de 25 personas en plantilla?', 'No');
  await choose(trial, '¿Ya habías hecho este mismo trabajo en esta empresa?', 'No');
  await choose(trial, '¿Vienes de un contrato formativo en esta empresa?', 'No');
  await next(page);

  const holidays = sheet(page, 'Tus vacaciones');
  await expect(holidays.getByLabel('Días de vacaciones al año', { exact: true })).toHaveValue(
    '30,00',
  );
  await choose(holidays, '¿Dice que las vacaciones van incluidas en el salario?', 'No');
  await next(page);
}

async function confirmClausesAndOffer(page: Page) {
  const clauses = sheet(page, 'Cláusulas');
  const clause = clauses.getByRole('group', { name: 'Cláusula 1' });
  await expect(clause.getByLabel('Tipo de cláusula', { exact: true })).toHaveValue('non_compete');
  // The clause's words sit beside the label read for it.
  await expect(clause.getByLabel('Lo que dice la cláusula', { exact: true })).toHaveValue(
    'Durante un año tras el fin del contrato no trabajarás para empresas del sector.',
  );
  await next(page);
  const info = sheet(page, 'Lo que el contrato tiene que decir');
  await expect(info.locator('[data-field="info_a"] > .read-mark')).toHaveText(
    'Leído del documento · confianza alta',
  );
  await next(page);
  const offer = sheet(page, 'La oferta de empleo');
  await expect(offer.getByLabel('Salario al año de la oferta', { exact: true })).toHaveValue(
    '20.000,00',
  );
  await expect(offer.getByLabel('Tipo de contrato de la oferta', { exact: true })).toHaveValue(
    'permanent',
  );
  await page.getByRole('button', { name: 'Revisar' }).click();
  await expect(page.getByRole('heading', { name: 'Resultado', level: 2 })).toBeFocused();
}

async function expectNoDetail(result: Locator) {
  await expect(result.locator('[data-detail]')).toHaveCount(0);
  expect((await result.textContent()) ?? '').not.toContain('Cómo se calcula');
}

test('the page opens on the choice between reading documents and typing', async ({ page }) => {
  await page.goto('contrato/');
  await expect(page.getByRole('heading', { name: '¿Cómo quieres empezar?' })).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: /Sube tu contrato y, si los tienes, nóminas, la oferta de empleo y tu vida laboral/,
    }),
  ).toBeVisible();
  await expect(page.locator('#employment')).toBeHidden();
  await page.getByRole('button', { name: /Rellenar a mano/ }).click();
  await expect(page.getByRole('heading', { name: 'Tu relación laboral', level: 2 })).toBeFocused();
  await expect(page.getByRole('navigation', { name: 'Secciones' })).toBeVisible();
});

test('a whole pack fills every sheet; the detail waits for the pass, which unlocks it', async ({
  page,
}) => {
  const fake = await fakeServices(page);
  await upload(page, PACK_FILES);

  // The request names its review; the final pay's never does.
  const sent = fake.extract[0]?.postDataJSON() as Record<string, unknown>;
  expect(sent).toMatchObject({ review: 'employment', captchaToken: 'extract-token', quota: null });
  await expect(
    page.getByText(
      'Contrato de trabajo (2 páginas) · Nómina de mayo · Nómina de junio · Oferta de empleo · Vida laboral',
    ),
  ).toBeVisible();
  // The contract's category and the June payslip's differ: it is said, never settled.
  await expect(
    page.getByText(/La categoría o el grupo no es el mismo en el contrato y en alguna nómina/),
  ).toBeVisible();
  await expect(page.getByText(/No se han sumado: horas extra\./)).toBeVisible();

  await confirmStart(page);
  const history = sheet(page, 'Tus contratos anteriores');
  await expect(history.getByLabel('Sí, añadirlos', { exact: true })).toBeChecked();
  const kinds = ['Por circunstancias de la producción', 'Indefinido', 'Indefinido'];
  for (const [i, employer] of ['same', 'other', 'other'].entries()) {
    const contract = history.getByRole('group', { name: `Contrato ${i + 1}`, exact: true });
    await expect(contract.getByLabel('Empresa', { exact: true })).toHaveValue(employer);
    await contract.getByLabel('Tipo de contrato', { exact: true }).selectOption({
      label: kinds[i] ?? '',
    });
  }
  await expect(
    history.getByRole('group', { name: 'Contrato 1' }).getByLabel('Hasta', { exact: true }),
  ).toHaveValue('2025-12-31');
  await expect(history.getByLabel('Faltan contratos más antiguos en esta lista')).not.toBeChecked();
  await next(page);
  await confirmRest(page);
  await confirmClausesAndOffer(page);

  const result = page.locator('#resultado');
  await expect(
    result.getByRole('region', { name: 'Contratos temporales encadenados', exact: true }),
  ).toContainText('Dentro del límite');
  await expectNoDetail(result);

  // The same pass as the other reviews', returning to this page.
  const offer = page.getByRole('region', { name: 'El detalle, el informe y la carta' });
  await expect(offer).toContainText('4,99 € con IVA incluido');
  await expect(offer.getByRole('button', { name: /Descargar/ })).toHaveCount(0);
  await offer.getByLabel(/pierdo el derecho de desistimiento/).check();
  await offer.getByRole('button', { name: 'Pagar 4,99 €' }).click();
  await expect(
    page.getByText('Pago recibido. Ya puedes ver el detalle de cada punto y descargar el informe.'),
  ).toBeVisible();
  expect(fake.checkout[0]?.postDataJSON()).toMatchObject({ returnTo: 'employment' });
  expect(fake.pass[0]?.postDataJSON()).toMatchObject({ sessionId: 'cs_test_e2e' });
  expect(page.url()).not.toContain('session_id');
  expect(await page.evaluate(() => sessionStorage.length)).toBe(0);

  // The review came back with the person, now with its detail: the June payslip, with its
  // incident, is not compared.
  const payslips = result.getByRole('region', { name: 'Nóminas frente al SMI', exact: true });
  await payslips.getByText('Cómo se calcula').click();
  await expect(payslips).toContainText(
    'Nómina de junio de 2025: no es de un mes completo o tiene incidencias, así que no se compara.',
  );
  await expect(offer).toContainText(/Tu pase vale hasta el/);
});

test('a work history cut to its most recent rows never reads as within the limit', async ({
  page,
}) => {
  const rows = Array.from({ length: 15 }, (_, i) =>
    workHistory(
      `${2010 + i}-01-01`,
      `${2010 + i}-02-28`,
      'Otra Empresa Inventada, S.A.',
      '28 7654321 00',
    ),
  );
  await fakeServices(page, {
    status: 200,
    body: {
      ...PACK,
      extraction: {
        ...PACK.extraction,
        lists: { ...PACK.extraction.lists, contracts: rows },
        truncated: true,
      },
    },
  });
  await upload(page, PACK_FILES);
  await expect(
    page.getByText(
      /Tu vida laboral tiene más filas de las que se leen de una vez: se han leído las 15 más recientes/,
    ),
  ).toBeVisible();

  await confirmStart(page);
  const history = sheet(page, 'Tus contratos anteriores');
  await expect(history.getByLabel('Faltan contratos más antiguos en esta lista')).toBeChecked();
  for (let i = 1; i <= 15; i += 1) {
    const contract = history.getByRole('group', { name: `Contrato ${i}`, exact: true });
    await expect(contract.getByLabel('Empresa', { exact: true })).toHaveValue('other');
    await contract.getByLabel('Tipo de contrato', { exact: true }).selectOption('production');
  }
  await next(page);
  await confirmRest(page);
  await next(page);
  await next(page);
  await expect(sheet(page, 'La oferta de empleo')).toBeVisible();
  // With a pass already held, the detail shows why.
  await page.evaluate(
    (pass) => localStorage.setItem('eslojusto-pase', pass),
    JSON.stringify({ token: PASS, expiresAt, readsLeft: 15 }),
  );
  await page.getByRole('button', { name: 'Revisar' }).click();
  const card = page.getByRole('region', { name: 'Contratos temporales encadenados', exact: true });
  await expect(card.locator('.item__status')).toHaveText('Revísalo');
  await card.getByText('Cómo se calcula').click();
  await expect(card).toContainText('no se puede confirmar que estés dentro del límite');
});

test('a read that finds nothing says why for each file and spends no read', async ({ page }) => {
  const fake = await fakeServices(page, {
    status: 422,
    body: {
      code: 'nothing_read',
      pages: [
        {
          page: 1,
          kind: 'employment_contract',
          readability: { value: 'blurry', confidence: 'high' },
        },
        {
          page: 2,
          kind: 'other',
          readability: { value: 'not_labour_document', confidence: 'high' },
        },
      ],
    },
  });
  await page.goto('contrato/');
  await page.getByRole('button', { name: /^Sube tu contrato y, si los tienes/ }).click();
  await page
    .getByLabel('Elegir fotos o PDF')
    .setInputFiles(['contrato-movido.png', 'factura-luz.png'].map(photo));
  await page.getByLabel(/Doy mi consentimiento explícito/).check();
  await page.getByRole('button', { name: 'Leer los documentos' }).click();
  await expect(
    page.getByText('No se ha leído ningún dato, así que esta lectura no cuenta.'),
  ).toBeFocused();
  await expect(
    page.getByText('contrato-movido.png: sale borrosa. Prueba con más luz y el móvil quieto.'),
  ).toBeVisible();
  await expect(page.getByText('factura-luz.png: no parece un documento laboral.')).toBeVisible();
  expect(fake.extract).toHaveLength(1);
  expect(await page.evaluate(() => localStorage.getItem('eslojusto-lecturas'))).toBeNull();
});

interface ByHand {
  readonly start: string;
  readonly salary?: string;
  readonly modality?: string;
  // The elements of the information the contract lacks, by their names on the sheet.
  readonly missing?: readonly string[];
}

// Typed by hand: a full-time contract with 2 extra payments, a 2-month trial and 30 days of
// holidays; the rest as each case says.
async function fillByHand(page: Page, c: ByHand) {
  await page.goto('contrato/');
  await page.getByRole('button', { name: /Rellenar a mano/ }).click();
  const relation = sheet(page, 'Tu relación laboral');
  await relation.getByLabel('Trabajo por cuenta ajena', { exact: true }).check();
  await choose(
    relation,
    '¿Te contrató una empresa de trabajo temporal para trabajar en otra?',
    'No',
  );
  await choose(relation, '¿Es un contrato de relevo?', 'No');
  await choose(relation, '¿Tienes menos de 18 años?', 'No');
  await choose(relation, '¿Tienes el contrato por escrito?', 'Sí');
  await relation.getByLabel('Fecha de inicio', { exact: true }).fill(c.start);
  await next(page);
  await sheet(page, 'Tu tipo de contrato')
    .getByLabel(c.modality ?? 'Indefinido', { exact: true })
    .check();
  await next(page);
  if (c.modality !== undefined) {
    await expect(sheet(page, 'Tus contratos anteriores')).toBeVisible();
    await next(page);
  }
  const salary = sheet(page, 'Tu salario');
  await salary.getByLabel('Salario bruto', { exact: true }).fill(c.salary ?? '1.500,00');
  await choose(salary, '¿Por qué periodo es esa cifra?', 'Al mes');
  await salary.getByLabel('Pagas extra al año', { exact: true }).fill('2');
  await choose(salary, '¿Las pagas extra van prorrateadas en cada nómina?', 'No');
  await salary.getByLabel('Horas a la semana', { exact: true }).fill('40');
  await choose(salary, '¿El contrato nombra tu convenio colectivo?', 'Sí');
  await next(page);
  await expect(sheet(page, 'Tus nóminas')).toBeVisible();
  await next(page);
  const time = sheet(page, 'Tu jornada');
  await choose(time, '¿Trabajas a turnos?', 'No');
  await choose(time, '¿Trabajas de noche?', 'No');
  await choose(time, '¿El contrato reparte la jornada de forma irregular en el año?', 'No');
  await choose(time, '¿Es un contrato a tiempo parcial?', 'No');
  await next(page);
  const trial = sheet(page, 'Tu periodo de prueba');
  await choose(trial, '¿El contrato tiene periodo de prueba?', 'Sí');
  await trial.getByLabel('Duración', { exact: true }).fill('2');
  await choose(trial, 'En', 'Meses');
  await choose(trial, '¿Eres técnico titulado?', 'No');
  await choose(trial, '¿Tu empresa tiene menos de 25 personas en plantilla?', 'No');
  await choose(trial, '¿Ya habías hecho este mismo trabajo en esta empresa?', 'No');
  await choose(trial, '¿Vienes de un contrato formativo en esta empresa?', 'No');
  await next(page);
  const holidays = sheet(page, 'Tus vacaciones');
  await choose(holidays, '¿El contrato dice cuántos días de vacaciones tienes?', 'Sí');
  await holidays.getByLabel('Días de vacaciones al año', { exact: true }).fill('30');
  await choose(holidays, '¿Qué días son?', 'Naturales');
  await choose(holidays, '¿Dice que las vacaciones van incluidas en el salario?', 'No');
  await next(page);
  await expect(sheet(page, 'Cláusulas')).toBeVisible();
  await next(page);
  const info = sheet(page, 'Lo que el contrato tiene que decir');
  for (const element of c.missing ?? []) await choose(info, element, 'No está');
  await next(page);
  await expect(sheet(page, 'La oferta de empleo')).toBeVisible();
  await page.getByRole('button', { name: 'Revisar' }).click();
  await expect(page.getByRole('heading', { name: 'Resultado', level: 2 })).toBeFocused();
}

const AGREEMENT = 'Convenio colectivo, con su código y su fecha de publicación';
const CATEGORY = 'Categoría o grupo profesional y descripción del puesto';

async function downloadOf(page: Page, button: Locator): Promise<string> {
  const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
  const path = await download.path();
  expect(readFileSync(path).subarray(0, 5).toString()).toBe('%PDF-');
  return download.suggestedFilename();
}

// No sheet is ever wider than the screen.
async function fits(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test('the pass unlocks the report and the letter to the company, filled in and downloaded', async ({
  page,
}) => {
  const fake = await fakeServices(page);
  const sent: string[] = [];
  page.on('request', (r) => sent.push(`${r.url()} ${r.postData() ?? ''}`));
  // 1.150 € in 14 payments is 16.100 € a year, under the 2026 minimum; the agreement and the
  // category are not in the contract.
  await fillByHand(page, {
    start: '2026-01-01',
    salary: '1.150,00',
    missing: [AGREEMENT, CATEGORY],
  });

  const offer = page.getByRole('region', { name: 'El detalle, el informe y la carta' });
  const letter = offer.getByRole('group', { name: 'Tus datos para las cartas (opcional)' });
  // Before paying, only the letter that asks for the information.
  await expect(
    letter.getByRole('button', {
      name: 'Descargar la carta que pide la información por escrito (PDF, gratis)',
    }),
  ).toBeVisible();
  await expect(
    letter.getByRole('button', { name: 'Descargar la carta a la empresa (PDF)' }),
  ).toBeHidden();
  await expect(offer.getByRole('button', { name: 'Descargar el informe (PDF)' })).toBeHidden();
  await expect(letter.getByRole('button', { name: /petición del certificado/ })).toBeHidden();

  await offer.getByLabel(/pierdo el derecho de desistimiento/).check();
  await offer.getByRole('button', { name: 'Pagar 4,99 €' }).click();
  await expect(offer).toContainText(/Tu pase vale hasta el/);
  expect(fake.pass).toHaveLength(1);

  expect(
    await downloadOf(page, offer.getByRole('button', { name: 'Descargar el informe (PDF)' })),
  ).toBe('eslojusto-informe-contrato.pdf');
  await letter.getByLabel('Tu nombre y apellidos').fill('Alex Ejemplo');
  await letter.getByLabel('DNI o NIE (opcional)').fill('00000000A');
  await letter.getByLabel('Empresa').fill('Talleres Ficticios SL');
  await letter.getByLabel('Centro de trabajo').fill('Calle Inventada 0, Villaficticia');
  await letter.getByLabel('Localidad').fill('Villaficticia');
  await expect(letter.getByLabel('Fecha')).toHaveValue('2026-10-08');
  expect(
    await downloadOf(
      page,
      letter.getByRole('button', { name: 'Descargar la carta a la empresa (PDF)' }),
    ),
  ).toBe('eslojusto-carta-empresa.pdf');
  expect(
    await downloadOf(
      page,
      letter.getByRole('button', {
        name: 'Descargar la carta que pide la información por escrito (PDF, gratis)',
      }),
    ),
  ).toBe('eslojusto-carta-informacion.pdf');
  // Downloaded, never sent: nothing typed for the letters left the page.
  await expect(letter.getByText(/^Las cartas son plantillas\./)).toBeVisible();
  for (const typed of ['Alex Ejemplo', '00000000A', 'Talleres Ficticios', 'Calle Inventada'])
    expect(sent.filter((r) => r.includes(typed) || r.includes(encodeURIComponent(typed)))).toEqual(
      [],
    );
});

test('with nothing to sell, the letter asking for the information is free', async ({ page }) => {
  const fake = await fakeServices(page);
  await page.setViewportSize({ width: 360, height: 640 });
  await fillByHand(page, { start: '2024-03-01', missing: [AGREEMENT] });

  const letters = page.getByRole('region', { name: 'Cartas que puedes descargar gratis' });
  await expect(letters).toContainText('Estas cartas solo piden información');
  await expect(letters.getByRole('button', { name: 'Pagar 4,99 €' })).toBeHidden();
  // Nothing on show speaks of the pass.
  await expect(letters).not.toContainText(/pase|4,99/, { useInnerText: true });
  await expect(letters.getByRole('button', { name: /petición del certificado/ })).toBeHidden();
  await letters.getByLabel('Tu nombre y apellidos').fill('Alex Ejemplo');
  expect(
    await downloadOf(
      page,
      letters.getByRole('button', {
        name: 'Descargar la carta que pide la información por escrito (PDF, gratis)',
      }),
    ),
  ).toBe('eslojusto-carta-informacion.pdf');
  // Nothing was bought nor any pass fetched.
  expect(fake.checkout).toHaveLength(0);
  expect(fake.pass).toHaveLength(0);
  await fits(page);
});

test('a fixed-term finding gives the certificate request free, beside the pass', async ({
  page,
}) => {
  const fake = await fakeServices(page);
  await page.setViewportSize({ width: 360, height: 640 });
  await fillByHand(page, { start: '2023-05-02', modality: 'De obra o servicio' });

  const offer = page.getByRole('region', { name: 'El detalle, el informe y la carta' });
  await expect(offer.getByRole('button', { name: 'Pagar 4,99 €' })).toBeVisible();
  await expect(offer.getByRole('button', { name: /carta que pide la información/ })).toBeHidden();
  expect(
    await downloadOf(
      page,
      offer.getByRole('button', {
        name: 'Descargar la petición del certificado de contratos temporales (PDF, gratis)',
      }),
    ),
  ).toBe('eslojusto-certificado-contratos-temporales.pdf');
  expect(fake.pass).toHaveLength(0);
  await fits(page);
});

test('with the documents API, the contract questions cover documents and the pass, in the JSON-LD too', async ({
  page,
}) => {
  await page.goto('contrato/');
  const questions = (await page.locator('.faq-item summary').allTextContents()).map((q) =>
    q.trim(),
  );
  expect(questions).toContain('¿Qué pasa con mis documentos?');
  expect(questions).toContain('¿Qué incluye el pase de 4,99 €?');
  const json = (await page.locator('script[type="application/ld+json"]').textContent()) ?? '';
  const graph = (JSON.parse(json) as { '@graph': Record<string, unknown>[] })['@graph'];
  const faq = graph.find((n) => n['@type'] === 'FAQPage') as
    { mainEntity: { name: string }[] } | undefined;
  expect(faq?.mainEntity.map((q) => q.name)).toEqual(questions);
});
