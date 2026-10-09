import { test, expect, type Locator, type Page, type Request } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Runs only against a TEST_DOCUMENTS=1 build, which has /financiacion/ and /seguros/ too: every
// request to the fake API, to Turnstile and to Stripe is answered here. The credit, the policy and
// the companies are synthetic.

const ORIGIN = `http://localhost:${process.env['E2E_PORT'] ?? 4321}`;
const API = {
  extract: 'https://extract.api.eslojusto.test/',
  checkout: 'https://checkout.api.eslojusto.test/',
  pass: 'https://pass.api.eslojusto.test/',
};
const STRIPE = 'https://checkout.stripe.com/c/pay/cs_test_e2e';
// The norms and the Bank of Spain series are read as loaded on this day.
const TODAY = new Date('2026-10-09T12:00:00');

const b64url = (v: object) => Buffer.from(JSON.stringify(v)).toString('base64url');
const expiresAt = Math.floor(Date.now() / 1000) + 7 * 86400;
const PASS = `v1.${b64url({ typ: 'pass', sid: 'cs_test_e2e', exp: expiresAt })}.c2ln`;

type Entries = readonly (readonly [string, string])[];

// A personal loan of 10.500 € from 15-02-2019, 761,25 € of opening charge taken off, 48 × 273,35 €
// at a 12 % stated APR, with 5.000 € repaid on 15-02-2021, two years before its end, for 120 € of
// compensation: 70 € over the 1 % cap.
const LOAN: Entries = [
  ['product', 'personal_loan'],
  ['purpose', 'personal'],
  ['principal', '10.500,00'],
  ['agreedOn', '2019-02-15'],
  ['drawnOn', '2019-02-15'],
  ['nominalRate', '12'],
  ['rateType', 'fixed'],
  ['aprStated', 'yes'],
  ['declaredApr', '12'],
  ['instalmentCount', '48'],
  ['instalmentAmount', '273,35'],
  ['firstDueOn', '2019-03-15'],
  ['hasBalloon', 'no'],
  ['openingFee', '761,25'],
  ['openingHow', 'deducted'],
  ['hasInsurance', 'no'],
  ['confirmedApr', 'declared'],
  ['repaid', 'yes'],
  ['repaidOn', '2021-02-15'],
  ['principalRepaid', '5.000,00'],
  ['compensation', '120,00'],
  ['agreedEndOn', '2023-02-15'],
  ['paidByInsurance', 'no'],
  ['infoReceived', 'yes'],
];

// A home policy that renews itself and expires on 01-03-2027: notice of not renewing runs to
// 01-02-2027.
const POLICY: Entries = [
  ['line', 'home'],
  ['mortgageRequired', 'no'],
  ['renews', 'yes'],
  ['expiresOn', '2027-03-01'],
  ['distance', 'no'],
  ['hasNotice', 'no'],
];

interface Fake {
  readonly checkout: Request[];
  readonly pass: Request[];
  // Every request that left the site, other than Turnstile's script.
  readonly outside: string[];
}

async function fakeServices(page: Page): Promise<Fake> {
  const fake: Fake = { checkout: [], pass: [], outside: [] };
  await page.clock.setFixedTime(TODAY);
  page.on('request', (r) => {
    if (!r.url().startsWith(ORIGIN)) fake.outside.push(r.url());
  });
  await page.route('https://challenges.cloudflare.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.turnstile = { render(el, o) { setTimeout(() => o.callback(o.action + '-token')); return 'w'; }, remove() {} };`,
    }),
  );
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
      headers: { location: `${ORIGIN}/financiacion/?session_id=cs_test_e2e` },
    }),
  );
  return fake;
}

// The answers wait in the session as they do for the trip to Stripe, and the page reviews them on
// arrival.
async function arriveWith(page: Page, path: string, key: string, entries: Entries) {
  await page.addInitScript(
    ([k, v]) => {
      if (sessionStorage.getItem('e2e-seeded') === null) {
        sessionStorage.setItem(k, v);
        sessionStorage.setItem('e2e-seeded', '1');
      }
    },
    [key, JSON.stringify(entries)] as const,
  );
  await page.goto(path);
  await expect(page.getByRole('heading', { name: 'Resultado', level: 2 })).toBeVisible();
}

async function downloadOf(page: Page, button: Locator): Promise<string> {
  const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
  const path = await download.path();
  expect(readFileSync(path).subarray(0, 5).toString()).toBe('%PDF-');
  return download.suggestedFilename();
}

// No page is ever wider than the screen.
async function fits(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test('the letter that says a policy is not renewed downloads free, with nothing sent', async ({
  page,
}) => {
  const fake = await fakeServices(page);
  await page.setViewportSize({ width: 360, height: 640 });
  await arriveWith(page, 'seguros/', 'eslojusto-revision-seguros-en-pago', POLICY);
  const offer = page.locator('[data-pass-offer]');
  await expect(
    offer.getByRole('heading', { name: 'Carta que puedes descargar gratis' }),
  ).toBeVisible();
  // There is nothing to sell on this review.
  await expect(offer.getByRole('button', { name: 'Pagar 4,99 €' })).toBeHidden();
  await expect(offer.getByText('Pagar 4,99 €')).toBeHidden();
  await offer.getByLabel('Aseguradora', { exact: true }).fill('Aseguradora Ficticia, S.A.');
  await offer.getByLabel('Número de póliza', { exact: true }).fill('HOG-0000-TEST');
  await fits(page);
  const button = offer.getByRole('button', {
    name: 'Descargar la carta para comunicar que no renuevas (PDF, gratis)',
  });
  expect(await downloadOf(page, button)).toBe('eslojusto-carta-no-renovacion-seguro.pdf');
  expect(fake.outside).toEqual([]);
});

test('a policy whose deadline has passed offers no letter', async ({ page }) => {
  await fakeServices(page);
  await arriveWith(page, 'seguros/', 'eslojusto-revision-seguros-en-pago', [
    ...POLICY.filter(([name]) => name !== 'expiresOn'),
    ['expiresOn', '2026-11-01'],
  ]);
  await expect(page.locator('[data-pass-offer]')).toBeHidden();
});

test('the credit information letter is free; the pass unlocks the report and the early repayment letter', async ({
  page,
}) => {
  const fake = await fakeServices(page);
  await page.setViewportSize({ width: 360, height: 640 });
  await arriveWith(page, 'financiacion/', 'eslojusto-revision-financiacion-en-pago', LOAN);
  const offer = page.locator('[data-pass-offer]');
  await expect(offer.getByRole('heading', { name: 'El informe y la carta' })).toBeVisible();
  const free = offer.getByRole('button', {
    name: 'Descargar la carta que pide la información de tu crédito (PDF, gratis)',
  });
  const paid = offer.getByRole('button', {
    name: 'Descargar la carta sobre la compensación por devolverlo antes (PDF)',
  });
  await expect(paid).toBeHidden();
  await expect(offer.getByRole('button', { name: 'Descargar el informe (PDF)' })).toBeHidden();
  await offer
    .getByLabel('Entidad que te dio el crédito', { exact: true })
    .fill('Financiera Ficticia');
  await fits(page);
  expect(await downloadOf(page, free)).toBe('eslojusto-carta-informacion-credito.pdf');
  expect(fake.outside).toEqual([]);

  // The pass: paid on Stripe and back to the review, with its answers.
  await offer.getByLabel(/Quiero el informe ahora/).check();
  await offer.getByRole('button', { name: 'Pagar 4,99 €' }).click();
  await expect(paid).toBeVisible();
  await expect(page).toHaveURL(`${ORIGIN}/financiacion/#resultado`);
  expect(fake.checkout).toHaveLength(1);
  expect(fake.checkout[0]?.postDataJSON()).toMatchObject({ returnTo: 'credit' });
  expect(fake.pass).toHaveLength(1);
  expect(
    await downloadOf(page, offer.getByRole('button', { name: 'Descargar el informe (PDF)' })),
  ).toBe('eslojusto-informe-credito.pdf');
  await fits(page);
  expect(await downloadOf(page, paid)).toBe('eslojusto-carta-compensacion-credito.pdf');
  // The answers taken to Stripe are gone once back.
  expect(
    await page.evaluate(() => sessionStorage.getItem('eslojusto-revision-financiacion-en-pago')),
  ).toBeNull();
});

test('a credit with nothing to sell offers only the free letter', async ({ page }) => {
  await fakeServices(page);
  await arriveWith(page, 'financiacion/', 'eslojusto-revision-financiacion-en-pago', [
    ...LOAN.filter(
      ([name]) =>
        ![
          'declaredApr',
          'repaid',
          'repaidOn',
          'principalRepaid',
          'compensation',
          'agreedEndOn',
          'paidByInsurance',
        ].includes(name),
    ),
    ['declaredApr', '16,61'],
    ['repaid', 'no'],
  ]);
  const offer = page.locator('[data-pass-offer]');
  await expect(
    offer.getByRole('heading', { name: 'Carta que puedes descargar gratis' }),
  ).toBeVisible();
  await expect(offer.getByRole('button', { name: 'Pagar 4,99 €' })).toBeHidden();
  await expect(
    offer.getByRole('button', {
      name: 'Descargar la carta que pide la información de tu crédito (PDF, gratis)',
    }),
  ).toBeVisible();
});
