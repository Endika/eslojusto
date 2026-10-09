import { test, expect, type Locator, type Page, type Request } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { syntheticPhoto } from '../support/synthetic-photo';
import { nextSheet } from '../support/sheets';
import { expectShownAndFocused } from '../support/reads';

// Runs only against a TEST_DOCUMENTS=1 build, which has /alquiler/ too: every request to the
// fake API, to Turnstile and to Stripe is answered here. The documents and figures are synthetic.

const ORIGIN = `http://localhost:${process.env['E2E_PORT'] ?? 4321}`;
const API = {
  extract: 'https://extract.api.eslojusto.test/',
  checkout: 'https://checkout.api.eslojusto.test/',
  pass: 'https://pass.api.eslojusto.test/',
};
const STRIPE = 'https://checkout.stripe.com/c/pay/cs_test_e2e';
// Every case reads the indices and norms as loaded on this day.
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
) => ({
  value,
  confidence,
  source,
});
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

// A whole synthetic pack: the contract, a rise notice, a receipt before and after it, the
// agency's invoice and the deposit return, which states another deposit than the contract.
const PACK = {
  code: 'ok',
  extraction: {
    pages: [
      readPage(1, 'lease'),
      readPage(2, 'rent_update_notice'),
      readPage(3, 'rent_receipt', 'ok', '2025-02'),
      readPage(4, 'rent_receipt', 'ok', '2025-03'),
      readPage(5, 'agency_invoice'),
      readPage(6, 'deposit_return'),
    ],
    documents: [
      { kind: 'lease', pages: [1] },
      { kind: 'rent_update_notice', pages: [2] },
      { kind: 'rent_receipt', pages: [3], month: '2025-02' },
      { kind: 'rent_receipt', pages: [4], month: '2025-03' },
      { kind: 'agency_invoice', pages: [5] },
      { kind: 'deposit_return', pages: [6] },
    ],
    fields: {
      signedOn: from('lease', '2024-03-15'),
      startDate: from('lease', '2024-03-20'),
      postcode: from('lease', '28013'),
      landlordType: from('lease', 'person'),
      use: from('lease', 'main_home'),
      agreedMonths: from('lease', 60),
      initialRent: from('lease', 1000),
      updateClauseText: from(
        'lease',
        'La renta se actualizará cada año, en la fecha en que se cumpla cada año de vigencia del contrato, conforme al IPC general.',
      ),
      updateClauseIndex: from('lease', 'ipc'),
      deposit: from('lease', 1000),
      advanceMonths: from('lease', 0),
      chargesClauseText: from(
        'lease',
        'Los gastos de comunidad corren a cargo de la parte arrendataria.',
      ),
      keysReturnedOn: from('deposit_return', '2026-06-30'),
    },
    lists: {
      guarantees: [row('lease', { kind: 'cash', months: 1 })],
      charges: [row('lease', { kind: 'community', annualAmount: 600, concept: 'Comunidad' })],
      notices: [
        row('rent_update_notice', {
          noticeOn: '2025-02-01',
          medium: 'letter',
          percent: 3,
          indexNamed: 'ipc',
          previousRent: 1000,
          newRent: 1030,
          appliesFrom: '2025-03-20',
        }),
      ],
      receipts: [
        row('rent_receipt', { month: '2025-02', total: 1050, rent: 1000, community: 50 }),
        row('rent_receipt', { month: '2025-03', total: 1080, rent: 1030, community: 50 }),
      ],
      invoices: [
        row('agency_invoice', {
          issuedOn: '2024-03-15',
          issuer: 'agency',
          concept: 'Estudio de solvencia',
          conceptKind: 'solvency_check',
          base: 200,
          vat: 42,
          total: 242,
        }),
      ],
      returns: [row('deposit_return', { on: '2026-08-14', amount: 850 })],
      deductions: [row('deposit_return', { amount: 150, kind: 'cleaning', concept: 'Limpieza' })],
    },
    conflicts: [{ field: 'deposit', sources: ['lease', 'deposit_return'] }],
  },
  failedChecks: [],
  allowance: 'v1.quota.e2e',
};
const PACK_FILES = [
  'contrato-ficticio.png',
  'aviso-subida.png',
  'recibo-febrero.png',
  'recibo-marzo.png',
  'factura-agencia.png',
  'devolucion-fianza.png',
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
      headers: { location: `${ORIGIN}/alquiler/?session_id=cs_test_e2e` },
    }),
  );
  return fake;
}

async function upload(page: Page, files: readonly string[]) {
  await page.goto('alquiler/');
  await page.getByRole('button', { name: /^Sube tu contrato y, si los tienes/ }).click();
  await expect(page.getByRole('heading', { name: 'Sube tus documentos' })).toBeFocused();
  await page.getByLabel('Elegir fotos o PDF').setInputFiles(files.map(photo));
  await page.getByLabel(/Doy mi consentimiento explícito/).check();
  await page.getByRole('button', { name: 'Leer los documentos' }).click();
}

const sheet = (page: Page, name: string) => page.getByRole('group', { name, exact: true });
const next = nextSheet;
const markOf = (page: Page, field: string) => page.locator(`[data-field="${field}"] > .read-mark`);

// The pack read, confirmed sheet by sheet with the answers no document gives.
async function confirmPack(page: Page) {
  await page.getByRole('button', { name: 'Revisar los datos' }).click();

  const contract = sheet(page, 'Tu contrato');
  await expect(contract.getByLabel('Vivienda habitual', { exact: true })).toBeChecked();
  await expect(contract.getByLabel('Fecha del contrato', { exact: true })).toHaveValue(
    '2024-03-15',
  );
  await expect(contract.getByLabel('Fecha de entrada', { exact: true })).toHaveValue('2024-03-20');
  await expect(markOf(page, 'signedOn')).toHaveText('Leído del documento · confianza alta');
  await next(page);

  const landlord = sheet(page, 'Tu casero');
  await expect(landlord.getByLabel('Una persona', { exact: true })).toBeChecked();
  await expect(landlord.getByLabel('Comunidad autónoma', { exact: true })).toHaveValue('MD');
  await expect(markOf(page, 'region')).toHaveText(
    'Sale de lo leído en tus documentos · confianza alta',
  );
  await landlord
    .getByRole('group', { name: '¿Tu casero es gran tenedor?' })
    .getByLabel('No', { exact: true })
    .check();
  await landlord
    .getByRole('group', { name: '¿Está la vivienda en una zona tensionada?' })
    .getByLabel('No', { exact: true })
    .check();
  await next(page);

  const entry = sheet(page, 'Lo que pagaste al entrar');
  await expect(entry.getByLabel('Fianza', { exact: true })).toHaveValue('1.000,00');
  await expect(entry.getByLabel('Mensualidades por adelantado', { exact: true })).toHaveValue('1');
  const guarantee = entry.getByRole('group', { name: 'Garantía 1' });
  await expect(guarantee.getByLabel('Tipo', { exact: true })).toHaveValue('cash');
  await expect(guarantee.getByLabel('Importe', { exact: true })).toHaveValue('1.000,00');
  const fee = entry.getByRole('group', { name: 'Pago 1' });
  await expect(fee.getByLabel('Concepto', { exact: true })).toHaveValue('solvency_check');
  await expect(fee.getByLabel('Importe', { exact: true })).toHaveValue('242,00');
  await fee
    .getByRole('group', { name: '¿Te lo descontaron después de la renta o de la fianza?' })
    .getByLabel('No', { exact: true })
    .check();
  await next(page);

  const rent = sheet(page, 'La renta');
  await expect(rent.getByLabel('Renta al empezar', { exact: true })).toHaveValue('1.000,00');
  await expect(rent.getByLabel('Duración pactada, en meses', { exact: true })).toHaveValue('60');
  await expect(rent.getByLabel('El IPC', { exact: true })).toBeChecked();
  // The clause as the contract words it, beside the label to confirm against it.
  await expect(rent.locator('[data-read-quote="updateClause"] blockquote')).toHaveText(
    'La renta se actualizará cada año, en la fecha en que se cumpla cada año de vigencia del contrato, conforme al IPC general.',
  );
  await next(page);

  const rises = sheet(page, 'Las subidas');
  await expect(rises.getByLabel('Sí, añadirlas', { exact: true })).toBeChecked();
  const rise = rises.getByRole('group', { name: 'Subida 1' });
  await expect(rise.getByLabel('Año de la subida', { exact: true })).toHaveValue('2025');
  await expect(rise.getByLabel('Primer recibo con la renta nueva', { exact: true })).toHaveValue(
    '2025-03-01',
  );
  await expect(rise.getByLabel('Renta antes', { exact: true })).toHaveValue('1.000,00');
  await expect(rise.getByLabel('Renta después', { exact: true })).toHaveValue('1.030,00');
  await expect(rise.getByLabel('¿Cómo te avisaron?', { exact: true })).toHaveValue('letter');
  await expect(rise.getByLabel('Fecha del aviso', { exact: true })).toHaveValue('2025-02-01');
  await rise
    .getByRole('group', { name: '¿Aceptaste esa subida?' })
    .getByLabel('No', { exact: true })
    .check();
  await next(page);

  const charges = sheet(page, 'Los gastos');
  await expect(charges.locator('[data-read-quote="hasCharges"] blockquote')).toHaveText(
    'Los gastos de comunidad corren a cargo de la parte arrendataria.',
  );
  const charge = charges.getByRole('group', { name: 'Gasto 1' });
  await expect(charge.getByLabel('Concepto', { exact: true })).toHaveValue('community');
  await expect(charge.getByLabel('Año', { exact: true })).toHaveValue('2025');
  await expect(
    charge.getByLabel('Importe de los gastos de ese año (el año al que corresponden)', {
      exact: true,
    }),
  ).toHaveValue('100,00');
  await expect(
    charge.getByLabel('Importe al año que fija el contrato', { exact: true }),
  ).toHaveValue('600,00');
  await next(page);

  const exit = sheet(page, 'La salida');
  await expect(exit.getByLabel('Sí', { exact: true })).toBeChecked();
  await expect(exit.getByLabel('Día en que devolviste las llaves', { exact: true })).toHaveValue(
    '2026-06-30',
  );
  await expect(
    exit.getByRole('group', { name: 'Devolución 1' }).getByLabel('Importe', { exact: true }),
  ).toHaveValue('850,00');
  await expect(
    exit.getByRole('group', { name: 'Descuento 1' }).getByLabel('Motivo', { exact: true }),
  ).toHaveValue('cleaning');
  await page.getByRole('button', { name: 'Revisar' }).click();
  await expect(page.getByRole('heading', { name: 'Resultado', level: 2 })).toBeFocused();
}

async function expectNoDetail(result: Locator) {
  await expect(result.locator('[data-detail]')).toHaveCount(0);
  expect((await result.textContent()) ?? '').not.toContain('Cómo se calcula');
}

test('the page opens on the choice between reading documents and typing', async ({ page }) => {
  await page.goto('alquiler/');
  await expect(page.getByRole('heading', { name: '¿Cómo quieres empezar?' })).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: /Sube tu contrato y, si los tienes, avisos de subida, recibos, factura de la agencia y devolución de la fianza/,
    }),
  ).toBeVisible();
  await expect(page.locator('#rental')).toBeHidden();
  await page.getByRole('button', { name: /Rellenar a mano/ }).click();
  await expect(page.getByRole('heading', { name: 'Tu contrato', level: 2 })).toBeFocused();
  await expect(page.getByRole('navigation', { name: 'Secciones' })).toBeVisible();
});

test('a whole pack fills every sheet; the detail waits for the pass, which unlocks it', async ({
  page,
}) => {
  const fake = await fakeServices(page);
  await upload(page, PACK_FILES);
  // Six photos take a while to draw and encode.
  await expectShownAndFocused(page.getByRole('heading', { name: 'Datos leídos' }));

  // The request names its review; the final pay's never does.
  const sent = fake.extract[0]?.postDataJSON() as Record<string, unknown>;
  expect(sent).toMatchObject({ review: 'rental', captchaToken: 'extract-token', quota: null });
  await expect(
    page.getByText(
      'Contrato de alquiler · Aviso de subida de la renta · Recibo de febrero · Recibo de marzo · Factura de la agencia · Devolución de la fianza',
    ),
  ).toBeVisible();
  // The contract's deposit and the return's disagree: the contract's is kept, and it says so.
  await expect(
    page.getByText(
      'Fianza: los documentos no dicen lo mismo. Se ha usado lo que pone el contrato; compáralo con los demás.',
    ),
  ).toBeVisible();
  await expect(
    page.getByText(/Los gastos de cada año suman solo los recibos leídos/),
  ).toBeVisible();

  await confirmPack(page);
  const result = page.locator('#resultado');
  await expect(result.getByRole('region', { name: 'Subida del 20-03-2025' })).toContainText(
    'Pagas de más',
  );
  await expectNoDetail(result);

  // The same pass as the final pay's, returning to this page.
  const offer = page.getByRole('region', { name: 'El detalle, el informe y las cartas' });
  await expect(offer).toContainText('4,99 € con IVA incluido');
  await expect(offer.getByRole('button', { name: /Descargar/ })).toHaveCount(0);
  await offer.getByLabel(/pierdo el derecho de desistimiento/).check();
  await offer.getByRole('button', { name: 'Pagar 4,99 €' }).click();
  await expect(
    page.getByText(
      'Pago recibido. Ya puedes ver el detalle de cada partida y descargar el informe.',
    ),
  ).toBeVisible();
  expect(fake.checkout[0]?.postDataJSON()).toMatchObject({ returnTo: 'rental' });
  expect(fake.pass[0]?.postDataJSON()).toMatchObject({ sessionId: 'cs_test_e2e' });
  expect(page.url()).not.toContain('session_id');
  expect(await page.evaluate(() => sessionStorage.length)).toBe(0);

  // The review came back with the person, now with its detail.
  const card = result.getByRole('region', { name: 'Subida del 20-03-2025' });
  await expect(card).toContainText('Pagas de más');
  await card.getByText('Cómo se calcula').click();
  await expect(card).toContainText('Tope legal');
  await expect(offer).toContainText(/Tu pase vale hasta el/);
});

test('a page that is no rental document is set aside, with why', async ({ page }) => {
  await fakeServices(page, {
    status: 200,
    body: {
      ...PACK,
      extraction: {
        pages: [readPage(1, 'lease'), readPage(2, 'other', 'not_rental_document')],
        documents: [
          { kind: 'lease', pages: [1] },
          { kind: 'other', pages: [2] },
        ],
        fields: { use: from('lease', 'seasonal'), signedOn: from('lease', '2025-09-01') },
        lists: {},
        conflicts: [],
      },
    },
  });
  await upload(page, ['contrato-ficticio.png', 'nomina-ficticia.png']);
  await expect(page.getByText('Contrato de alquiler · 1 página sin datos útiles')).toBeVisible();
  await expect(
    page.getByText('Se ha saltado nomina-ficticia.png: no parece un documento del alquiler.'),
  ).toBeVisible();
  // A seasonal contract read is preselected, and the gate stops it as if typed.
  await page.getByRole('button', { name: 'Revisar los datos' }).click();
  await expect(page.getByLabel('De temporada', { exact: true })).toBeChecked();
  await page.getByLabel('Fecha de entrada').fill('2025-09-01');
  await next(page);
  await expect(page.getByText('Esta revisión no cubre tu tipo de contrato')).toBeVisible();
});

test('a read that finds nothing says why for each file and spends no read', async ({ page }) => {
  const fake = await fakeServices(page, {
    status: 422,
    body: {
      code: 'nothing_read',
      pages: [
        { page: 1, kind: 'lease', readability: { value: 'blurry', confidence: 'high' } },
        {
          page: 2,
          kind: 'other',
          readability: { value: 'not_rental_document', confidence: 'high' },
        },
      ],
    },
  });
  await upload(page, ['contrato-movido.png', 'factura-luz.png']);
  await expectShownAndFocused(
    page.getByText('No se ha leído ningún dato, así que esta lectura no cuenta.'),
  );
  await expect(
    page.getByText('contrato-movido.png: sale borrosa. Prueba con más luz y el móvil quieto.'),
  ).toBeVisible();
  await expect(
    page.getByText('factura-luz.png: no parece un documento del alquiler.'),
  ).toBeVisible();
  expect(fake.extract).toHaveLength(1);
  expect(await page.evaluate(() => localStorage.getItem('eslojusto-lecturas'))).toBeNull();
});

// Typed by hand: a 2025 rise above the IRAV, and the keys back on 30-06-2026 with 850 € of the
// 1.000 € deposit returned, so 150 € is still owed.
async function fillByHand(page: Page) {
  await page.goto('alquiler/');
  await page.getByRole('button', { name: /Rellenar a mano/ }).click();
  const contract = sheet(page, 'Tu contrato');
  await contract.getByLabel('Vivienda habitual', { exact: true }).check();
  await contract.getByLabel('Fecha del contrato', { exact: true }).fill('2024-03-15');
  await contract.getByLabel('Fecha de entrada', { exact: true }).fill('2024-03-20');
  await next(page);
  const landlord = sheet(page, 'Tu casero');
  await landlord.getByLabel('Una persona').check();
  await landlord
    .getByRole('group', { name: '¿Tu casero es gran tenedor?' })
    .getByLabel('No', { exact: true })
    .check();
  await landlord.getByLabel('Comunidad autónoma').selectOption({ label: 'Comunidad de Madrid' });
  await landlord
    .getByRole('group', { name: '¿Está la vivienda en una zona tensionada?' })
    .getByLabel('No', { exact: true })
    .check();
  await next(page);
  await sheet(page, 'Lo que pagaste al entrar').getByLabel('Fianza', { exact: true }).fill('1000');
  await next(page);
  const rent = sheet(page, 'La renta');
  await rent.getByLabel('Renta al empezar').fill('1.000,00');
  await rent.getByLabel('Duración pactada, en meses').fill('60');
  await rent.getByLabel('El IPC', { exact: true }).check();
  await next(page);
  const rises = sheet(page, 'Las subidas');
  await rises.getByLabel('Sí, añadirlas').check();
  const rise = rises.getByRole('group', { name: 'Subida 1' });
  await rise.getByLabel('Año de la subida').fill('2025');
  await rise.getByLabel('Primer recibo con la renta nueva').fill('2025-03-01');
  await rise.getByLabel('Renta antes').fill('1000');
  await rise.getByLabel('Renta después').fill('1030');
  await rise.getByLabel('¿Cómo te avisaron?').selectOption({ label: 'Carta' });
  await rise.getByLabel('Fecha del aviso').fill('2025-02-01');
  await rise
    .getByRole('group', { name: '¿Aceptaste esa subida?' })
    .getByLabel('No', { exact: true })
    .check();
  await next(page);
  await expect(sheet(page, 'Los gastos')).toBeVisible();
  await next(page);
  const exit = sheet(page, 'La salida');
  await exit.getByLabel('Sí', { exact: true }).check();
  await exit.getByLabel('Día en que devolviste las llaves', { exact: true }).fill('2026-06-30');
  await exit.getByRole('button', { name: 'Añadir devolución' }).click();
  const returned = exit.getByRole('group', { name: 'Devolución 1' });
  await returned.getByLabel('Fecha', { exact: true }).fill('2026-08-14');
  await returned.getByLabel('Importe', { exact: true }).fill('850');
  await page.getByRole('button', { name: 'Revisar' }).click();
  await expect(page.getByRole('heading', { name: 'Resultado', level: 2 })).toBeFocused();
}

async function downloadOf(page: Page, button: Locator): Promise<string> {
  const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
  const path = await download.path();
  expect(readFileSync(path).subarray(0, 5).toString()).toBe('%PDF-');
  return download.suggestedFilename();
}

test('the pass unlocks the report and both letters, filled in and downloaded', async ({ page }) => {
  await fakeServices(page);
  const sent: string[] = [];
  page.on('request', (r) => sent.push(`${r.url()} ${r.postData() ?? ''}`));
  await fillByHand(page);
  const result = page.locator('#resultado');
  await expect(result.getByRole('region', { name: 'Devolución de la fianza' })).toContainText(
    'Te deben',
  );

  const offer = page.getByRole('region', { name: 'El detalle, el informe y las cartas' });
  await expect(offer.getByRole('button', { name: /Descargar/ })).toHaveCount(0);
  await offer.getByLabel(/pierdo el derecho de desistimiento/).check();
  await offer.getByRole('button', { name: 'Pagar 4,99 €' }).click();
  await expect(offer).toContainText(/Tu pase vale hasta el/);

  expect(
    await downloadOf(page, offer.getByRole('button', { name: 'Descargar el informe (PDF)' })),
  ).toBe('eslojusto-informe-alquiler.pdf');

  const letter = offer.getByRole('group', { name: 'Tus datos para las cartas (opcional)' });
  await letter.getByLabel('Tu nombre y apellidos').fill('Alex Ejemplo');
  await letter.getByLabel('DNI o NIE').fill('00000000A');
  await letter.getByLabel('Nombre de tu casero o de la empresa').fill('Inmuebles Ficticios SL');
  await letter.getByLabel('Dirección de la vivienda').fill('Calle Inventada 0, Villaficticia');
  await letter.getByLabel('Localidad').fill('Villaficticia');
  await expect(letter.getByLabel('Fecha')).toHaveValue('2026-10-08');
  await letter
    .getByLabel('Cuenta (IBAN) para devolverte la fianza')
    .fill('ES00 0000 0000 0000 0000 0000');

  expect(
    await downloadOf(
      page,
      letter.getByRole('button', { name: 'Descargar la carta de la fianza (PDF)' }),
    ),
  ).toBe('eslojusto-carta-fianza.pdf');
  expect(
    await downloadOf(
      page,
      letter.getByRole('button', { name: 'Descargar la carta de la renta (PDF)' }),
    ),
  ).toBe('eslojusto-carta-renta.pdf');
  // Downloaded, never sent: nothing typed for the letters left the page.
  await expect(letter.getByText(/^Las cartas son plantillas con tus cifras\./)).toBeVisible();
  for (const typed of ['Alex Ejemplo', 'Inmuebles Ficticios', 'Calle Inventada', 'ES00 0000'])
    expect(sent.filter((r) => r.includes(typed) || r.includes(encodeURIComponent(typed)))).toEqual(
      [],
    );
});

test('without a deposit owed, only the rent letter and no account to ask for', async ({ page }) => {
  await fakeServices(page);
  await page.setViewportSize({ width: 360, height: 640 });
  await fillByHand(page);
  // Back to the exit: the whole deposit came back.
  await page.getByRole('link', { name: /Salida/ }).click();
  const returned = sheet(page, 'La salida').getByRole('group', { name: 'Devolución 1' });
  await returned.getByLabel('Importe', { exact: true }).fill('1000');
  await returned.getByLabel('Fecha', { exact: true }).fill('2026-07-10');
  await page.getByRole('button', { name: 'Revisar' }).click();
  await expect(page.getByRole('heading', { name: 'Resultado', level: 2 })).toBeFocused();

  const offer = page.getByRole('region', { name: 'El detalle, el informe y las cartas' });
  await offer.getByLabel(/pierdo el derecho de desistimiento/).check();
  await offer.getByRole('button', { name: 'Pagar 4,99 €' }).click();
  await expect(offer).toContainText(/Tu pase vale hasta el/);
  await expect(
    offer.getByRole('button', { name: 'Descargar la carta de la renta (PDF)' }),
  ).toBeVisible();
  await expect(
    offer.getByRole('button', { name: 'Descargar la carta de la fianza (PDF)' }),
  ).toBeHidden();
  await expect(offer.getByLabel('Cuenta (IBAN) para devolverte la fianza')).toBeHidden();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('with the documents API, the questions cover documents and the pass, in the JSON-LD too', async ({
  page,
}) => {
  await page.goto('alquiler/');
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
