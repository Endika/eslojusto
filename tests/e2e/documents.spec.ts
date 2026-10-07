import { readFileSync } from 'node:fs';
import { devices, test, expect, type Page, type Request } from '@playwright/test';
import { pdfBomb, syntheticPdf } from '../support/synthetic-pdf';

// Runs only against a TEST_DOCUMENTS=1 build, whose API is three fake origins: every request to them,
// to Turnstile and to Stripe is answered here. The documents are synthetic.

const ORIGIN = `http://localhost:${process.env['E2E_PORT'] ?? 4321}`;
// One function URL per operation, as playwright.config.ts builds the site with.
const API = {
  extract: 'https://extract.api.eslojusto.test/',
  checkout: 'https://checkout.api.eslojusto.test/',
  pass: 'https://pass.api.eslojusto.test/',
};
const API_ORIGINS = Object.values(API).map((url) => new URL(url).origin);
const STRIPE = 'https://checkout.stripe.com/c/pay/cs_test_e2e';

// A 40×30 red PNG: the browser decodes it and sends it on as a JPEG.
const PHOTO = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAACgAAAAeCAIAAADRv8uKAAAALElEQVR4nO3NMQ0AAAgDsClBBP4FIAsZcDTp30zXiYjFYrFYLBaLxWKx+G+8uBAgzDALZFoAAAAASUVORK5CYII=',
  'base64',
);

const b64url = (v: object) => Buffer.from(JSON.stringify(v)).toString('base64url');
const expiresAt = Math.floor(Date.now() / 1000) + 7 * 86400;
const PASS = `v1.${b64url({ typ: 'pass', sid: 'cs_test_e2e', exp: expiresAt })}.c2ln`;

const from = (source: string, value: string | number, confidence = 'high') => ({
  value,
  confidence,
  source,
});
const SETTLEMENT = {
  code: 'ok',
  extraction: {
    pages: [{ page: 1, kind: 'settlement_proposal', document: 1, confidence: 'high' }],
    documents: [{ kind: 'settlement_proposal', pages: [1] }],
    fields: {
      cause: from('settlement_proposal', 'unfair_dismissal'),
      startDate: from('settlement_proposal', '2010-03-01'),
      endDate: from('settlement_proposal', '2026-09-15', 'medium'),
      monthlySalary: from('settlement_proposal', 2142.86),
      severance: from('settlement_proposal', 40000, 'low'),
    },
    lists: {},
    conflicts: [],
  },
  failedChecks: [],
  allowance: 'v1.quota.e2e',
};

interface Fake {
  readonly extract: Request[];
  readonly checkout: Request[];
  readonly pass: Request[];
  readonly other: string[];
}

// Turnstile answers at once; the API answers as given; anything else off-site is recorded.
async function fakeServices(
  page: Page,
  extract: { status: number; body: object } = { status: 200, body: SETTLEMENT },
  // Where Stripe sends the person: back with the session id, or, cancelling, without it.
  stripeBack = `${ORIGIN}/finiquito/?session_id=cs_test_e2e`,
): Promise<Fake> {
  const fake: Fake = { extract: [], checkout: [], pass: [], other: [] };
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
    fake.pass.push(route.request());
    return route.fulfill({ json: { code: 'ok', pass: PASS, expiresAt, readsLeft: 15 } });
  });
  await page.route('https://checkout.stripe.com/**', (route) =>
    route.fulfill({ status: 302, headers: { location: stripeBack } }),
  );
  page.on('request', (r) => {
    const { origin } = new URL(r.url());
    if (
      ![
        ORIGIN,
        ...API_ORIGINS,
        'https://challenges.cloudflare.com',
        'https://checkout.stripe.com',
      ].includes(origin)
    )
      fake.other.push(r.url());
  });
  return fake;
}

const photo = (name: string) => ({ name, mimeType: 'image/png', buffer: PHOTO });

async function openUpload(page: Page) {
  await page.getByRole('button', { name: /Sube tus documentos/ }).click();
  await expect(page.getByRole('heading', { name: 'Sube tus documentos' })).toBeFocused();
}

async function uploadSettlement(page: Page, { read = true } = {}) {
  await openUpload(page);
  await page.getByLabel('Elegir fotos o PDF').setInputFiles(photo('finiquito-sintetico.png'));
  await page.getByLabel(/Doy mi consentimiento explícito/).check();
  await page.getByRole('button', { name: 'Leer los documentos' }).click();
  if (read) await expect(page.getByRole('heading', { name: 'Datos leídos' })).toBeFocused();
}

test('the page opens on the choice, and the CSP names only the three function URLs and Turnstile', async ({
  page,
}) => {
  await page.goto('finiquito/');
  await expect(page.getByRole('heading', { name: '¿Cómo quieres empezar?' })).toBeVisible();
  await expect(page.locator('#calculator')).toBeHidden();
  const csp = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content');
  expect(csp).toContain(
    `connect-src ${[...API_ORIGINS, 'https://challenges.cloudflare.com'].join(' ')}; frame-src https://challenges.cloudflare.com;`,
  );
});

test('«Rellenar a mano» is the calculator as before, and nothing leaves the page', async ({
  page,
}) => {
  const fake = await fakeServices(page);
  const offsite: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith(`${ORIGIN}/`)) offsite.push(r.url());
  });
  await page.goto('finiquito/');
  await page.getByRole('button', { name: /Rellenar a mano/ }).click();
  await expect(page.getByRole('heading', { name: '¿Cómo terminó tu contrato?' })).toBeFocused();
  await expect(page.getByRole('navigation', { name: 'Secciones' })).toBeVisible();
  expect(fake.extract).toHaveLength(0);
  expect(offsite).toEqual([]);
});

test('upload → prefill → confirm → result → pass → PDF report and letter', async ({ page }) => {
  const fake = await fakeServices(page);
  await page.goto('finiquito/');
  await uploadSettlement(page);

  const sent = fake.extract[0]?.postDataJSON() as Record<string, unknown>;
  expect(sent).toMatchObject({ captchaToken: 'extract-token', quota: null });
  expect(sent).not.toHaveProperty('kind');
  expect(sent['files']).toEqual([{ mediaType: 'image/jpeg', data: expect.any(String) }]);
  await expect(page.getByText('Se han leído 5 datos')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('eslojusto-lecturas'))).toBe(
    'v1.quota.e2e',
  );

  // Every sheet is confirmed by hand; the read values wear their mark.
  await page.getByRole('button', { name: 'Revisar los datos' }).click();
  await expect(page.getByLabel('Despido improcedente')).toBeChecked();
  await expect(page.locator('[data-field="cause"] .read-mark')).toHaveText(
    'Leído del documento · confianza alta',
  );
  await expect(page.locator('#resultado')).toBeHidden();
  const next = () => page.getByRole('button', { name: 'Siguiente' }).click();
  await next();
  await expect(page.getByLabel('Fecha de alta', { exact: true })).toHaveValue('2010-03-01');
  await expect(page.locator('[data-field="endDate"] .read-mark')).toHaveText(
    'Leído del documento · confianza media',
  );
  await next();
  await page
    .getByRole('group', { name: '¿Tus pagas extra van prorrateadas en la nómina?' })
    .getByLabel('Sí')
    .check();
  await next();
  await expect(page.getByLabel('Salario bruto mensual')).toHaveValue('2.142,86');
  await next();
  await page.getByLabel('Disfrutados este año').fill('0');
  await next();
  await page.getByLabel('Ninguno').check();
  await next();
  await next();
  await expect(page.getByLabel('Indemnización')).toHaveValue('40.000,00');
  await expect(page.locator('[data-field="figure_severance"] .read-mark')).toHaveText(
    'Leído del documento · confianza baja: compruébalo',
  );
  await page.getByRole('button', { name: 'Revisar' }).click();
  await expect(page.getByRole('region', { name: 'Indemnización' })).toContainText(
    'Por debajo del mínimo legal',
  );

  // The pass: the waiver first, then Stripe, then back with the session id.
  const offer = page.getByRole('region', { name: /Informe en PDF/ });
  await expect(offer).toContainText('4,99 € con IVA incluido');
  await offer.getByRole('button', { name: 'Pagar 4,99 €' }).click();
  await expect(offer.getByText('Marca la casilla para seguir')).toBeVisible();
  await offer.getByLabel(/pierdo el derecho de desistimiento/).check();
  await offer.getByRole('button', { name: 'Pagar 4,99 €' }).click();
  await page.waitForURL(/\/finiquito\/(#.*)?$/);
  await expect(page.getByText('Pago recibido')).toBeVisible();
  expect(page.url()).not.toContain('session_id');
  const started = fake.checkout[0]?.postDataJSON() as Record<string, unknown>;
  expect(started['captchaToken']).toBe('checkout-token');
  const asked = fake.pass[0]?.postDataJSON() as Record<string, unknown>;
  expect(asked['nonce']).toBe(started['nonce']);
  expect(asked['sessionId']).toBe('cs_test_e2e');
  expect(asked['nonce']).toMatch(/^[A-Za-z0-9_-]{32}$/);
  expect(await page.evaluate(() => sessionStorage.length)).toBe(0);

  // The review came back with the person, so the downloads sit in its result.
  await expect(page.getByRole('region', { name: 'Indemnización' })).toContainText(
    'Por debajo del mínimo legal',
  );
  for (const [button, name] of [
    ['Descargar el informe (PDF)', 'eslojusto-informe-finiquito.pdf'],
    ['Descargar la carta (PDF)', 'eslojusto-recibi-no-conforme.pdf'],
  ] as const) {
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: button }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe(name);
    const bytes = readFileSync(await file.path());
    expect(bytes.subarray(0, 8).toString('latin1')).toBe('%PDF-1.7');
  }

  // The letter's own details: optional, dated today, and never sent or kept anywhere.
  const letter = page.getByRole('group', { name: 'Tus datos para la carta (opcional)' });
  await expect(letter).toContainText(
    'Estos datos solo se usan para rellenar la carta en tu dispositivo; no se envían ni se guardan.',
  );
  await expect(letter.getByLabel('Tu nombre y apellidos')).toHaveAttribute('autocomplete', 'name');
  await expect(letter.getByLabel('Empresa')).toHaveAttribute('autocomplete', 'organization');
  await expect(letter.getByLabel('Localidad')).toHaveAttribute('autocomplete', 'address-level2');
  await expect(letter.getByLabel('Fecha')).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
  await letter.getByLabel('Tu nombre y apellidos').fill('Alex Ejemplo');
  await letter.getByLabel('DNI o NIE').fill('1234');
  await letter.getByLabel('Empresa').fill('Empresa Ficticia SL');
  await letter.getByLabel('Localidad').fill('Logroño');
  await letter.getByLabel('Localidad').press('Tab');
  await expect(letter.getByText('No parece un DNI ni un NIE')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar la carta (PDF)' }).click();
  const filled = readFileSync(await (await download).path());
  expect(filled.subarray(0, 8).toString('latin1')).toBe('%PDF-1.7');
  const kept = await page.evaluate(() =>
    JSON.stringify([{ ...localStorage }, { ...sessionStorage }]),
  );
  for (const typed of ['Alex Ejemplo', 'Empresa Ficticia', 'Logroño', '1234'])
    expect(kept).not.toContain(typed);
  expect(fake.other).toEqual([]);
});

// The read values, confirmed sheet by sheet with the answers a document can't give.
async function confirmToResult(page: Page) {
  await page.getByRole('button', { name: 'Revisar los datos' }).click();
  const next = () => page.getByRole('button', { name: 'Siguiente' }).click();
  await next();
  await next();
  await page.locator('#prorated-yes').check();
  await next();
  await next();
  await page.getByLabel('Disfrutados este año').fill('0');
  await next();
  await page.getByLabel('Ninguno').check();
  await next();
  await next();
  await page.getByRole('button', { name: 'Revisar' }).click();
  await expect(page.getByRole('region', { name: 'Indemnización' })).toContainText(
    'Por debajo del mínimo legal',
  );
}

test('cancelling at Stripe brings the review back and keeps nothing in the tab', async ({
  page,
}) => {
  const fake = await fakeServices(page, undefined, `${ORIGIN}/finiquito/`);
  await page.goto('finiquito/');
  await uploadSettlement(page);
  await confirmToResult(page);
  const offer = page.getByRole('region', { name: /Informe en PDF/ });
  await offer.getByLabel(/pierdo el derecho de desistimiento/).check();
  await offer.getByRole('button', { name: 'Pagar 4,99 €' }).click();
  await page.waitForURL(`${ORIGIN}/finiquito/#resultado`);
  await expect(page.getByRole('heading', { name: /Resultado/ })).toBeFocused();
  await expect(page.getByRole('region', { name: 'Indemnización' })).toContainText(
    'Por debajo del mínimo legal',
  );
  await expect(offer.getByRole('button', { name: 'Pagar 4,99 €' })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
  expect(fake.pass).toHaveLength(0);
});

test('files dropped on the zone are listed like chosen ones', async ({ page }) => {
  await fakeServices(page);
  await page.goto('finiquito/');
  await openUpload(page);
  await expect(page.getByText('Arrastra aquí tus fotos o PDF')).toBeVisible();
  await expect(page.getByText('Hacer foto')).toBeHidden();
  const transfer = await page.evaluateHandle((b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(
      new File([bytes], 'nomina-arrastrada.png', { type: 'image/png', lastModified: 1 }),
    );
    return dt;
  }, PHOTO.toString('base64'));
  const zone = page.locator('[data-doc-drop]');
  await zone.dispatchEvent('dragover', { dataTransfer: transfer });
  await expect(zone).toHaveAttribute('data-over', '');
  await zone.dispatchEvent('drop', { dataTransfer: transfer });
  await expect(zone).not.toHaveAttribute('data-over', '');
  await expect(page.getByRole('list', { name: 'Archivos elegidos' })).toContainText(
    'nomina-arrastrada.png',
  );
  // The same file dropped again is not added twice.
  await zone.dispatchEvent('drop', { dataTransfer: transfer });
  await expect(page.getByText('Ya estaba añadido: nomina-arrastrada.png.')).toBeVisible();
  await expect(
    page.getByRole('list', { name: 'Archivos elegidos' }).getByRole('listitem'),
  ).toHaveCount(1);
});

test('an API error is worded and the manual path is still there', async ({ page }) => {
  await fakeServices(page, { status: 429, body: { code: 'daily_limit_reached' } });
  await page.goto('finiquito/');
  await uploadSettlement(page, { read: false });
  await expect(page.getByRole('alert')).toContainText(
    'Ya has usado las 2 lecturas gratis de hoy en este navegador',
  );
  await page
    .locator('[data-start-panel="upload"]')
    .getByRole('button', { name: 'Rellenar a mano' })
    .click();
  await expect(page.getByRole('heading', { name: '¿Cómo terminó tu contrato?' })).toBeFocused();
});

test('the start sheet works by keyboard and fits 360 px in both themes', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('finiquito/');
    const overflow = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
    expect(await overflow(), scheme).toBeLessThanOrEqual(0);
    await expect(page.getByRole('button', { name: /Rellenar a mano/ })).toBeInViewport();
    await page.getByRole('button', { name: /Sube tus documentos/ }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Sube tus documentos' })).toBeFocused();
    expect(await overflow(), scheme).toBeLessThanOrEqual(0);
    await page.getByRole('button', { name: 'Leer los documentos' }).click();
    await expect(page.getByLabel('Elegir fotos o PDF')).toBeFocused();
    await expect(page.getByText('Añade al menos una foto o un PDF')).toBeVisible();
  }
});

test('the privacy page and the legal notice describe documents and the pass', async ({ page }) => {
  await page.goto('privacidad/');
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute(
    'content',
    /connect-src 'none';/,
  );
  const privacy = page.locator('main');
  await expect(privacy).toContainText('Documentos y pagos');
  await expect(privacy).toContainText('arts. 6.1.a y 9.2.a');
  await expect(privacy).toContainText('Amazon Bedrock');
  await expect(privacy).toContainText('Stripe');
  await expect(privacy).toContainText('Cloudflare Turnstile');
  await expect(privacy).toContainText('eslojusto-pase');
  await expect(privacy).toContainText('cuánto texto procesó el modelo');
  await page.goto('aviso-legal/');
  await expect(page.locator('#condiciones')).toContainText('Condiciones de venta del pase');
  await expect(page.locator('main')).toContainText('art. 103.m');
  await expect(page.locator('section:has(#condiciones)')).toContainText(
    'Lo vende Endika Iglesias, con NIF',
  );
  await expect(page.locator('section:has(#condiciones)')).toContainText(
    'Su domicilio es Calle Barranco del Novillo 26',
  );
  await page.goto('finiquito/');
  await expect(page.locator('#faq-documentos')).toContainText('¿Qué pasa con mis documentos?');
});

test('files add up across picks, each can be removed, and only the rest are read', async ({
  page,
}) => {
  const fake = await fakeServices(page);
  await page.goto('finiquito/');
  await openUpload(page);
  await expect(page.getByText('Sube lo que te hayan dado')).toBeVisible();
  const choose = page.getByLabel('Elegir fotos o PDF');
  await choose.setInputFiles(photo('carta-despido.png'));
  await choose.setInputFiles([photo('nomina-agosto.png'), photo('certificado.png')]);
  const list = page.getByRole('list', { name: 'Archivos elegidos' });
  await expect(list.getByRole('listitem')).toHaveCount(3);
  await expect(page.getByText('Añadidos 2 archivos. Llevas 3 de 15.')).toBeVisible();
  await list.getByRole('button', { name: 'Quitar nomina-agosto.png' }).click();
  await expect(list.getByRole('listitem')).toHaveCount(2);
  await expect(page.getByRole('status').filter({ hasText: 'Quitado' })).toHaveText(
    'Quitado: nomina-agosto.png. Llevas 2 de 15.',
  );
  await expect(list.getByRole('button', { name: 'Quitar certificado.png' })).toBeFocused();
  await expect(list.locator('img')).toHaveCount(2);
  await page.getByLabel(/Doy mi consentimiento explícito/).check();
  await page.getByRole('button', { name: 'Leer los documentos' }).click();
  await expect(page.getByRole('heading', { name: 'Datos leídos' })).toBeFocused();
  const sent = fake.extract[0]?.postDataJSON() as { files: unknown[] };
  expect(sent.files).toHaveLength(2);
});

test('a PDF is drawn in the browser: one entry per page, and only images are sent', async ({
  page,
}) => {
  const fake = await fakeServices(page);
  await page.goto('finiquito/');
  await openUpload(page);
  await page.getByLabel('Elegir fotos o PDF').setInputFiles({
    name: 'carta-sintetica.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(syntheticPdf(3)),
  });
  const list = page.getByRole('list', { name: 'Archivos elegidos' });
  await expect(list.getByRole('listitem')).toHaveCount(3);
  await expect(list).toContainText('carta-sintetica.pdf, página 3');
  await expect(page.getByText('Añadido: carta-sintetica.pdf. Páginas: 3.')).toBeVisible();
  await page.getByLabel(/Doy mi consentimiento explícito/).check();
  await page.getByRole('button', { name: 'Leer los documentos' }).click();
  await expect(page.getByRole('heading', { name: 'Datos leídos' })).toBeFocused();
  const sent = fake.extract[0]?.postDataJSON() as { files: { mediaType: string; data: string }[] };
  expect(sent.files.map((f) => f.mediaType)).toEqual(['image/jpeg', 'image/jpeg', 'image/jpeg']);
  expect(JSON.stringify(sent)).not.toContain('application/pdf');
  // A JPEG of the page, not the PDF's bytes.
  for (const f of sent.files) expect(f.data.startsWith('/9j/')).toBe(true);
  expect(fake.other).toEqual([]);
});

test.describe('a PDF that would take minutes to draw', () => {
  // Generated here, never committed: one page of 200 MB of drawing operators.
  const bomb = {
    name: 'bomba.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(pdfBomb(200)),
  };

  async function pickBomb(page: Page) {
    await page.goto('finiquito/');
    await openUpload(page);
    await page.getByLabel('Elegir fotos o PDF').setInputFiles(bomb);
    await expect(
      page.getByRole('list', { name: 'Archivos elegidos' }).getByRole('listitem'),
    ).toHaveCount(1);
    await page.getByLabel(/Doy mi consentimiento explícito/).check();
    await page.getByRole('button', { name: 'Leer los documentos' }).click();
    await expect(page.getByText('Preparando los archivos…')).toBeVisible();
  }

  test('«Rellenar a mano» leaves while it is being drawn', async ({ page }) => {
    const fake = await fakeServices(page);
    await pickBomb(page);
    await page
      .locator('[data-start-panel="upload"]')
      .getByRole('button', { name: 'Rellenar a mano' })
      .click();
    await expect(page.getByRole('heading', { name: '¿Cómo terminó tu contrato?' })).toBeFocused();
    expect(fake.extract).toHaveLength(0);
  });

  test('is given up on after 15 s, with a message', async ({ page }) => {
    test.setTimeout(90_000);
    const fake = await fakeServices(page);
    await pickBomb(page);
    await expect(page.getByRole('alert')).toHaveText(
      'Este PDF tarda demasiado en abrirse aquí. Sube fotos de sus páginas.',
      { timeout: 30_000 },
    );
    await expect(
      page.getByRole('list', { name: 'Archivos elegidos' }).getByRole('listitem'),
    ).toHaveCount(0);
    expect(fake.extract).toHaveLength(0);
  });
});

test('the 16th file is left out with a message, and 15 go in one read', async ({ page }) => {
  const fake = await fakeServices(page);
  await page.goto('finiquito/');
  await openUpload(page);
  await page
    .getByLabel('Elegir fotos o PDF')
    .setInputFiles(Array.from({ length: 16 }, (_, i) => photo(`pagina-${i + 1}.png`)));
  await expect(
    page.getByRole('list', { name: 'Archivos elegidos' }).getByRole('listitem'),
  ).toHaveCount(15);
  await expect(page.getByText('1 archivo no se ha añadido.')).toBeVisible();
  await expect(page.getByText('Como mucho 15 fotos o páginas de PDF en total')).toBeVisible();
  await page.getByLabel(/Doy mi consentimiento explícito/).check();
  await page.getByRole('button', { name: 'Leer los documentos' }).click();
  await expect(page.getByRole('heading', { name: 'Datos leídos' })).toBeFocused();
  const sent = fake.extract[0]?.postDataJSON() as { files: unknown[] };
  expect(sent.files).toHaveLength(15);
});

test('a mixed pack: what was recognised, where the documents disagree, and the prefill', async ({
  page,
}) => {
  await fakeServices(page, {
    status: 200,
    body: {
      ...SETTLEMENT,
      extraction: {
        pages: [],
        documents: [
          { kind: 'dismissal_letter', pages: [1, 2, 3, 4, 5, 6] },
          { kind: 'payslip', pages: [7], month: '2026-08' },
          { kind: 'company_certificate', pages: [8] },
          { kind: 'other', pages: [9] },
        ],
        fields: {
          cause: from('dismissal_letter', 'objective_dismissal'),
          endDate: from('dismissal_letter', '2026-09-15'),
          startDate: from('payslip', '2010-03-01'),
          noticeDaysReceived: from('dismissal_letter', 15),
        },
        lists: {},
        conflicts: [{ field: 'endDate', sources: ['dismissal_letter', 'company_certificate'] }],
      },
    },
  });
  await page.goto('finiquito/');
  await uploadSettlement(page);
  await expect(
    page.getByText(
      'Carta de despido (6 páginas) · Nómina de agosto · Certificado de empresa · 1 página sin datos útiles',
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      'Fecha de baja: los documentos no dicen lo mismo. Se ha usado lo que pone la carta de despido; compáralo con los demás.',
    ),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Revisar los datos' }).click();
  await expect(page.getByLabel('Despido objetivo')).toBeChecked();
});

test('an objective dismissal with an agreement: the reference and the offer, side by side', async ({
  page,
}) => {
  await fakeServices(page, {
    status: 200,
    body: {
      ...SETTLEMENT,
      extraction: {
        pages: [],
        documents: [
          { kind: 'dismissal_letter', pages: [1, 2] },
          { kind: 'settlement_agreement', pages: [3] },
        ],
        fields: {
          cause: from('dismissal_letter', 'objective_dismissal'),
          startDate: from('settlement_proposal', '2024-01-01'),
          endDate: from('dismissal_letter', '2026-06-30'),
          monthlySalary: from('settlement_proposal', 3000),
          noticeDaysReceived: from('dismissal_letter', 15),
          agreementSeveranceTotal: from('settlement_agreement', 8000),
        },
        lists: {},
        conflicts: [],
      },
    },
  });
  await page.goto('finiquito/');
  await uploadSettlement(page);
  await page.getByRole('button', { name: 'Revisar los datos' }).click();
  const next = () => page.getByRole('button', { name: 'Siguiente' }).click();
  await next();
  await next();
  await page.locator('#prorated-yes').check();
  await next();
  await next();
  await page.getByLabel('Disfrutados este año').fill('0');
  await next();
  await page.getByLabel('Ninguno').check();
  await next();
  await next();
  await page.getByRole('button', { name: 'Revisar' }).click();
  const severance = page.getByRole('region', { name: 'Indemnización' });
  await expect(severance).toContainText(
    /Referencia: si un juzgado declarase improcedente el despido, la indemnización sería de 8\.136,99\s€/,
  );
  await expect(severance).toContainText(/El acuerdo que has subido ofrece 8\.000,00\s€ en total\./);
});

test('once reading is unavailable, the start sheet offers only the manual path', async ({
  page,
}) => {
  await fakeServices(page, { status: 503, body: { code: 'model_unavailable' } });
  await page.goto('finiquito/');
  await uploadSettlement(page, { read: false });
  await expect(page.getByRole('alert')).toContainText('La lectura no está disponible ahora mismo');
  await page.getByRole('button', { name: 'Volver' }).click();
  const note =
    'La lectura automática de documentos no está disponible ahora mismo. Puedes escribir los datos a mano; el cálculo es el mismo.';
  await expect(page.getByText(note)).toBeVisible();
  await expect(page.getByRole('button', { name: /Sube tus documentos/ })).toBeHidden();
  // Coming back to the page in the same tab, it is still remembered.
  await page.goto('finiquito/');
  await expect(page.getByText(note)).toBeVisible();
  await expect(page.getByRole('button', { name: /Sube tus documentos/ })).toBeHidden();
  await page.getByRole('button', { name: /Rellenar a mano/ }).click();
  await expect(page.getByRole('heading', { name: '¿Cómo terminó tu contrato?' })).toBeFocused();
});

test.describe('on a phone', () => {
  // The phone as Playwright describes it, without its browser type, which only a project can set.
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices['Pixel 7'];
  test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch });

  test('takes photos with the camera, one after another, and fits the screen', async ({ page }) => {
    await fakeServices(page);
    await page.goto('finiquito/');
    await openUpload(page);
    const camera = page.getByLabel('Hacer foto');
    await expect(page.getByText('Hacer foto')).toBeVisible();
    await expect(page.getByText('Elegir fotos o PDF')).toBeVisible();
    await expect(camera).toHaveAttribute('capture', 'environment');
    await expect(camera).toHaveAttribute('accept', 'image/*');
    await expect(page.getByText('Arrastra aquí tus fotos o PDF')).toBeHidden();
    await camera.setInputFiles(photo('image-1.png'));
    await camera.setInputFiles(photo('image-2.png'));
    const list = page.getByRole('list', { name: 'Archivos elegidos' });
    await expect(list.getByRole('button', { name: 'Quitar Foto 1' })).toBeVisible();
    await expect(list.getByRole('button', { name: 'Quitar Foto 2' })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(0);
  });
});
