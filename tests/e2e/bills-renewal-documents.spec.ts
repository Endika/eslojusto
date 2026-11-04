import { test, expect, type Page } from '@playwright/test';
import { syntheticPhoto } from '../support/synthetic-photo';
import { forwardButton, noSideScroll } from '../support/sheets';
import { expectShownAndFocused } from '../support/reads';

// Runs only against a TEST_DOCUMENTS=1 build, which has /facturas/renovacion/ too: every request
// to the fake API and to Turnstile is answered here. The letter and its figures are synthetic.

const EXTRACT = 'https://extract.api.eslojusto.test/';
const TODAY = new Date('2026-11-25T12:00:00');
const PHOTO = syntheticPhoto();

const field = (value: string | number | boolean) => ({
  value,
  confidence: 'high',
  source: 'price_change_notice',
});

// The Naturgy letter of 31-10-2026 that renews on 10-12-2026.
const LETTER = {
  code: 'ok',
  extraction: {
    pages: [
      {
        page: 1,
        kind: 'price_change_notice',
        document: 1,
        readability: { value: 'ok', confidence: 'high' },
        confidence: 'high',
      },
    ],
    documents: [{ kind: 'price_change_notice', pages: [1] }],
    fields: {
      letterDate: field('2026-10-31'),
      renewalDate: field('2026-12-10'),
      powerKwP1: field(5.75),
      powerKwP2: field(5.75),
      powerUnit: field('per_kw_day'),
      currentPowerP1: field(0.110283),
      currentPowerP2: field(0.033469),
      nextPowerP1: field(0.12303),
      nextPowerP2: field(0.052329),
      currentEnergy: field(0.144972),
      nextEnergy: field(0.1678),
      annualKwh: field(4190.2),
      declaredWithoutTax: field(1071.15),
      declaredWithTax: field(1362.36),
      separateFromBill: field(true),
      fixedPrice: field(false),
      isRenewal: field(true),
    },
    lists: {},
    conflicts: [],
  },
  failedChecks: [],
  allowance: 'v1.quota.e2e',
};

async function fakeServices(page: Page) {
  await page.clock.setFixedTime(TODAY);
  await page.route('https://challenges.cloudflare.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.turnstile = { render(el, o) { setTimeout(() => o.callback(o.action + '-token')); return 'w'; }, remove() {} };`,
    }),
  );
  const sent: unknown[] = [];
  await page.route(EXTRACT, (route) => {
    sent.push(route.request().postDataJSON());
    return route.fulfill({ json: LETTER });
  });
  return sent;
}

test('a renewal letter read fills the sheets and gives the same result as typing it', async ({
  page,
}) => {
  const sent = await fakeServices(page);
  await page.goto('facturas/renovacion/');
  await expect(page.locator('[data-pass-offer]')).toHaveCount(0);
  await page.getByRole('button', { name: /^Sube la carta de renovación/ }).click();
  await page
    .getByLabel('Elegir fotos o PDF')
    .setInputFiles({ name: 'carta.png', mimeType: 'image/png', buffer: PHOTO });
  await page.getByLabel(/Doy mi consentimiento explícito/).check();
  await page.getByRole('button', { name: 'Leer los documentos' }).click();
  await expectShownAndFocused(page.getByRole('heading', { name: 'Datos leídos' }));
  expect(sent[0]).toMatchObject({ review: 'renewal', captchaToken: 'extract-token' });

  await page.getByRole('button', { name: 'Revisar los datos' }).click();
  const result = page.getByRole('heading', { name: 'Resultado', level: 2 });
  for (let i = 0; i < 20 && !(await result.isVisible()); i += 1) {
    await (await forwardButton(page)).click();
    await page.waitForFunction(() =>
      document.getAnimations().every((a) => a.playState !== 'running'),
    );
  }
  await expect(result).toBeFocused();
  const review = page.locator('#resultado');
  await expect(review.locator('[data-lead]')).toContainText('1.071,15 €');
  await expect(review.locator('[data-lead]')).toContainText('+17,8 %');
  await expect(review.locator('[data-renewal]')).toContainText('18,37 €/kW·año');
  await expect(review.locator('[data-renewal]')).toContainText('40 días');
  await noSideScroll(page);
});
