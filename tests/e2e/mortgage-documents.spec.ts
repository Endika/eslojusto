import { test, expect, type Locator, type Page, type Request } from '@playwright/test';
import { syntheticPhoto } from '../support/synthetic-photo';
import { fitsScreen } from '../support/sheets';
import { expectShownAndFocused } from '../support/reads';

// Runs only against a TEST_DOCUMENTS=1 build, which has /hipoteca/ too: every request to the fake
// API and to Turnstile is answered here. The deed, the invoices and every figure are synthetic.

const API = { extract: 'https://extract.api.eslojusto.test/' };
const TODAY = new Date('2026-10-10T12:00:00');

const PHOTO = syntheticPhoto();
const photo = (name: string) => ({ name, mimeType: 'image/png', buffer: PHOTO });

type Confidence = 'high' | 'medium' | 'low';
type Value = string | number | boolean;
const from = (source: string, value: Value, confidence: Confidence = 'high') => ({
  value,
  confidence,
  source,
});
const readPage = (n: number, kind: string, readability = 'ok') => ({
  page: n,
  kind,
  document: n,
  readability: { value: readability, confidence: 'high' },
  confidence: 'high',
});
const row = (source: string, values: Record<string, Value>, confidence: Confidence = 'high') => ({
  values,
  confidence,
  source,
});

const DEED = 'mortgage_deed';
const EXPENSES =
  'Serán de cuenta exclusiva de la parte prestataria todos los gastos de notaría, registro, gestoría, tasación e impuestos que se deriven de esta escritura.';
const FLOOR =
  'El tipo de interés aplicable nunca podrá ser inferior al 3,00 % nominal anual, cualquiera que sea la variación del índice de referencia.';
const INDEX =
  'El tipo de interés se revisará cada año tomando como referencia el Euríbor a un año más un diferencial de 1,50 puntos.';
const clause = (label: string, text: string, page: number) => row(DEED, { label, text, page });

const DEED_FIELDS = {
  deedOn: from(DEED, '2014-03-20'),
  lenderName: from(DEED, 'Banco Ficticio, S.A.'),
  borrowerType: from(DEED, 'individual'),
  purpose: from(DEED, 'housing'),
  loanKind: from(DEED, 'standard'),
  principal: from(DEED, 150_000),
  rateType: from(DEED, 'variable'),
  index: from(DEED, 'euribor'),
  rateRevisionMonths: from(DEED, 12),
  floorPercent: from(DEED, 3),
  defaultRate: from(DEED, 18, 'medium'),
  earlyTerminationInstalments: from(DEED, 3),
  openingFee: from(DEED, 1_500),
  otherSetUpFee: from(DEED, false),
};
const NO_LISTS = {
  clauses: [],
  notaryInvoices: [],
  registryInvoices: [],
  agencyInvoices: [],
  agencySupplied: [],
  valuationInvoices: [],
  ajdForms: [],
  operations: [],
};

// Consecutive pages of one kind are one document, as the API groups them.
function documentsOf(kinds: readonly string[]) {
  const documents: { kind: string; pages: number[] }[] = [];
  kinds.forEach((kind, i) => {
    const last = documents.at(-1);
    if (last?.kind === kind) last.pages.push(i + 1);
    else documents.push({ kind, pages: [i + 1] });
  });
  return documents;
}

// A read of `kinds`, one page each, with what it states, its lists and the API's checks.
function reading(
  kinds: readonly string[],
  fields: object,
  lists: Partial<typeof NO_LISTS> | Record<string, readonly object[]>,
  failedChecks: readonly string[] = [],
) {
  return {
    code: 'ok',
    extraction: {
      pages: kinds.map((kind, i) => readPage(i + 1, kind)),
      documents: documentsOf(kinds),
      fields,
      lists: { ...NO_LISTS, ...lists },
      conflicts: [],
    },
    failedChecks,
    allowance: 'v1.quota.e2e',
  };
}

// The first page, the financial clauses and every invoice of the deed's day.
const PACK = reading(
  [
    DEED,
    DEED,
    'notary_invoice',
    'registry_invoice',
    'agency_invoice_mortgage',
    'valuation_invoice',
    'ajd_form',
  ],
  DEED_FIELDS,
  {
    clauses: [
      clause('floor_clause', FLOOR, 2),
      clause('euribor', INDEX, 2),
      clause('default_interest', 'El interés de demora será del 18 % nominal anual.', 2),
      clause(
        'early_termination',
        'El banco podrá dar por vencido el préstamo si se impagan 3 cuotas.',
        2,
      ),
      clause('opening_fee', 'Comisión de apertura: 1.500 euros, de una sola vez.', 2),
      clause('expenses_clause', EXPENSES, 2),
    ],
    notaryInvoices: [
      row('notary_invoice', {
        concept: 'loan',
        mixed: false,
        base: 595.45,
        vat: 125.05,
        total: 720.5,
      }),
    ],
    registryInvoices: [
      row('registry_invoice', {
        concept: 'mortgage',
        mixed: false,
        base: 338.84,
        vat: 71.16,
        total: 410,
      }),
    ],
    agencyInvoices: [row('agency_invoice_mortgage', { fee: 300, vat: 63, total: 363 })],
    valuationInvoices: [row('valuation_invoice', { base: 250, vat: 52.5, total: 302.5 })],
    ajdForms: [row('ajd_form', { concept: 'loan', amountPaid: 1_125, paidByLender: false })],
  },
);

// Only the first page and the floor's: the page of the expenses clause was never sent.
const WITHOUT_EXPENSES = reading(
  [DEED, DEED],
  DEED_FIELDS,
  { clauses: [clause('floor_clause', FLOOR, 2)] },
  ['missing_key_page'],
);

// A notary invoice that bills the purchase and the loan in one amount.
const MIXED = reading(
  ['notary_invoice'],
  {},
  {
    notaryInvoices: [
      row('notary_invoice', {
        concept: 'purchase',
        mixed: true,
        base: 1_223.14,
        vat: 256.86,
        total: 1_480,
      }),
    ],
  },
  ['invoice_mixes_purchase_and_loan'],
);

const nothingRead = (readability: string) => ({
  code: 'nothing_read',
  pages: [{ page: 1, kind: 'other', readability: { value: readability, confidence: 'high' } }],
});

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

const openUpload = async (page: Page) => {
  await page.goto('hipoteca/');
  await page.getByRole('button', { name: /^Sube las páginas útiles de tu escritura/ }).click();
  await expect(page.getByRole('heading', { name: 'Sube tus documentos' })).toBeFocused();
};

async function upload(page: Page, files: readonly string[]) {
  await openUpload(page);
  await page.getByLabel('Elegir fotos o PDF').setInputFiles(files.map(photo));
  await page.getByLabel(/Doy mi consentimiento explícito/).check();
  await page.getByRole('button', { name: 'Leer los documentos' }).click();
}

const sheet = (page: Page, name: string) => page.getByRole('group', { name, exact: true });
const group = (scope: Locator, question: string) =>
  scope.getByRole('group', { name: question, exact: true });
const choose = (scope: Locator, question: string, answer: string) =>
  group(scope, question).getByLabel(answer, { exact: true }).check();
const markOf = (page: Page, field: string) => page.locator(`[data-field="${field}"] > .read-mark`);
const notes = (page: Page) => page.locator('[data-done-notes] li');

// Moves on with whichever button the sheet shows, and waits out the page turn.
async function next(page: Page) {
  await fitsScreen(page, { whole: false });
  const review = page.getByRole('button', { name: 'Revisar', exact: true });
  if (await review.isVisible()) await review.click();
  else await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== 'running'),
  );
}

// The clause read under a question, opened: its label, then its words.
async function quoteOf(scope: Locator, field: string, label: string): Promise<Locator> {
  const quote = scope.locator(`[data-read-quote="${field}"]`);
  await expect(quote.locator('blockquote')).toBeHidden();
  await quote.getByText(label, { exact: true }).click();
  return quote.locator('blockquote');
}

test('the upload says which pages of a long deed to send and how to tell them', async ({
  page,
}) => {
  await page.goto('hipoteca/');
  await expect(page.getByRole('heading', { name: '¿Cómo quieres empezar?' })).toBeVisible();
  await expect(page.locator('#mortgage')).toBeHidden();
  await openUpload(page);
  const guide = page.getByRole('figure', {
    name: 'Tu escritura puede tener 25-60 páginas. Sube la primera, las de cláusulas financieras (intereses, comisiones, gastos, demora, vencimiento) y tus facturas.',
  });
  await expect(guide).toBeVisible();
  await expect(guide.locator('li')).toHaveText([
    /^La primera página.*nombre del notario\.$/,
    /^Las cláusulas financieras.*«Vencimiento anticipado»\.$/,
    /^Tus facturas.*si los tienes\.$/,
  ]);
  // The count of what fits in one read is the one every review shows.
  await page.getByLabel('Elegir fotos o PDF').setInputFiles([photo('escritura-p1.png')]);
  await expect(page.getByText('Añadido: escritura-p1.png. Llevas 1 de 25.')).toBeVisible();
});

test('a full pack fills every sheet, each clause shown word for word to be confirmed', async ({
  page,
}) => {
  const sent = await fakeServices(page, PACK);
  await upload(page, [
    'escritura-p1.png',
    'escritura-p12.png',
    'factura-notaria.png',
    'factura-registro.png',
    'factura-gestoria.png',
    'factura-tasacion.png',
    'modelo-600.png',
  ]);
  await expectShownAndFocused(page.getByRole('heading', { name: 'Datos leídos' }));
  expect(sent[0]?.postDataJSON()).toMatchObject({
    review: 'mortgage',
    captchaToken: 'extract-token',
  });
  await expect(
    page.getByText(
      'Escritura del préstamo hipotecario (2 páginas) · Factura de la notaría · Factura del registro · Factura de la gestoría · Factura de la tasación · Impuesto del préstamo o de la compra (modelo 600)',
    ),
  ).toBeVisible();
  await expect(
    notes(page).filter({
      hasText:
        'Cláusulas encontradas en tu escritura: tipo mínimo (cláusula suelo), índice Euríbor, interés de demora, vencimiento anticipado, comisión de apertura, gastos.',
    }),
  ).toHaveCount(1);
  await expect(notes(page).filter({ hasText: /^Cada factura leída se ha pasado/ })).toHaveCount(1);
  await expect(notes(page).filter({ hasText: /^No se ha encontrado/ })).toHaveCount(0);

  await page.getByRole('button', { name: 'Revisar los datos' }).click();
  await expect(page.getByRole('heading', { name: 'Tu hipoteca', level: 2 })).toBeFocused();
  await expect(sheet(page, 'Tu hipoteca').getByLabel('Hipoteca sobre una vivienda')).toBeChecked();
  await next(page);
  await expect(sheet(page, 'Quién y sobre qué').getByLabel('Yo, como persona')).toBeChecked();
  await next(page);
  const deed = sheet(page, 'La escritura');
  await expect(deed.getByLabel('Fecha de la escritura')).toHaveValue('2014-03-20');
  await expect(deed.getByLabel('Capital del préstamo')).toHaveValue('150.000,00');
  // Whether it was a consumer's loan is the person's to say.
  await choose(deed, '¿Pediste la hipoteca como particular, para tu casa?', 'Sí');
  await next(page);
  await expect(sheet(page, 'El tipo de interés').getByLabel('Variable')).toBeChecked();
  await next(page);

  const expenses = sheet(page, 'La cláusula de gastos');
  await expect(expenses.getByLabel('Sí, la tiene')).toBeChecked();
  await expect(markOf(page, 'expensesClause')).toHaveText('Leído del documento · confianza alta');
  await expect(
    await quoteOf(expenses, 'expensesClause', 'Lo que dice tu escritura sobre los gastos'),
  ).toHaveText(EXPENSES);
  await next(page);
  const floor = sheet(page, 'La cláusula suelo');
  await expect(floor.getByLabel('Sí', { exact: true })).toBeChecked();
  await expect(floor.getByLabel('Tipo mínimo que fija')).toHaveValue('3');
  await expect(
    await quoteOf(floor, 'floor', 'Lo que dice tu escritura sobre el tipo mínimo'),
  ).toHaveText(FLOOR);
  await next(page);
  // The Euríbor clause answers nothing: it is there to answer by.
  const index = sheet(page, 'El índice');
  await expect(await quoteOf(index, 'irph', 'Lo que dice tu escritura sobre el índice')).toHaveText(
    INDEX,
  );
  await choose(index, '¿El tipo variable se calcula con el IRPH?', 'No');
  await next(page);
  const late = sheet(page, 'La demora');
  await expect(late.getByLabel('Interés de demora')).toHaveValue('18');
  await expect(markOf(page, 'defaultInterest')).toHaveText('Leído del documento · confianza alta');
  await next(page);
  await expect(
    sheet(page, 'El vencimiento anticipado').getByLabel('Cuotas impagadas que pide la escritura'),
  ).toHaveValue('3');
  await next(page);
  const opening = sheet(page, 'La comisión de apertura');
  await expect(opening.getByLabel('Comisión de apertura')).toHaveValue('1.500,00');
  await expect(
    group(opening, '¿Y por estudio o tramitación?').getByLabel('No', { exact: true }),
  ).toBeChecked();
  await next(page);
  const other = sheet(page, 'Otras cláusulas');
  await choose(other, '¿El tipo se redondea al alza, por ejemplo al cuarto de punto?', 'No');
  await choose(
    other,
    '¿La escritura te pide contratar un seguro u otro producto con el banco?',
    'No',
  );
  await next(page);

  await expect(
    group(
      sheet(page, 'Tus facturas'),
      '¿Tienes las facturas o los importes de los gastos de la hipoteca?',
    ).getByLabel('Sí'),
  ).toBeChecked();
  await next(page);
  await expect(sheet(page, 'La notaría').getByLabel('Notaría del préstamo')).toHaveValue('720,50');
  await next(page);
  await expect(sheet(page, 'El registro').getByLabel('Registro de la hipoteca')).toHaveValue(
    '410,00',
  );
  await next(page);
  await expect(sheet(page, 'La gestoría').getByLabel('Gestoría', { exact: true })).toHaveValue(
    '363,00',
  );
  await next(page);
  await expect(sheet(page, 'La tasación y el acta').getByLabel('Tasación')).toHaveValue('302,50');
  await next(page);
  await expect(
    sheet(page, 'El impuesto').getByLabel('Impuesto del préstamo (actos jurídicos documentados)'),
  ).toHaveValue('1.125,00');
  await next(page);
  await next(page);
  await choose(
    sheet(page, 'Lo que ya hubo'),
    '¿Llegaste a un acuerdo con el banco sobre estos gastos?',
    'No',
  );
  await next(page);
  await choose(
    sheet(page, 'Amortizaciones y cambios'),
    '¿Has amortizado antes de tiempo o cambiado tu hipoteca?',
    'No',
  );
  // Nothing is reviewed until every sheet is confirmed.
  await expect(page.locator('#resultado [data-item]')).toHaveCount(0);
  await next(page);
  await expect(page.getByRole('heading', { name: 'Resultado', level: 2 })).toBeFocused();
  await expect(page.locator('#resultado [data-item]').first()).toBeVisible();
});

test('a deed without the expenses page names the page missing and how to tell it', async ({
  page,
}) => {
  await fakeServices(page, WITHOUT_EXPENSES);
  await upload(page, ['escritura-p1.png', 'escritura-p12.png']);
  await expectShownAndFocused(page.getByRole('heading', { name: 'Datos leídos' }));
  await expect(
    notes(page).filter({
      hasText:
        'No se ha encontrado la cláusula de gastos de tu escritura. Si tu escritura la tiene, puede que esa página no esté entre las que has subido: suele estar entre las cláusulas financieras, con un título como «Gastos», y dice quién paga la notaría, el registro, la gestoría, la tasación y los impuestos. Puedes añadirla con «Subir más documentos».',
    }),
  ).toHaveCount(1);
  await page.getByRole('button', { name: 'Revisar los datos' }).click();
  // Its answer stays the person's: the clause may not exist.
  for (let i = 0; i < 4; i += 1) {
    if (i === 2)
      await choose(
        sheet(page, 'La escritura'),
        '¿Pediste la hipoteca como particular, para tu casa?',
        'Sí',
      );
    await next(page);
  }
  const expenses = sheet(page, 'La cláusula de gastos');
  await expect(expenses).toBeVisible();
  for (const answer of ['Sí, la tiene', 'No la tiene', 'No lo sé'])
    await expect(expenses.getByLabel(answer)).not.toBeChecked();
  await expect(expenses.locator('[data-read-quote]')).toHaveCount(0);
});

test('an invoice that bills the purchase and the loan together is marked as such', async ({
  page,
}) => {
  await fakeServices(page, MIXED);
  await upload(page, ['factura-notaria.png']);
  await expectShownAndFocused(page.getByRole('heading', { name: 'Datos leídos' }));
  await expect(
    notes(page).filter({
      hasText:
        'Una factura de notaría o de registro cobra juntas la compraventa y la hipoteca, sin separarlas: está marcada así en su hoja, y la revisión no le pone cifra.',
    }),
  ).toHaveCount(1);
  await page.getByRole('button', { name: 'Revisar los datos' }).click();
  await expect(page.getByRole('heading', { name: 'Tu hipoteca', level: 2 })).toBeFocused();
  // The invoice sheets open once the door's answers are given; the read gave the rest.
  const form = page.locator('#mortgage');
  await expect(form.locator('[name="notaryLoan"]')).toHaveValue('1.480,00');
  await expect(form.locator('[name="hasInvoices"][value="yes"]')).toBeChecked();
  await expect(form.locator('[name="notaryMixed"][value="yes"]')).toBeChecked();
  await expect(markOf(page, 'notaryMixed')).toHaveText('Leído del documento · confianza alta');
});

test('pages that are no mortgage document are said, and the read counts for nothing', async ({
  page,
}) => {
  await fakeServices(page, nothingRead('not_mortgage_document'));
  await upload(page, ['nomina-ficticia.png']);
  await expect(
    page.getByText('nomina-ficticia.png: no parece un documento de la hipoteca.'),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#mortgage')).toBeHidden();
});

test('a read with nothing for the review keeps the files to change them', async ({ page }) => {
  await fakeServices(page, nothingRead('ok'));
  await upload(page, ['escritura-p30.png']);
  await expect(
    page.getByText('escritura-p30.png: no trae datos que use esta revisión.'),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-doc-files] li')).toHaveCount(1);
  await expect(page.locator('#mortgage')).toBeHidden();
});
