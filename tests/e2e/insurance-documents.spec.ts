import { test, expect, type Page, type Request } from '@playwright/test';
import { syntheticPhoto } from '../support/synthetic-photo';
import { fitsScreen, nextSheet as next } from '../support/sheets';
import { expectShownAndFocused } from '../support/reads';

// Runs only against a TEST_DOCUMENTS=1 build, which has /seguros/ too: every request to the fake
// API and to Turnstile is answered here. The documents and figures are synthetic.

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
const readPage = (n: number, kind: string) => ({
  page: n,
  kind,
  document: n,
  readability: { value: 'ok', confidence: 'high' },
  confidence: 'high',
});

const POLICY = 'insurance_policy';
const NOTICE = 'insurance_renewal_notice';

// A synthetic home policy taken out online, and the notice of its renewal with a higher premium.
const PACK = {
  code: 'ok',
  extraction: {
    pages: [readPage(1, POLICY), readPage(2, NOTICE)],
    documents: [
      { kind: POLICY, pages: [1] },
      { kind: NOTICE, pages: [2] },
    ],
    fields: {
      line: from(POLICY, 'home'),
      insurerName: from(POLICY, 'Aseguradora Ficticia, S.A.'),
      concludedOn: from(POLICY, '2025-11-20'),
      expiresOn: from(NOTICE, '2026-12-01'),
      renews: from(POLICY, true),
      channel: from(POLICY, 'online'),
      nonRenewalClauseText: from(
        POLICY,
        'El contrato se prorrogará por periodos anuales salvo que una de las partes se oponga a la prórroga.',
      ),
      noticeOn: from(NOTICE, '2026-09-20'),
      previousPremium: from(NOTICE, 300),
      newPremium: from(NOTICE, 345),
      coverChanges: from(NOTICE, false),
    },
    lists: { sumsInsured: [] },
    conflicts: [],
  },
  failedChecks: [],
  allowance: 'v1.quota.e2e',
};

// A read of `kinds`, one page each, with what it states.
function reading(kinds: readonly string[], fields: object) {
  return {
    ...PACK,
    extraction: {
      pages: kinds.map((kind, i) => readPage(i + 1, kind)),
      documents: kinds.map((kind, i) => ({ kind, pages: [i + 1] })),
      fields,
      lists: { sumsInsured: [] },
      conflicts: [],
    },
  };
}

// Each read is answered with the next body, in order.
async function fakeServices(page: Page, bodies: readonly object[] = [PACK]): Promise<Request[]> {
  const queue = [...bodies];
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
    return route.fulfill({ json: queue.shift() });
  });
  return sent;
}

async function read(page: Page, files: readonly string[]) {
  await page.getByLabel('Elegir fotos o PDF').setInputFiles(files.map(photo));
  await page.getByLabel(/Doy mi consentimiento explícito/).check();
  await page.getByRole('button', { name: 'Leer los documentos' }).click();
  await expectShownAndFocused(page.getByRole('heading', { name: 'Datos leídos' }));
}

const sheet = (page: Page, name: string) => page.getByRole('group', { name, exact: true });
const markOf = (page: Page, field: string) => page.locator(`[data-field="${field}"] > .read-mark`);
const group = (page: Page, sheetName: string, question: string) =>
  sheet(page, sheetName).getByRole('group', { name: question, exact: true });

test('the page opens on the choice between reading documents and typing', async ({ page }) => {
  await page.goto('seguros/');
  await expect(page.getByRole('heading', { name: '¿Cómo quieres empezar?' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Sube tu póliza y, si lo tienes, el aviso de renovación/ }),
  ).toBeVisible();
  await expect(page.locator('#insurance')).toBeHidden();
  await page.getByRole('button', { name: /Rellenar a mano/ }).click();
  await expect(page.getByRole('heading', { name: 'Tu póliza', level: 2 })).toBeFocused();
});

test('a policy and its renewal notice fill the sheets, the notice date to be checked', async ({
  page,
}) => {
  const sent = await fakeServices(page);
  await page.goto('seguros/');
  await page.getByRole('button', { name: /^Sube tu póliza/ }).click();
  await page
    .getByLabel('Elegir fotos o PDF')
    .setInputFiles([photo('poliza-ficticia.png'), photo('aviso-ficticio.png')]);
  await page.getByLabel(/Doy mi consentimiento explícito/).check();
  await page.getByRole('button', { name: 'Leer los documentos' }).click();
  await expectShownAndFocused(page.getByRole('heading', { name: 'Datos leídos' }));

  expect(sent[0]?.postDataJSON()).toMatchObject({ review: 'insurance', quota: null });
  await expect(page.getByText('Póliza del seguro · Aviso de renovación del seguro')).toBeVisible();
  await expect(page.getByText(/^La fecha del aviso es la que lleva el documento/)).toBeVisible();

  await page.getByRole('button', { name: 'Revisar los datos' }).click();
  await expect(sheet(page, 'Tu póliza').getByLabel('Hogar')).toBeChecked();
  await next(page);
  await group(page, 'Más sobre tu póliza', '¿La pide tu hipoteca?')
    .getByLabel('No', { exact: true })
    .check();
  await next(page);
  const expiry = sheet(page, 'Cuándo vence');
  await expect(expiry.getByLabel('Día en que vence según tu póliza')).toHaveValue('2026-12-01');
  await expiry.getByText('Lo que dice tu póliza sobre su duración y su prórroga').click();
  await expect(expiry.locator('[data-read-quote="renews"] blockquote')).toHaveText(
    'El contrato se prorrogará por periodos anuales salvo que una de las partes se oponga a la prórroga.',
  );
  await next(page);
  await expect(
    group(
      page,
      'Cómo la contrataste',
      '¿La contrataste por internet o por teléfono sin ver a nadie?',
    ).getByLabel('Sí'),
  ).toBeChecked();
  await expect(markOf(page, 'distance')).toHaveText(
    'Sale de lo leído en tus documentos · confianza media',
  );
  await next(page);
  await group(page, 'Las condiciones del contrato', '¿Has recibido las condiciones del contrato?')
    .getByLabel('No lo sé')
    .check();
  await next(page);
  await expect(
    sheet(page, 'El aviso de renovación').getByLabel('Día en que te llegó el aviso'),
  ).toHaveValue('2026-09-20');
  await expect(markOf(page, 'noticeReceivedOn')).toContainText('confianza baja');
  await next(page);
  const premiums = sheet(page, 'La prima');
  await expect(premiums.getByLabel('Prima del periodo que acaba')).toHaveValue('300,00');
  await expect(premiums.getByLabel('Prima del periodo siguiente')).toHaveValue('345,00');
  await next(page);
  await expect(sheet(page, 'Otros cambios').getByLabel('No', { exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Revisar' }).click();
  await expect(page.getByRole('heading', { name: 'Resultado', level: 2 })).toBeFocused();
  await expect(page.locator('#resultado [data-item]').first()).toBeVisible();
});

test('on a phone, every sheet a read fills keeps its buttons on screen, long words folded', async ({
  page,
}) => {
  const LONG = 'El contrato se prorrogará tácitamente por periodos anuales sucesivos. '.repeat(10);
  const fields = {
    ...PACK.extraction.fields,
    nonRenewalClauseText: from(POLICY, LONG.slice(0, 600)),
    coverChanges: from(NOTICE, true),
    changesText: from(NOTICE, LONG.slice(0, 600)),
  };
  await page.setViewportSize({ width: 360, height: 640 });
  await fakeServices(page, [reading([POLICY, NOTICE], fields)]);
  await page.goto('seguros/');
  await page.getByRole('button', { name: /^Sube tu póliza/ }).click();
  await read(page, ['poliza-ficticia.png', 'aviso-ficticio.png']);
  await page.getByRole('button', { name: 'Revisar los datos' }).click();
  await expect(page.getByRole('heading', { name: 'Tu póliza', level: 2 })).toBeFocused();

  const visible = page.locator('[data-sheet]:not([hidden])');
  for (;;) {
    const id = await visible.getAttribute('data-sheet');
    await fitsScreen(page, { whole: false });
    if (id === 'cobertura')
      await group(page, 'Más sobre tu póliza', '¿La pide tu hipoteca?')
        .getByLabel('No', { exact: true })
        .check();
    if (id === 'condiciones')
      await group(
        page,
        'Las condiciones del contrato',
        '¿Has recibido las condiciones del contrato?',
      )
        .getByLabel('No lo sé')
        .check();
    if (id === 'vencimiento' || id === 'cambios') {
      const quote = visible.locator('[data-read-quote]');
      await expect(quote.locator('blockquote')).toBeHidden();
      // Folded, words of 600 characters take its label, not a screen.
      expect((await quote.boundingBox())?.height).toBeLessThan(100);
      await quote.getByText(/^Lo que dice/).click();
      await expect(quote.locator('blockquote')).toHaveText(LONG.slice(0, 600));
    }
    if (id === 'cambios') break;
    await next(page);
  }
});

test('the renewal notice read after the policy adds to it and keeps its end date', async ({
  page,
}) => {
  const FIRST = reading([POLICY], {
    line: from(POLICY, 'car'),
    carCover: from(POLICY, 'with_voluntary'),
    expiresOn: from(POLICY, '2026-12-01'),
    renews: from(POLICY, true),
  });
  // The notice states another end date and the premiums the policy left out.
  const SECOND = reading([NOTICE], {
    expiresOn: from(NOTICE, '2026-12-15'),
    previousPremium: from(NOTICE, 410),
    newPremium: from(NOTICE, 452.5),
  });
  await fakeServices(page, [FIRST, SECOND]);
  await page.goto('seguros/');
  await page.getByRole('button', { name: /^Sube tu póliza/ }).click();
  await read(page, ['poliza-ficticia.png']);
  await page.getByRole('button', { name: 'Subir más documentos' }).click();
  await expect(page.getByRole('heading', { name: 'Sube tus documentos' })).toBeFocused();
  await read(page, ['aviso-ficticio.png']);
  await expect(
    page
      .locator('[data-done-notes] li')
      .filter({ hasText: /no dice lo mismo que lo leído antes: se ha dejado lo que ya había/ }),
  ).toHaveCount(1);

  await page.getByRole('button', { name: 'Revisar los datos' }).click();
  await expect(sheet(page, 'Tu póliza').getByLabel('Coche')).toBeChecked();
  const form = page.locator('#insurance');
  await expect(form.locator('[name="expiresOn"]')).toHaveValue('2026-12-01');
  await expect(markOf(page, 'expiresOn')).toHaveText(
    'Leído del documento · otro documento dice otra cosa: compáralos',
  );
  await expect(form.locator('[name="hasNotice"][value="yes"]')).toBeChecked();
  await expect(form.locator('[name="previousPremium"]')).toHaveValue('410,00');
  await expect(form.locator('[name="newPremium"]')).toHaveValue('452,50');
});
