import { test, expect, type Locator, type Page } from '@playwright/test';
import { nextSheet } from '../support/sheets';

const SIZES = [
  { name: 'desktop', viewport: { width: 1280, height: 800 } },
  { name: '360×640', viewport: { width: 360, height: 640 } },
] as const;

type Answer = 'Sí' | 'No' | 'No lo sé';

interface Policy {
  readonly line?: string;
  readonly cover?: string;
  readonly mortgage?: Answer;
  readonly expires: string;
  readonly distance?: Answer;
  readonly concluded?: string;
  readonly received?: Answer;
  readonly receivedOn?: string;
  readonly notice?: { readonly on: string; readonly previous: string; readonly next: string };
}

const sheet = (page: Page, name: string) => page.getByRole('group', { name, exact: true });
const choose = (scope: Locator, name: string, value: string) =>
  scope.getByRole('group', { name, exact: true }).getByLabel(value, { exact: true }).check();
const result = (page: Page) => page.locator('#resultado');
const card = (page: Page, title: string) =>
  result(page)
    .locator('[data-item]')
    .filter({ has: page.getByRole('heading', { name: title }) });

// No sheet is ever wider than the screen.
async function fits(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

// On a 360 × 640 phone, the sheet on screen sits whole above the buttons and inside the screen:
// nothing to scroll to.
async function fitsScreen(page: Page) {
  await fits(page);
  if ((page.viewportSize()?.width ?? 0) > 360) return;
  const box = await page.evaluate(() => {
    const visible = [...document.querySelectorAll<HTMLElement>('[data-sheet]')].find(
      (s) => !s.hidden,
    );
    const actions = document.querySelector<HTMLElement>('.actions');
    if (!visible || !actions) return null;
    const s = visible.getBoundingClientRect();
    const a = actions.getBoundingClientRect();
    return {
      id: visible.dataset['sheet'],
      sheetHeight: Math.round(s.height),
      bottom: s.bottom,
      actionsTop: a.top,
      actionsBottom: a.bottom,
      height: innerHeight,
    };
  });
  expect(box).not.toBeNull();
  if (box) {
    expect
      .soft(box.bottom, `the ${box.id} sheet (${box.sheetHeight} px) ends above the buttons`)
      .toBeLessThanOrEqual(box.actionsTop + 1);
    expect
      .soft(box.actionsBottom, `the buttons are on screen on the ${box.id} sheet`)
      .toBeLessThanOrEqual(box.height + 1);
  }
}

async function open(page: Page, today: string, viewport: { width: number; height: number }) {
  await page.clock.setFixedTime(new Date(`${today}T12:00:00`));
  await page.setViewportSize(viewport);
  await page.goto('seguros/');
}

async function fill(page: Page, p: Policy) {
  const policy = sheet(page, 'Tu póliza');
  await policy.getByLabel(p.line ?? 'Hogar', { exact: true }).check();
  await fitsScreen(page);
  await nextSheet(page);

  const cover = sheet(page, 'Más sobre tu póliza');
  if (p.cover) await choose(cover, '¿Qué cubre tu seguro de coche?', p.cover);
  if (p.line === undefined) await choose(cover, '¿La pide tu hipoteca?', p.mortgage ?? 'No');
  await fitsScreen(page);
  await nextSheet(page);

  const expiry = sheet(page, 'Cuándo vence');
  await choose(expiry, '¿Se renueva sola cada año?', 'Sí');
  await expiry.getByLabel('Día en que vence según tu póliza', { exact: true }).fill(p.expires);
  await fitsScreen(page);
  await nextSheet(page);

  const contracting = sheet(page, 'Cómo la contrataste');
  const distance = p.distance ?? 'No';
  await choose(
    contracting,
    '¿La contrataste por internet o por teléfono sin ver a nadie?',
    distance,
  );
  if (distance === 'No') {
    await expect(contracting.getByLabel('¿Cuándo la contrataste?')).toBeHidden();
  } else if (p.concluded) {
    await contracting.getByLabel('¿Cuándo la contrataste?', { exact: true }).fill(p.concluded);
  }
  await fitsScreen(page);
  await nextSheet(page);

  // The terms are asked only of a policy that may have been bought at a distance.
  const terms = sheet(page, 'Las condiciones del contrato');
  if (distance === 'No') {
    await expect(terms).toBeHidden();
  } else {
    await choose(terms, '¿Has recibido las condiciones del contrato?', p.received ?? 'Sí');
    if (p.receivedOn)
      await terms.getByLabel('Día en que las recibiste', { exact: true }).fill(p.receivedOn);
    await fitsScreen(page);
    await nextSheet(page);
  }

  const renewal = sheet(page, 'El aviso de renovación');
  await choose(
    renewal,
    '¿Te ha llegado el aviso de renovación de la aseguradora?',
    p.notice ? 'Sí' : 'No',
  );
  if (p.notice) {
    await renewal.getByLabel('Día en que te llegó el aviso', { exact: true }).fill(p.notice.on);
    await fitsScreen(page);
    await nextSheet(page);
    const premiums = sheet(page, 'La prima');
    await premiums
      .getByLabel('Prima del periodo que acaba', { exact: true })
      .fill(p.notice.previous);
    await premiums.getByLabel('Prima del periodo siguiente', { exact: true }).fill(p.notice.next);
    await fitsScreen(page);
    await nextSheet(page);
    await choose(
      sheet(page, 'Otros cambios'),
      '¿El aviso cambia algo además del precio, como coberturas o franquicias?',
      'No',
    );
    await fitsScreen(page);
    await page.getByRole('button', { name: 'Revisar' }).click();
  } else {
    // Without a notice there are no figures to ask: this sheet closes the walk.
    await fitsScreen(page);
    await page.getByRole('button', { name: 'Siguiente' }).click();
  }
  await expect(page.getByRole('heading', { name: 'Resultado', level: 2 })).toBeFocused();
  await fits(page);
}

for (const { name, viewport } of SIZES) {
  test.describe(name, () => {
    test('a late notice of changes, with the non-renewal deadline still open', async ({ page }) => {
      await open(page, '2027-01-25', viewport);
      await fill(page, {
        expires: '2027-03-01',
        notice: { on: '2027-01-20', previous: '300,00', next: '345,00' },
      });
      await expect(card(page, 'Comunicar que no renuevas')).toContainText(
        'Te quedan 7 días (hasta el 01-02-2027)',
      );
      await expect(card(page, 'Comunicar que no renuevas')).toContainText(
        'tiene que llegar a la aseguradora como tarde el 01-02-2027',
      );
      await expect(card(page, 'Comunicar que no renuevas')).toContainText(
        'Si tu póliza vence a las 00:00 h de ese día, el periodo acaba el día anterior: cuenta un día menos.',
      );
      await expect(card(page, 'Aviso de cambios antes del vencimiento')).toContainText(
        'Llegó con 40 días de antelación: la ley pide al menos dos meses',
      );
      await expect(card(page, 'Prima del periodo siguiente')).toContainText(
        'Tu prima sube un 15 % (45,00 €)',
      );
      await expect(result(page)).toContainText('Ley de Contrato de Seguro, art. 22.3');
      await expect(result(page)).toContainText(
        'Servicio de Reclamaciones de la Dirección General de Seguros y Fondos de Pensiones',
      );
    });

    test('the non-renewal deadline once it has ended', async ({ page }) => {
      await open(page, '2027-02-10', viewport);
      await fill(page, { expires: '2027-03-01' });
      await expect(card(page, 'Comunicar que no renuevas')).toContainText(
        'El plazo terminó el 01-02-2027',
      );
      await expect(card(page, 'Aviso de cambios antes del vencimiento')).toContainText(
        'No lo has metido',
      );
    });

    test('a motor policy bought online: compulsory cover out, voluntary covers to review', async ({
      page,
    }) => {
      await open(page, '2026-10-09', viewport);
      await fill(page, {
        line: 'Coche',
        cover: 'También coberturas voluntarias, como daños propios, lunas o robo',
        expires: '2027-10-01',
        distance: 'Sí',
        concluded: '2026-10-01',
        received: 'No lo sé',
      });
      await expect(card(page, 'Desistir: seguro obligatorio del coche')).toContainText('No aplica');
      await expect(result(page)).toContainText(
        'Sin el día en que recibiste la póliza no se puede dar una fecha',
      );
      await expect(result(page)).not.toContainText('Con tus fechas, ese mes llega hasta el');
      await expect(card(page, 'Desistir: coberturas voluntarias del coche')).toContainText(
        'Revísalo',
      );
    });

    test('a home policy bought online counts from the receipt of the terms', async ({ page }) => {
      await open(page, '2026-10-09', viewport);
      await fill(page, {
        expires: '2027-10-01',
        distance: 'Sí',
        concluded: '2026-10-01',
        receivedOn: '2026-10-05',
      });
      const withdrawal = card(page, 'Desistir de un seguro contratado a distancia');
      await expect(withdrawal).toContainText('Te quedan 10 días (hasta el 19-10-2026)');
      await expect(withdrawal).toContainText('desde que recibes las condiciones del contrato');
      await expect(result(page)).toContainText('Con tus fechas, ese mes llega hasta el 05-11-2026');
    });
  });
}

test('a life policy stops at the first sheet, with why', async ({ page }) => {
  await open(page, '2026-10-09', { width: 360, height: 640 });
  await sheet(page, 'Tu póliza').getByLabel('Vida', { exact: true }).check();
  await expect(page.getByLabel('Día en que vence según tu póliza')).toBeHidden();
  await nextSheet(page);
  await expect(page.getByRole('heading', { name: 'Resultado', level: 2 })).toBeFocused();
  await expect(result(page)).toContainText('los seguros de vida tienen reglas propias');
  await expect(result(page).locator('[data-item]')).toHaveCount(0);
  await fits(page);
});

test('a missing expiry date is named and the visit stays on the sheet', async ({ page }) => {
  await open(page, '2026-10-09', { width: 1280, height: 800 });
  const policy = sheet(page, 'Tu póliza');
  await policy.getByLabel('Hogar', { exact: true }).check();
  await nextSheet(page);
  await choose(sheet(page, 'Más sobre tu póliza'), '¿La pide tu hipoteca?', 'No');
  await nextSheet(page);
  const expiry = sheet(page, 'Cuándo vence');
  await choose(expiry, '¿Se renueva sola cada año?', 'Sí');
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(expiry.getByText('Falta este dato')).toBeVisible();
  await expect(sheet(page, 'Cómo la contrataste')).toBeHidden();
});

test('the page shows when it was reviewed and makes no request', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith('http://localhost')) requests.push(r.url());
  });
  await open(page, '2026-10-09', { width: 1280, height: 800 });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Las fechas de tu seguro de hogar o de coche',
  );
  await expect(page.getByText(/^Revisado el /)).toBeVisible();
  await page.goto('');
  await page.getByRole('link', { name: 'Seguros', exact: true }).click();
  await expect(page).toHaveURL(/seguros\/(#poliza)?$/);
  expect(requests).toEqual([]);
});
