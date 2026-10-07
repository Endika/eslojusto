import { readFileSync } from 'node:fs';
import { test, expect, type Page, type Request } from '@playwright/test';

// Runs only against a TEST_DOCUMENTS=1 build, whose API is a fake origin: every request to it,
// to Turnstile and to Stripe is answered here. The documents are synthetic.

const ORIGIN = `http://localhost:${process.env['E2E_PORT'] ?? 4321}`;
const API = 'https://api.eslojusto.test';
const STRIPE = 'https://checkout.stripe.com/c/pay/cs_test_e2e';

// A 40×30 red PNG: the browser decodes it and sends it on as a JPEG.
const PHOTO = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAACgAAAAeCAIAAADRv8uKAAAALElEQVR4nO3NMQ0AAAgDsClBBP4FIAsZcDTp30zXiYjFYrFYLBaLxWKx+G+8uBAgzDALZFoAAAAASUVORK5CYII=',
  'base64',
);

const b64url = (v: object) => Buffer.from(JSON.stringify(v)).toString('base64url');
const expiresAt = Math.floor(Date.now() / 1000) + 7 * 86400;
const PASS = `v1.${b64url({ typ: 'pass', sid: 'cs_test_e2e', exp: expiresAt })}.c2ln`;

const SETTLEMENT = {
  code: 'ok',
  extraction: {
    kind: 'settlement',
    fields: {
      detectedKind: { value: 'settlement', confidence: 'high' },
      cause: { value: 'unfair_dismissal', confidence: 'high' },
      startDate: { value: '2010-03-01', confidence: 'high' },
      endDate: { value: '2026-09-15', confidence: 'medium' },
      monthlySalary: { value: 2142.86, confidence: 'high' },
      severance: { value: 40000, confidence: 'low' },
    },
    lists: {},
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
): Promise<Fake> {
  const fake: Fake = { extract: [], checkout: [], pass: [], other: [] };
  await page.route('https://challenges.cloudflare.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.turnstile = { render(el, o) { setTimeout(() => o.callback(o.action + '-token')); return 'w'; }, remove() {} };`,
    }),
  );
  await page.route(`${API}/extract`, (route) => {
    fake.extract.push(route.request());
    return route.fulfill({ status: extract.status, json: extract.body });
  });
  await page.route(`${API}/checkout`, (route) => {
    fake.checkout.push(route.request());
    return route.fulfill({ json: { code: 'ok', sessionId: 'cs_test_e2e', url: STRIPE } });
  });
  await page.route(`${API}/pass`, (route) => {
    fake.pass.push(route.request());
    return route.fulfill({ json: { code: 'ok', pass: PASS, expiresAt, readsLeft: 15 } });
  });
  // Stripe takes the payment and sends the person back with the session id.
  await page.route('https://checkout.stripe.com/**', (route) =>
    route.fulfill({
      status: 302,
      headers: { location: `${ORIGIN}/finiquito/?session_id=cs_test_e2e` },
    }),
  );
  page.on('request', (r) => {
    const { origin } = new URL(r.url());
    if (
      ![ORIGIN, API, 'https://challenges.cloudflare.com', 'https://checkout.stripe.com'].includes(
        origin,
      )
    )
      fake.other.push(r.url());
  });
  return fake;
}

async function uploadSettlement(page: Page, { read = true } = {}) {
  await page.getByRole('button', { name: /Sube tu finiquito, nóminas o vida laboral/ }).click();
  await expect(page.getByRole('heading', { name: 'Sube un documento' })).toBeFocused();
  await page.getByLabel('Propuesta de finiquito').check();
  await page.getByLabel('Fotos o PDF').setInputFiles({
    name: 'finiquito-sintetico.png',
    mimeType: 'image/png',
    buffer: PHOTO,
  });
  await page.getByLabel(/Doy mi consentimiento explícito/).check();
  await page.getByRole('button', { name: 'Leer el documento' }).click();
  if (read) await expect(page.getByRole('heading', { name: 'Datos leídos' })).toBeFocused();
}

test('the page opens on the choice, and the CSP names only the API and Turnstile', async ({
  page,
}) => {
  await page.goto('finiquito/');
  await expect(page.getByRole('heading', { name: '¿Cómo quieres empezar?' })).toBeVisible();
  await expect(page.locator('#calculator')).toBeHidden();
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute(
    'content',
    /connect-src https:\/\/api\.eslojusto\.test https:\/\/challenges\.cloudflare\.com; frame-src https:\/\/challenges\.cloudflare\.com;/,
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
  expect(sent).toMatchObject({ kind: 'settlement', captchaToken: 'extract-token', quota: null });
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
  await page.getByLabel('Días naturales disfrutados').fill('0');
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
  expect(fake.other).toEqual([]);
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
    await page.getByRole('button', { name: /Sube tu finiquito/ }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Sube un documento' })).toBeFocused();
    expect(await overflow(), scheme).toBeLessThanOrEqual(0);
    await page.getByRole('button', { name: 'Leer el documento' }).click();
    await expect(page.getByLabel('Propuesta de finiquito')).toBeFocused();
  }
});

test('the privacy page and the legal notice describe documents and the pass', async ({ page }) => {
  await page.goto('privacidad/');
  const privacy = page.locator('main');
  await expect(privacy).toContainText('Documentos y pagos');
  await expect(privacy).toContainText('arts. 6.1.a y 9.2.a');
  await expect(privacy).toContainText('Amazon Bedrock');
  await expect(privacy).toContainText('Stripe');
  await expect(privacy).toContainText('Cloudflare Turnstile');
  await expect(privacy).toContainText('eslojusto-pase');
  await page.goto('aviso-legal/');
  await expect(page.locator('#condiciones')).toContainText('Condiciones de venta del pase');
  await expect(page.locator('main')).toContainText('art. 103.m');
  await page.goto('finiquito/');
  await expect(page.locator('#faq-documentos')).toContainText('¿Qué pasa con mis documentos?');
});
