import { test, expect, type Locator, type Page, type Request } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { syntheticPhoto } from '../support/synthetic-photo';
import { fitsScreen, forwardButton, noSideScroll } from '../support/sheets';
import { expectShownAndFocused } from '../support/reads';

// Runs only against a TEST_DOCUMENTS=1 build, which has /facturas/ too: every request to the fake
// API, to Turnstile and to Stripe is answered here. Every bill and figure is synthetic.

const ORIGIN = `http://localhost:${process.env['E2E_PORT'] ?? 4321}`;
const API = {
  extract: 'https://extract.api.eslojusto.test/',
  checkout: 'https://checkout.api.eslojusto.test/',
  pass: 'https://pass.api.eslojusto.test/',
};
const STRIPE = 'https://checkout.stripe.com/c/pay/cs_test_e2e';
const TODAY = new Date('2026-10-13T12:00:00');

const b64url = (v: object) => Buffer.from(JSON.stringify(v)).toString('base64url');
const expiresAt = Math.floor(Date.now() / 1000) + 7 * 86400;
const PASS = `v1.${b64url({ typ: 'pass', sid: 'cs_test_e2e', exp: expiresAt })}.c2ln`;

const PHOTO = syntheticPhoto();
const photo = (name: string) => ({ name, mimeType: 'image/png', buffer: PHOTO });

type Value = string | number | boolean;
const row = (values: Record<string, Value>) => ({
  values,
  confidence: 'high',
  source: 'electricity_bill',
});
const readPage = (n: number) => ({
  page: n,
  kind: 'electricity_bill',
  document: n,
  readability: { value: 'ok', confidence: 'high' },
  confidence: 'high',
});

const SUPPLY = '0123456789abcdef';

// A June PVPC bill of a household in Madrid, 4,6 kW in both periods, worked out from the 2026
// tables, with its single-phase meter charged at 1,00 € instead of 0,80 €: 0,20 € over.
const JUNE = {
  market: 'pvpc',
  issuedOn: '2026-07-02',
  dueOn: '2026-07-07',
  readingFrom: '2026-05-31',
  readingTo: '2026-06-30',
  billedDays: 30,
  supplyFingerprint: SUPPLY,
  postcode: '28001',
  accessTariff: '2.0TD',
  selfConsumption: 'none',
  contractedPowerP1: 4.6,
  contractedPowerP2: 4.6,
  maxPowerUsedP1: 3.1,
  maxPowerUsedP2: 1.2,
  tollsAndChargesPower: 10.75,
  tollsAndChargesEnergy: 8.3,
  socialBonusFunding: 0.6,
  electricityTaxPercent: 5.11269632,
  electricityTaxAmount: 2.4,
  meterAmount: 1,
  meterPhase: 'single',
  vatPercent: 21,
  vatAmount: 10.59,
  total: 61.01,
};
// The next two months, 30 days each, with the social bonus funding of its new price: 0,74 €. The
// electricity tax on 47,16 € is 2,41 €; VAT on 50,57 €, 10,62 €.
const later = (readingFrom: string, readingTo: string, issuedOn: string, dueOn: string) => ({
  ...JUNE,
  readingFrom,
  readingTo,
  issuedOn,
  dueOn,
  socialBonusFunding: 0.74,
  electricityTaxAmount: 2.41,
  vatAmount: 10.62,
  total: 61.19,
});
const JULY = later('2026-06-30', '2026-07-30', '2026-08-03', '2026-08-07');
const AUGUST = later('2026-07-30', '2026-08-29', '2026-09-02', '2026-09-07');

const linesOf = (document: number) => ({
  powerLines: [
    row({ document, period: 'p1', kw: 4.6, price: 30.817413, unit: 'per_kw_year', amount: 11.65 }),
    row({ document, period: 'p2', kw: 4.6, price: 0.725423, unit: 'per_kw_year', amount: 0.27 }),
  ],
  energyLines: [
    row({ document, period: 'p1', kwh: 60, price: 0.2, amount: 12 }),
    row({ document, period: 'p2', kwh: 70, price: 0.15, amount: 10.5 }),
    row({ document, period: 'p3', kwh: 120, price: 0.1, amount: 12 }),
  ],
});

// A read of these bills, one page each, in the order given.
function pack(bills: readonly object[], failedChecks: readonly string[] = []) {
  const lines = bills.map((_, i) => linesOf(i + 1));
  return {
    code: 'ok',
    extraction: {
      pages: bills.map((_, i) => readPage(i + 1)),
      documents: [{ kind: 'electricity_bill', pages: bills.map((_, i) => i + 1) }],
      fields: {},
      lists: {
        bills: bills.map((b, i) => row({ document: i + 1, ...b })),
        powerLines: lines.flatMap((l) => l.powerLines),
        energyLines: lines.flatMap((l) => l.energyLines),
        otherLines: [],
        agreedPrices: [],
        services: [],
        priceChanges: [],
      },
      conflicts: [],
    },
    failedChecks,
    allowance: 'v1.quota.e2e',
  };
}

interface Payment {
  readonly checkout: Request[];
  readonly pass: Request[];
}

// The checkout and the pass, and Stripe sending the person back to `returnTo` once paid.
async function fakePayment(page: Page, returnTo: string): Promise<Payment> {
  const payment: Payment = { checkout: [], pass: [] };
  await page.route(API.checkout, (route) => {
    payment.checkout.push(route.request());
    return route.fulfill({ json: { code: 'ok', sessionId: 'cs_test_e2e', url: STRIPE } });
  });
  await page.route(API.pass, (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if ('pass' in body) return route.fulfill({ json: { code: 'ok', expiresAt, readsLeft: 15 } });
    payment.pass.push(route.request());
    return route.fulfill({ json: { code: 'ok', pass: PASS, expiresAt, readsLeft: 15 } });
  });
  await page.route('https://checkout.stripe.com/**', (route) =>
    route.fulfill({
      status: 302,
      headers: { location: `${ORIGIN}/${returnTo}?session_id=cs_test_e2e` },
    }),
  );
  return payment;
}

async function downloadOf(page: Page, button: Locator): Promise<string> {
  const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
  expect(
    readFileSync(await download.path())
      .subarray(0, 5)
      .toString(),
  ).toBe('%PDF-');
  return download.suggestedFilename();
}

async function fakeServices(page: Page, body: object): Promise<Request[]> {
  const sent: Request[] = [];
  await page.clock.setFixedTime(TODAY);
  await page.route('https://challenges.cloudflare.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.turnstile = { render(el, o) { setTimeout(() => o.callback(o.action + '-token')); return 'w'; }, remove() {} };`,
    }),
  );
  await page.route(API.extract, (route) => {
    sent.push(route.request());
    return route.fulfill({ json: body });
  });
  return sent;
}

async function upload(page: Page, files: readonly string[]) {
  await page.goto('facturas/luz/');
  await page.getByRole('button', { name: /^Sube una o varias facturas de la luz/ }).click();
  await expect(page.getByRole('heading', { name: 'Sube tus documentos' })).toBeFocused();
  await page.getByLabel('Elegir fotos o PDF').setInputFiles(files.map(photo));
  await page.getByLabel(/Doy mi consentimiento explícito/).check();
  await page.getByRole('button', { name: 'Leer los documentos' }).click();
}

const sheet = (page: Page, name: string) => page.getByRole('group', { name, exact: true });
const choose = (scope: Locator, question: string, answer: string) =>
  scope
    .getByRole('group', { name: question, exact: true })
    .getByLabel(answer, { exact: true })
    .check();
const notes = (page: Page) => page.locator('[data-done-notes] li');
const basket = (page: Page) => page.locator('[data-basket]');
const offer = (page: Page) => page.locator('[data-pass-offer]');

async function next(page: Page) {
  await fitsScreen(page, { whole: false });
  await (await forwardButton(page)).click();
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== 'running'),
  );
}

// What a bill read never says and only the person can: the answers asked on each sheet, by its
// name. Every other sheet holds what was read, and is only confirmed.
const PERSON: Readonly<Record<string, readonly (readonly [string, string])[]>> = {
  'Tu tarifa': [['¿Tu comercializadora es de referencia?', 'Sí']],
  'A nombre de quién está el contrato': [['Titular del contrato', 'Una persona']],
  'Bono social': [['¿Tienes descuento por bono social?', 'No']],
  'Tu contador': [['¿El contador es tuyo?', 'No']],
  'Otros servicios': [['¿Cuántos cobra?', 'Ninguno']],
  'Exceso de potencia': [['¿Te cobran exceso de potencia?', 'No']],
  'Penalización por baja': [['¿Te cobran una penalización por dejar el contrato?', 'No']],
  'Descuentos y regularizaciones': [['¿Regulariza facturas anteriores?', 'No']],
};

// Confirms the bill in the form sheet by sheet, answering what only the person can, up to its
// result.
async function confirmBill(page: Page) {
  const result = page.getByRole('heading', { name: 'Resultado', level: 2 });
  for (let i = 0; i < 40 && !(await result.isVisible()); i += 1) {
    const name = await page.locator('[data-sheet]:not([hidden]) .question').first().textContent();
    for (const [question, answer] of PERSON[name?.trim() ?? ''] ?? [])
      await choose(sheet(page, name?.trim() ?? ''), question, answer);
    await next(page);
  }
  await expect(result).toBeFocused();
}

test('a pack of three bills is reviewed one by one into the year, offered with its estimate', async ({
  page,
}) => {
  // Three bills confirmed sheet by sheet take close to the default timeout on a busy machine.
  test.slow();
  const sent = await fakeServices(page, pack([JULY, JUNE, AUGUST]));
  await upload(page, ['julio.png', 'junio.png', 'agosto.png']);
  await expectShownAndFocused(page.getByRole('heading', { name: 'Datos leídos' }));
  expect(sent[0]?.postDataJSON()).toMatchObject({
    review: 'electricity',
    captchaToken: 'extract-token',
  });
  await expect(page.getByText('Factura de la luz (3 páginas)')).toBeVisible();
  await expect(
    notes(page).filter({ hasText: /^Se han leído 3 facturas\. Se revisan de una en una/ }),
  ).toHaveCount(1);

  // The oldest first: June.
  await page.getByRole('button', { name: 'Revisar los datos' }).click();
  const supply = sheet(page, 'Tu suministro');
  await expect(supply.getByLabel('Código postal del suministro')).toHaveValue('28001');
  await expect(page.locator('[data-field="postcode"] > .read-mark')).toHaveText(
    'Leído del documento · confianza alta',
  );
  await confirmBill(page);
  await expect(page.locator('#resultado [data-total-counted]')).toHaveText('0,20 €');
  await expect(basket(page).locator('[data-basket-title]')).toHaveText(
    'Tu año: 1 factura revisada',
  );
  await expect(basket(page)).toContainText(
    'No guardamos nada: tu año vive solo en esta pestaña. Si la cierras o la recargas, vuelve a subir tus facturas.',
  );
  // One small difference is not worth the pass.
  await expect(offer(page)).toBeHidden();

  for (const [n, title] of [
    [2, 'Tu año: 2 facturas revisadas'],
    [1, 'Tu año: 3 facturas revisadas'],
  ] as const) {
    await basket(page)
      .getByRole('button', {
        name:
          n === 1
            ? 'Revisar la siguiente factura leída (queda 1)'
            : 'Revisar la siguiente factura leída (quedan 2)',
      })
      .click();
    await expect(sheet(page, 'Tu suministro')).toBeVisible();
    await confirmBill(page);
    await expect(basket(page).locator('[data-basket-title]')).toHaveText(title);
  }

  // The bill on screen counts its own 0,20 €; the year adds the three up, and the estimate stands
  // apart from that total.
  await expect(page.locator('#resultado [data-total-counted]')).toHaveText('0,20 €');
  await expect(basket(page).locator('[data-basket-bills] li')).toHaveText([
    'Factura del 31\u201105\u20112026 al 30\u201106\u20112026 · por encima de la norma: 0,20 €',
    'Factura del 30\u201106\u20112026 al 30\u201107\u20112026 · por encima de la norma: 0,20 €',
    'Factura del 30\u201107\u20112026 al 29\u201108\u20112026 · por encima de la norma: 0,20 €',
  ]);
  await expect(basket(page).locator('[data-basket-counted]')).toHaveText('0,60 €');
  await expect(basket(page).locator('[data-basket-recurring]')).toHaveText(
    'Se repite en más de una factura: Alquiler del contador.',
  );
  await expect(basket(page).locator('[data-basket-estimate]')).toHaveText(
    /^Estimación, no una cifra de tus facturas, y no se suma a ningún total: si lo que se repite \(Alquiler del contador\) siguiera igual, en un año serían unos 2\s€\.$/,
  );
  await expect(basket(page).getByRole('button', { name: /^Revisar la siguiente/ })).toBeHidden();

  await expect(offer(page)).toBeVisible();
  await expect(offer(page)).toContainText(
    'Revisa tu año entero: con un pase de 4,99 € revisas hasta ~15 lecturas durante 7 días, en cualquier sección.',
  );
  await expect(offer(page)).not.toContainText(/suscripción mensual|te avisaremos|recordatorio/i);
  await noSideScroll(page);
});

test('a bill sent twice is said and counts once', async ({ page }) => {
  await fakeServices(page, pack([JUNE, JUNE], ['duplicate_bill']));
  await upload(page, ['junio.png', 'junio-copia.png']);
  await expectShownAndFocused(page.getByRole('heading', { name: 'Datos leídos' }));
  await expect(
    notes(page).filter({
      hasText:
        'Has subido dos veces una factura del mismo suministro y periodo: en tu año cuenta una sola vez.',
    }),
  ).toHaveCount(1);
  await page.getByRole('button', { name: 'Revisar los datos' }).click();
  await confirmBill(page);
  await basket(page)
    .getByRole('button', { name: 'Revisar la siguiente factura leída (queda 1)' })
    .click();
  await confirmBill(page);

  await expect(basket(page).locator('[data-basket-title]')).toHaveText(
    'Tu año: 1 factura revisada',
  );
  await expect(basket(page).locator('[data-basket-bills] li')).toHaveText([
    'Factura del 31\u201105\u20112026 al 30\u201106\u20112026 · por encima de la norma: 0,20 €',
    'Factura del 31\u201105\u20112026 al 30\u201106\u20112026 · es la misma que otra de tu año (mismo suministro y periodo) y no cuenta dos veces.',
  ]);
  await expect(basket(page).locator('[data-basket-year]')).toBeHidden();
  await expect(offer(page)).toBeHidden();

  // Another bill starts on the start sheet, with the year kept.
  await basket(page).getByRole('button', { name: 'Añadir otra factura' }).click();
  await expect(page.getByRole('heading', { name: '¿Cómo quieres empezar?' })).toBeFocused();
  await expect(page.locator('#resultado')).toBeHidden();
  await page.getByRole('button', { name: /Rellenar a mano/ }).click();
  await expect(sheet(page, 'Tu suministro').getByLabel('Código postal del suministro')).toHaveValue(
    '',
  );
  await expect(page.locator('[data-read-mark]')).toHaveCount(0);
});

test('pages that are no electricity document are said, and the read counts for nothing', async ({
  page,
}) => {
  await fakeServices(page, {
    code: 'nothing_read',
    pages: [
      {
        page: 1,
        kind: 'other',
        readability: { value: 'not_electricity_document', confidence: 'high' },
      },
    ],
  });
  await upload(page, ['nomina-ficticia.png']);
  await expect(
    page.getByText('nomina-ficticia.png: no parece un documento de la luz.'),
  ).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator('[data-doc-files] li')).toHaveCount(1);
  await expect(page.locator('#electricity')).toBeHidden();
  await expect(basket(page)).toBeHidden();
});

test('a year of three bills goes to the payment and comes back whole, with its report and letter', async ({
  page,
}) => {
  // Three bills confirmed sheet by sheet take close to the default timeout on a busy machine.
  test.slow();
  await fakeServices(page, pack([JUNE, JULY, AUGUST]));
  const payment = await fakePayment(page, 'facturas/luz/');
  await upload(page, ['junio.png', 'julio.png', 'agosto.png']);
  await expectShownAndFocused(page.getByRole('heading', { name: 'Datos leídos' }));
  await page.getByRole('button', { name: 'Revisar los datos' }).click();
  await confirmBill(page);
  for (const left of ['quedan 2', 'queda 1']) {
    await basket(page)
      .getByRole('button', { name: `Revisar la siguiente factura leída (${left})` })
      .click();
    await confirmBill(page);
  }
  const bills = [
    'Factura del 31\u201105\u20112026 al 30\u201106\u20112026 · por encima de la norma: 0,20 €',
    'Factura del 30\u201106\u20112026 al 30\u201107\u20112026 · por encima de la norma: 0,20 €',
    'Factura del 30\u201107\u20112026 al 29\u201108\u20112026 · por encima de la norma: 0,20 €',
  ];
  await expect(basket(page).locator('[data-basket-bills] li')).toHaveText(bills);
  await expect(basket(page)).toContainText(
    'Si pagas, las facturas que ya has revisado esperan en esta pestaña mientras estás en la página de pago y vuelven todas contigo',
  );
  const letter = offer(page).getByRole('button', {
    name: 'Descargar la carta que pide la factura rectificativa (PDF)',
  });
  await expect(letter).toBeHidden();

  await offer(page)
    .getByLabel(/Quiero el informe ahora/)
    .check();
  await offer(page).getByRole('button', { name: 'Pagar 4,99 €' }).click();
  await expect(letter).toBeVisible();
  expect(payment.checkout).toHaveLength(1);
  expect(payment.checkout[0]?.postDataJSON()).toMatchObject({ returnTo: 'electricity' });
  expect(payment.pass).toHaveLength(1);
  expect(page.url()).not.toContain('session_id');

  // Every bill of the year is reviewed again on return, with the year added up as before; nothing
  // waits in the session any more.
  await expect(basket(page).locator('[data-basket-title]')).toHaveText(
    'Tu año: 3 facturas revisadas',
  );
  await expect(basket(page).locator('[data-basket-bills] li')).toHaveText(bills);
  await expect(basket(page).locator('[data-basket-counted]')).toHaveText('0,60 €');
  await expect(page.locator('#resultado [data-total-counted]')).toHaveText('0,20 €');
  expect(await page.evaluate(() => sessionStorage.length)).toBe(0);

  expect(
    await downloadOf(page, offer(page).getByRole('button', { name: 'Descargar el informe (PDF)' })),
  ).toBe('eslojusto-informe-facturas-luz.pdf');
  await offer(page)
    .getByLabel('Comercializadora', { exact: true })
    .fill('Comercializadora Ficticia');
  await offer(page).getByLabel('Número de contrato', { exact: true }).fill('CT-0000-TEST');
  expect(await downloadOf(page, letter)).toBe('eslojusto-carta-factura-rectificativa.pdf');
  await noSideScroll(page);
});

// A change of conditions notified on 01-02-2026 and an exit asked for on 20-02-2026, within the
// month, keeping a handset worth 300 €, with 250 € charged: within its whole value, over its share
// of the commitment left. The answers wait in the session as they do for the trip to Stripe.
const EXIT_AFTER_CHANGE = [
  ['hasCommitment', 'yes'],
  ['startedOn', '2025-03-01'],
  ['months', '18'],
  ['agreedPenalty', '180'],
  ['exitRequestedOn', '2026-02-20'],
  ['change', 'notice'],
  ['sentOn', '2026-02-01'],
  ['appliesOn', '2026-03-10'],
  ['changeKind', 'price_up'],
  ['priceIndex', 'none'],
  ['hasHandset', 'yes'],
  ['handsetValue', '300'],
  ['handsetKept', 'yes'],
  ['penaltyCharged', '250'],
  ['chargedAfter', 'no'],
] as const;

test('the letter about leaving after a change of conditions downloads free, with nothing sent', async ({
  page,
}) => {
  await page.clock.setFixedTime(TODAY);
  const outside: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith(ORIGIN)) outside.push(r.url());
  });
  await page.setViewportSize({ width: 360, height: 640 });
  await page.addInitScript(
    ([key, value]) => {
      if (sessionStorage.getItem('e2e-seeded') === null) {
        sessionStorage.setItem(key, value);
        sessionStorage.setItem('e2e-seeded', '1');
      }
    },
    ['eslojusto-revision-permanencia-en-pago', JSON.stringify(EXIT_AFTER_CHANGE)] as const,
  );
  await page.goto('facturas/permanencia/');
  await expect(page.getByRole('heading', { name: 'Resultado', level: 2 })).toBeVisible();
  await expect(
    offer(page).getByRole('heading', { name: 'Carta que puedes descargar gratis' }),
  ).toBeVisible();
  await expect(offer(page).getByRole('button', { name: 'Pagar 4,99 €' })).toBeHidden();
  await expect(
    offer(page).getByRole('button', {
      name: 'Descargar la carta que pide revisar la penalización (PDF)',
    }),
  ).toBeHidden();
  await offer(page).getByLabel('Operador', { exact: true }).fill('Operador Ficticio, S.A.');
  await noSideScroll(page);
  expect(
    await downloadOf(
      page,
      offer(page).getByRole('button', {
        name: 'Descargar la carta sobre la baja tras un cambio de condiciones (PDF, gratis)',
      }),
    ),
  ).toBe('eslojusto-carta-baja-cambio-condiciones.pdf');
  expect(outside).toEqual([]);
});

test('the telecom page reads the contract into its sheets', async ({ page }) => {
  const contract = (value: Value) => ({ value, confidence: 'high', source: 'telecom_contract' });
  const sent = await fakeServices(page, {
    code: 'ok',
    extraction: {
      pages: [{ ...readPage(1), kind: 'telecom_contract' }],
      documents: [{ kind: 'telecom_contract', pages: [1] }],
      fields: {
        commitmentStartsOn: contract('2025-03-01'),
        commitmentMonths: contract(18),
        agreedPenalty: contract(180),
      },
      lists: { bills: [], lines: [] },
      conflicts: [],
    },
    failedChecks: [],
    allowance: 'v1.quota.e2e',
  });
  await page.goto('facturas/permanencia/');
  await page.getByRole('button', { name: /^Sube tu contrato y, si las tienes/ }).click();
  await page.getByLabel('Elegir fotos o PDF').setInputFiles([photo('contrato.png')]);
  await page.getByLabel(/Doy mi consentimiento explícito/).check();
  await page.getByRole('button', { name: 'Leer los documentos' }).click();
  await expectShownAndFocused(page.getByRole('heading', { name: 'Datos leídos' }));
  expect(sent[0]?.postDataJSON()).toMatchObject({ review: 'telecom' });
  await page.getByRole('button', { name: 'Revisar los datos' }).click();
  const commitment = sheet(page, 'Tu permanencia');
  await expect(commitment.getByLabel('Sí', { exact: true })).toBeChecked();
  await expect(commitment.getByLabel('Inicio')).toHaveValue('2025-03-01');
  await expect(commitment.getByLabel('Meses')).toHaveValue('18');
});

test('the telecom page lists every charge of the bills read, before any question on the exit', async ({
  page,
}) => {
  const bill = (values: Record<string, Value>) => ({
    values,
    confidence: 'high',
    source: 'telecom_bill',
  });
  await fakeServices(page, {
    code: 'ok',
    extraction: {
      pages: [{ ...readPage(1), kind: 'telecom_bill' }],
      documents: [{ kind: 'telecom_bill', pages: [1] }],
      fields: {},
      lists: {
        bills: [
          bill({
            document: 1,
            operatorName: 'Operador Ficticio',
            issuedOn: '2026-09-22',
            periodFrom: '2026-09-01',
            periodTo: '2026-09-30',
            total: 28.44,
          }),
        ],
        lines: [
          bill({ document: 1, concept: 'Tarifa Ficticia 50', kind: 'fixed_fee', amount: 23.14 }),
          bill({ document: 1, concept: 'Servicio Ficticio Plus', kind: 'fixed_fee', amount: 2.99 }),
          bill({ document: 1, concept: 'Mensajes a 79xx', kind: 'premium_rate', amount: 1.45 }),
          bill({ document: 1, concept: 'Club de juegos', kind: 'third_party', amount: 3.99 }),
          bill({
            document: 1,
            concept: 'Descuento de bienvenida',
            kind: 'discount',
            from: '2025-09-30',
            to: '2026-09-30',
            amount: 4.13,
          }),
        ],
      },
      conflicts: [],
    },
    failedChecks: [],
    allowance: 'v1.quota.e2e',
  });
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto('facturas/permanencia/');
  await page.getByRole('button', { name: /^Sube tu contrato y, si las tienes/ }).click();
  await page.getByLabel('Elegir fotos o PDF').setInputFiles([photo('factura.png')]);
  await page.getByLabel(/Doy mi consentimiento explícito/).check();
  await page.getByRole('button', { name: 'Leer los documentos' }).click();
  await expectShownAndFocused(page.getByRole('heading', { name: 'Datos leídos' }));

  const charges = page.getByRole('region', { name: 'Lo que te cobran' });
  await expect(charges).toBeVisible();
  await expect(
    charges.getByRole('heading', { name: 'Factura del 22-09-2026 · Operador Ficticio' }),
  ).toBeVisible();
  const lines = charges.locator('[data-bill-groups] li');
  await expect(lines).toHaveText([
    /^Tarifa Ficticia 50\s*23,14 €$/,
    /^Servicio Ficticio Plus\s*2,99 €$/,
    /^Mensajes a 79xx\s*Extra\s*1,45 €$/,
    /^Club de juegos\s*Extra\s*3,99 €$/,
    /^Descuento de bienvenida\s*Del 30-09-2025 al 30-09-2026\s*−4,13 €$/,
  ]);
  await expect(charges).toContainText('comprueba que reconoces cada cuota');
  await expect(charges).toContainText('Si no lo contrataste tú, pregunta a tu compañía.');
  await expect(charges.getByRole('listitem').filter({ hasText: 'terminó' })).toHaveText(
    'Descuento de bienvenida: terminó el 30-09-2026. Desde el día siguiente, tu factura es 4,13 € más alta, sin contar el IVA.',
  );
  await expect(charges.getByRole('heading', { name: 'Lo que dice la norma' })).toBeVisible();
  await expect(charges).toContainText('desconecte los servicios de tarificación adicional');
  await expect(
    charges.getByRole('link', { name: /Real Decreto 899\/2009, art\. 24/ }),
  ).toHaveAttribute('href', 'https://www.boe.es/buscar/act.php?id=BOE-A-2009-8961#a24');
  await expect(charges).toContainText('Si no pediste un servicio, la ley no permite cobrártelo');
  await expect(charges.getByRole('link', { name: /art\. 66 quáter\.1/ })).toHaveAttribute(
    'href',
    'https://www.boe.es/buscar/act.php?id=BOE-A-2007-20555#a66quater',
  );
  await noSideScroll(page);

  await page.getByRole('button', { name: 'Revisar los datos' }).click();
  await expect(charges).toBeHidden();
});
