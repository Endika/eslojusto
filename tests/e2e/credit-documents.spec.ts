import { test, expect, type Page, type Request } from '@playwright/test';
import { syntheticPhoto } from '../support/synthetic-photo';
import { fitsScreen, nextSheet as next } from '../support/sheets';
import { expectShownAndFocused } from '../support/reads';

// Runs only against a TEST_DOCUMENTS=1 build, which has /financiacion/ too: every request to the
// fake API and to Turnstile is answered here. The documents and figures are synthetic.

const API = { extract: 'https://extract.api.eslojusto.test/' };
const TODAY = new Date('2026-10-09T12:00:00');

const PHOTO = syntheticPhoto();
const photo = (name: string) => ({ name, mimeType: 'image/png', buffer: PHOTO });

type Confidence = 'high' | 'medium' | 'low';
const from = (
  source: string,
  value: string | number | boolean,
  confidence: Confidence = 'high',
) => ({ value, confidence, source });
const readPage = (n: number, kind: string, readability = 'ok') => ({
  page: n,
  kind,
  document: n,
  readability: { value: readability, confidence: 'high' },
  confidence: 'high',
});

const CONTRACT = 'credit_agreement';
const STATEMENT = 'early_repayment_statement';

// A whole synthetic car loan: the contract, the information given before it, which states another
// APR, and the statement of an early repayment.
const PACK = {
  code: 'ok',
  extraction: {
    pages: [readPage(1, CONTRACT), readPage(2, 'credit_precontract_info'), readPage(3, STATEMENT)],
    documents: [
      { kind: CONTRACT, pages: [1] },
      { kind: 'credit_precontract_info', pages: [2] },
      { kind: STATEMENT, pages: [3] },
    ],
    fields: {
      product: from(CONTRACT, 'car_loan'),
      lenderName: from(CONTRACT, 'Financiera Ficticia, S.A.'),
      agreedOn: from(CONTRACT, '2024-03-01'),
      principal: from(CONTRACT, 15_000),
      nominalRate: from(CONTRACT, 7.99),
      rateType: from(CONTRACT, 'fixed'),
      declaredApr: from(CONTRACT, 9.5),
      instalmentCount: from(CONTRACT, 48),
      instalmentAmount: from(CONTRACT, 230),
      firstDueOn: from(CONTRACT, '2024-04-01'),
      balloonAmount: from(CONTRACT, 6_000),
      balloonDueOn: from(CONTRACT, '2028-03-01'),
      insurancePremium: from(CONTRACT, 600),
      insuranceSingle: from(CONTRACT, true),
      insuranceFinanced: from(CONTRACT, true),
      insuranceRequired: from(CONTRACT, true, 'medium'),
      earlyRepaymentClauseText: from(
        CONTRACT,
        'En caso de reembolso anticipado, el prestamista tendrá derecho a una compensación del 1 % del importe reembolsado.',
      ),
      repaidOn: from(STATEMENT, '2026-06-15'),
      principalRepaid: from(STATEMENT, 8_000),
      compensationCharged: from(STATEMENT, 80),
      agreedEndOn: from(STATEMENT, '2028-03-01'),
      paidByInsurance: from(STATEMENT, false),
      discountLost: from(STATEMENT, true, 'medium'),
    },
    lists: {
      charges: [
        {
          values: {
            kind: 'opening',
            concept: 'Comisión de apertura',
            amount: 300,
            how: 'deducted',
          },
          confidence: 'high',
          source: CONTRACT,
        },
      ],
      schedule: [],
      statements: [],
    },
    conflicts: [{ field: 'declaredApr', sources: [CONTRACT, 'credit_precontract_info'] }],
  },
  failedChecks: [],
  allowance: 'v1.quota.e2e',
};

// The car loan pack again, its clauses as long as the API ever gives them.
const LONG = 'El prestatario podrá reembolsar anticipadamente todo o parte del préstamo. '.repeat(
  8,
);
const LONG_PACK = {
  ...PACK,
  extraction: {
    ...PACK.extraction,
    fields: {
      ...PACK.extraction.fields,
      earlyRepaymentClauseText: from(CONTRACT, LONG.slice(0, 600)),
      withdrawalClauseText: from(CONTRACT, LONG.slice(0, 600)),
    },
  },
};

// A read of `kinds`, one page each, with what it states and the schedule's rows.
function reading(kinds: readonly string[], fields: object, schedule: readonly object[] = []) {
  return {
    code: 'ok',
    extraction: {
      pages: kinds.map((kind, i) => readPage(i + 1, kind)),
      documents: kinds.map((kind, i) => ({ kind, pages: [i + 1] })),
      fields,
      lists: { charges: [], schedule, statements: [] },
      conflicts: [],
    },
    failedChecks: [],
    allowance: 'v1.quota.e2e',
  };
}

async function fakeServices(
  page: Page,
  extract: { status: number; body: object } | readonly object[] = { status: 200, body: PACK },
): Promise<Request[]> {
  // A list answers each read with the next body, in order.
  const queue = Array.isArray(extract) ? [...extract] : null;
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
    if (queue) return route.fulfill({ json: queue.shift() });
    const { status, body } = extract as { status: number; body: object };
    return route.fulfill({ status, json: body });
  });
  return sent;
}

async function upload(page: Page, files: readonly string[]) {
  await page.goto('financiacion/');
  await page.getByRole('button', { name: /^Sube tu contrato y, si los tienes/ }).click();
  await expect(page.getByRole('heading', { name: 'Sube tus documentos' })).toBeFocused();
  await page.getByLabel('Elegir fotos o PDF').setInputFiles(files.map(photo));
  await page.getByLabel(/Doy mi consentimiento explícito/).check();
  await page.getByRole('button', { name: 'Leer los documentos' }).click();
}

const sheet = (page: Page, name: string) => page.getByRole('group', { name, exact: true });
const markOf = (page: Page, field: string) => page.locator(`[data-field="${field}"] > .read-mark`);
const group = (page: Page, sheetName: string, question: string) =>
  sheet(page, sheetName).getByRole('group', { name: question, exact: true });

test('the page opens on the choice between reading documents and typing', async ({ page }) => {
  await page.goto('financiacion/');
  await expect(page.getByRole('heading', { name: '¿Cómo quieres empezar?' })).toBeVisible();
  await expect(page.locator('#credit')).toBeHidden();
  // The pass and the letters wait for a review.
  await expect(page.locator('[data-pass-offer]')).toBeHidden();
  await page.getByRole('button', { name: /Rellenar a mano/ }).click();
  await expect(page.getByRole('heading', { name: 'Tu crédito', level: 2 })).toBeFocused();
  await expect(page.getByRole('navigation', { name: 'Secciones' })).toBeVisible();
});

test('a car loan pack fills its sheets, to be confirmed one by one before the review', async ({
  page,
}) => {
  const sent = await fakeServices(page);
  await upload(page, ['contrato-ficticio.png', 'ine-ficticia.png', 'liquidacion-ficticia.png']);
  await expectShownAndFocused(page.getByRole('heading', { name: 'Datos leídos' }));

  // The request names its review.
  expect(sent[0]?.postDataJSON()).toMatchObject({
    review: 'credit',
    captchaToken: 'extract-token',
    quota: null,
  });
  await expect(
    page.getByText(
      'Contrato del crédito · Información previa (INE) · Liquidación de la amortización anticipada',
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      'TAE: los documentos no dicen lo mismo. Se ha usado lo que pone el contrato; compáralo con los demás.',
    ),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Revisar los datos' }).click();
  await expect(sheet(page, 'Tu crédito').getByLabel('Financiación de coche')).toBeChecked();
  await expect(markOf(page, 'product')).toHaveText('Leído del documento · confianza alta');
  await next(page);
  // What the documents never say is the person's to answer.
  await group(page, 'Para qué es', '¿Para qué lo pediste?')
    .getByLabel('Para mí o mi casa, fuera de mi trabajo o negocio')
    .check();
  await next(page);
  await expect(sheet(page, 'El importe').getByLabel('Importe del préstamo')).toHaveValue(
    '15.000,00',
  );
  await next(page);
  const dates = sheet(page, 'Las fechas');
  await expect(dates.getByLabel('¿Cuándo lo contrataste?')).toHaveValue('2024-03-01');
  await dates.getByLabel('¿Cuándo recibiste el dinero?').fill('2024-03-01');
  await next(page);
  await expect(sheet(page, 'El interés').getByLabel('Tipo de interés nominal (TIN)')).toHaveValue(
    '7,99',
  );
  await next(page);
  const apr = sheet(page, 'La TAE del contrato');
  await expect(apr.getByLabel('Sí', { exact: true })).toBeChecked();
  await expect(apr.getByLabel('TAE que dice tu contrato')).toHaveValue('9,5');
  await next(page);
  const instalments = sheet(page, 'Las cuotas');
  await expect(instalments.getByLabel('Número de cuotas')).toHaveValue('48');
  await expect(instalments.getByLabel('Importe de cada cuota')).toHaveValue('230,00');
  await expect(instalments.getByLabel('Día de la primera cuota')).toHaveValue('2024-04-01');
  await next(page);
  await expect(sheet(page, 'La cuota final').getByLabel('Importe de la cuota final')).toHaveValue(
    '6.000,00',
  );
  await next(page);
  const opening = sheet(page, 'La comisión de apertura');
  await expect(opening.getByLabel('Comisión de apertura')).toHaveValue('300,00');
  await expect(opening.getByLabel('Me llegó menos dinero')).toBeChecked();
  await next(page);
  await next(page);
  await expect(sheet(page, 'El seguro').getByLabel('Prima del seguro')).toHaveValue('600,00');
  await expect(sheet(page, 'El seguro').getByLabel('Una sola vez')).toBeChecked();
  await next(page);
  await expect(
    group(page, 'Más sobre el seguro', '¿La prima se sumó al préstamo?').getByLabel('Sí'),
  ).toBeChecked();
  await expect(markOf(page, 'insuranceRequired')).toHaveText(
    'Leído del documento · confianza media',
  );
  await next(page);
  await group(
    page,
    'La TAE que se compara',
    '¿Qué TAE se compara con el tipo medio del Banco de España?',
  )
    .getByLabel('La que dice tu contrato')
    .check();
  await next(page);
  const repayment = sheet(page, 'Si lo devolviste antes');
  await expect(repayment.getByLabel('Día en que lo devolviste')).toHaveValue('2026-06-15');
  await expect(repayment.getByLabel('Capital que devolviste')).toHaveValue('8.000,00');
  await next(page);
  const charged = sheet(page, 'Lo que te cobraron');
  await expect(charged.getByLabel('Compensación que te cobraron por devolverlo antes')).toHaveValue(
    '80,00',
  );
  // The clause as the contract words it, beside the figure to check against it, once opened.
  await charged
    .getByText('Lo que dice tu contrato sobre devolver el préstamo antes de tiempo')
    .click();
  await expect(charged.locator('[data-read-quote="compensation"] blockquote')).toHaveText(
    'En caso de reembolso anticipado, el prestamista tendrá derecho a una compensación del 1 % del importe reembolsado.',
  );
  await next(page);
  await expect(
    sheet(page, 'El final pactado').getByLabel('Día en que acababa el préstamo según el contrato'),
  ).toHaveValue('2028-03-01');
  await next(page);
  await expect(
    group(
      page,
      'Quién lo pagó',
      '¿El concesionario te cobró un descuento que te había hecho por financiar?',
    ).getByLabel('Sí'),
  ).toBeChecked();
  await next(page);
  await group(
    page,
    'Tu copia del contrato',
    '¿Te dieron una copia del contrato con sus condiciones?',
  )
    .getByLabel('Sí')
    .check();
  await page.getByRole('button', { name: 'Revisar' }).click();
  await expect(page.getByRole('heading', { name: 'Resultado', level: 2 })).toBeFocused();
  await expect(page.locator('#resultado [data-item]').first()).toBeVisible();
});

test('pages that are no credit document are said, and the read counts for nothing', async ({
  page,
}) => {
  await fakeServices(page, {
    status: 200,
    body: {
      code: 'nothing_read',
      pages: [
        {
          page: 1,
          kind: 'other',
          readability: { value: 'not_credit_document', confidence: 'high' },
        },
      ],
    },
  });
  await upload(page, ['nomina-ficticia.png']);
  await expect(
    page.getByText('nomina-ficticia.png: no parece un documento del crédito.'),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#credit')).toBeHidden();
});

test('on a phone, every sheet a read fills keeps its buttons on screen, long clauses folded', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await fakeServices(page, { status: 200, body: LONG_PACK });
  await upload(page, ['contrato-ficticio.png']);
  await expectShownAndFocused(page.getByRole('heading', { name: 'Datos leídos' }));
  await page.getByRole('button', { name: 'Revisar los datos' }).click();
  await expect(page.getByRole('heading', { name: 'Tu crédito', level: 2 })).toBeFocused();

  const visible = page.locator('[data-sheet]:not([hidden])');
  for (;;) {
    const id = await visible.getAttribute('data-sheet');
    await fitsScreen(page, { whole: false });
    if (id === 'uso')
      await group(page, 'Para qué es', '¿Para qué lo pediste?')
        .getByLabel('Para mí o mi casa, fuera de mi trabajo o negocio')
        .check();
    if (id === 'contrato')
      await sheet(page, 'Las fechas').getByLabel('¿Cuándo recibiste el dinero?').fill('2024-03-01');
    if (id === 'comparar')
      await group(
        page,
        'La TAE que se compara',
        '¿Qué TAE se compara con el tipo medio del Banco de España?',
      )
        .getByLabel('La que dice tu contrato')
        .check();
    if (id === 'compensacion' || id === 'desistimiento') {
      const quote = visible.locator('[data-read-quote]');
      await expect(quote.locator('blockquote')).toBeHidden();
      // Folded, a clause of 600 characters takes its label, not a screen.
      expect((await quote.boundingBox())?.height).toBeLessThan(100);
      await quote.getByText(/^Lo que dice tu contrato sobre/).click();
      await expect(quote.locator('blockquote')).toHaveText(LONG.slice(0, 600));
    }
    if (id === 'desistimiento') break;
    await next(page);
  }
});

test('a second read adds to what the first filled and never quietly replaces it', async ({
  page,
}) => {
  const FIRST = reading([CONTRACT], {
    product: from(CONTRACT, 'personal_loan'),
    agreedOn: from(CONTRACT, '2024-03-01'),
    principal: from(CONTRACT, 6_000),
    nominalRate: from(CONTRACT, 6.5),
    instalmentCount: from(CONTRACT, 24),
  });
  // The schedule, which states another rate, and gives the instalments the contract left out.
  const due = (on: string) => ({ dueOn: on, amount: 267.27, interest: 30, principal: 237.27 });
  const SECOND = reading(
    ['amortization_schedule'],
    { nominalRate: from('amortization_schedule', 7) },
    ['2024-04-01', '2024-05-01', '2024-06-01'].map((on) => ({
      values: due(on),
      confidence: 'high',
      source: 'amortization_schedule',
    })),
  );
  await fakeServices(page, [FIRST, SECOND]);
  await upload(page, ['contrato-ficticio.png']);
  await expectShownAndFocused(page.getByRole('heading', { name: 'Datos leídos' }));
  await page.getByRole('button', { name: 'Subir más documentos' }).click();
  await expect(page.getByRole('heading', { name: 'Sube tus documentos' })).toBeFocused();
  await page.getByLabel('Elegir fotos o PDF').setInputFiles([photo('cuadro-ficticio.png')]);
  await page.getByLabel(/Doy mi consentimiento explícito/).check();
  await page.getByRole('button', { name: 'Leer los documentos' }).click();
  await expectShownAndFocused(page.getByRole('heading', { name: 'Datos leídos' }));
  await expect(
    page
      .locator('[data-done-notes] li')
      .filter({ hasText: /no dice lo mismo que lo leído antes: se ha dejado lo que ya había/ }),
  ).toHaveCount(1);

  await page.getByRole('button', { name: 'Revisar los datos' }).click();
  await expect(sheet(page, 'Tu crédito').getByLabel('Préstamo personal')).toBeChecked();
  const form = page.locator('#credit');
  // Stated by the first read only: kept. Stated again otherwise: kept as first read, and marked.
  await expect(form.locator('[name="principal"]')).toHaveValue('6.000,00');
  await expect(form.locator('[name="instalmentCount"]')).toHaveValue('24');
  await expect(form.locator('[name="nominalRate"]')).toHaveValue('6,5');
  await expect(markOf(page, 'nominalRate')).toHaveText(
    'Leído del documento · otro documento dice otra cosa: compáralos',
  );
  // Stated only by the second read: filled, as worked out from the schedule.
  await expect(form.locator('[name="instalmentAmount"]')).toHaveValue('267,27');
  await expect(form.locator('[name="firstDueOn"]')).toHaveValue('2024-04-01');
});
