import { test, expect, type Locator, type Page } from '@playwright/test';
import { fitsScreen, noSideScroll } from '../support/sheets';

// Runs only against a build with /financiacion/ (TEST_CREDIT=1). The norms and the Bank of Spain
// series are read as loaded on this day, so the clock is fixed.
const TODAY = '2026-10-09';

const SIZES = [
  { name: 'desktop', viewport: { width: 1280, height: 800 } },
  { name: '360×640', viewport: { width: 360, height: 640 } },
] as const;
type Viewport = (typeof SIZES)[number]['viewport'];

type Answer = 'Sí' | 'No' | 'No lo sé';

interface Charge {
  readonly amount: string;
  readonly how: 'Me llegó menos dinero' | 'Se sumó al préstamo' | 'La pagué aparte';
}

interface Credit {
  readonly product: string;
  readonly purpose?: string;
  readonly principal: string;
  readonly agreed: string;
  readonly drawn?: string;
  readonly rate: string;
  readonly variable?: boolean;
  // Null: the contract does not state it.
  readonly apr: string | null;
  readonly total?: string;
  readonly instalments?: {
    readonly count: string;
    readonly amount: string;
    readonly first: string;
  };
  readonly opening?: Charge;
  readonly card?: { readonly payment: string; readonly balance?: string };
  readonly compare?: 'La que sale de las cifras que has metido' | 'La que dice tu contrato';
  readonly repaid?: {
    readonly on: string;
    readonly principal: string;
    readonly compensation: string;
    readonly end: string;
  };
  readonly received?: Answer;
}

const sheet = (page: Page, name: string) => page.getByRole('group', { name, exact: true });
const choose = (scope: Locator, name: string, value: string) =>
  scope.getByRole('group', { name, exact: true }).getByLabel(value, { exact: true }).check();
const type = (scope: Locator, label: string, value: string) =>
  scope.getByLabel(label, { exact: true }).fill(value);
const result = (page: Page) => page.locator('#resultado');
const card = (page: Page, title: string) =>
  result(page)
    .locator('[data-item]')
    .filter({ has: page.getByRole('heading', { name: title }) });

// Checks the sheet fits, then moves on with whichever button the sheet shows, and waits out the
// page turn: it moves in steps, so a click during it can land beside its target.
async function next(page: Page) {
  await fitsScreen(page);
  const review = page.getByRole('button', { name: 'Revisar' });
  if (await review.isVisible()) await review.click();
  else await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== 'running'),
  );
}

async function open(page: Page, viewport: Viewport) {
  await page.clock.setFixedTime(new Date(`${TODAY}T12:00:00`));
  await page.setViewportSize(viewport);
  await page.goto('financiacion/');
}

async function fill(page: Page, c: Credit) {
  const revolving = c.product === 'Tarjeta revolving';
  await choose(sheet(page, 'Tu crédito'), '¿Qué es?', c.product);
  await next(page);
  await choose(
    sheet(page, 'Para qué es'),
    '¿Para qué lo pediste?',
    c.purpose ?? 'Para mí o mi casa, fuera de mi trabajo o negocio',
  );
  await next(page);
  await type(
    sheet(page, 'El importe'),
    revolving ? 'Límite de la tarjeta' : 'Importe del préstamo',
    c.principal,
  );
  await next(page);
  const dates = sheet(page, 'Las fechas');
  await type(dates, '¿Cuándo lo contrataste?', c.agreed);
  if (!revolving) await type(dates, '¿Cuándo recibiste el dinero?', c.drawn ?? c.agreed);
  await next(page);
  if (!(await sheet(page, 'El interés').isVisible())) return;

  const rate = sheet(page, 'El interés');
  await type(rate, 'Tipo de interés nominal (TIN)', c.rate);
  if (!revolving)
    await choose(rate, '¿El interés es fijo o variable?', c.variable ? 'Variable' : 'Fijo');
  await next(page);

  const apr = sheet(page, 'La TAE del contrato');
  await choose(apr, '¿Tu contrato indica la TAE?', c.apr === null ? 'No' : 'Sí');
  if (c.apr !== null) await type(apr, 'TAE que dice tu contrato', c.apr);
  if (c.total) await type(apr, 'Importe total adeudado que dice tu contrato', c.total);
  await next(page);

  if (revolving) {
    const cardSheet = sheet(page, 'Tu tarjeta');
    await type(cardSheet, 'Lo que pagas cada mes', c.card?.payment ?? '60,00');
    if (c.card?.balance) await type(cardSheet, 'Lo que debes ahora', c.card.balance);
    await next(page);
  } else {
    const instalments = sheet(page, 'Las cuotas');
    await type(instalments, 'Número de cuotas', c.instalments?.count ?? '');
    await type(instalments, 'Importe de cada cuota', c.instalments?.amount ?? '');
    await type(instalments, 'Día de la primera cuota', c.instalments?.first ?? '');
    await next(page);
    await choose(
      sheet(page, 'La cuota final'),
      '¿Hay una última cuota más grande que las demás?',
      'No',
    );
    await next(page);
    if (c.opening) {
      const opening = sheet(page, 'La comisión de apertura');
      await type(opening, 'Comisión de apertura', c.opening.amount);
      await choose(opening, '¿Cómo la pagaste?', c.opening.how);
    }
    await next(page);
    await next(page);
    await choose(sheet(page, 'El seguro'), '¿Contrataste un seguro con el préstamo?', 'No');
    await next(page);
  }
  // A card concluded before the 2011 law is asked no more.
  if (!(await sheet(page, 'La TAE que se compara').isVisible())) {
    if (!(await sheet(page, 'Tu copia del contrato').isVisible())) return;
  } else {
    await choose(
      sheet(page, 'La TAE que se compara'),
      '¿Qué TAE se compara con el tipo medio del Banco de España?',
      c.compare ?? 'La que dice tu contrato',
    );
    await next(page);
  }

  if (!revolving) {
    const repayment = sheet(page, 'Si lo devolviste antes');
    await choose(
      repayment,
      '¿Has devuelto antes de tiempo todo o parte del préstamo?',
      c.repaid ? 'Sí' : 'No',
    );
    if (c.repaid) {
      await type(repayment, 'Día en que lo devolviste', c.repaid.on);
      await type(repayment, 'Capital que devolviste', c.repaid.principal);
      await next(page);
      await type(
        sheet(page, 'Lo que te cobraron'),
        'Compensación que te cobraron por devolverlo antes',
        c.repaid.compensation,
      );
      await next(page);
      await type(
        sheet(page, 'El final pactado'),
        'Día en que acababa el préstamo según el contrato',
        c.repaid.end,
      );
      await next(page);
      await choose(sheet(page, 'Quién lo pagó'), '¿Lo pagó un seguro?', 'No');
    }
    await next(page);
  }

  await choose(
    sheet(page, 'Tu copia del contrato'),
    '¿Te dieron una copia del contrato con sus condiciones?',
    c.received ?? 'Sí',
  );
  await next(page);
}

async function reviewed(page: Page) {
  await expect(page.getByRole('heading', { name: 'Resultado', level: 2 })).toBeFocused();
  await noSideScroll(page);
}

// The loan of STS 366/2026, with synthetic dates: 10.500 € in 48 instalments of 273,35 €, an
// opening charge of 761,25 € taken off what was handed over and a stated APR of 12 %.
const COURT_LOAN: Credit = {
  product: 'Préstamo personal',
  principal: '10.500,00',
  agreed: '2019-02-15',
  rate: '12',
  apr: '12,00',
  total: '13.120,80',
  instalments: { count: '48', amount: '273,35', first: '2019-03-15' },
  opening: { amount: '761,25', how: 'Me llegó menos dinero' },
  compare: 'La que sale de las cifras que has metido',
};

for (const { name, viewport } of SIZES) {
  test.describe(name, () => {
    test('a loan whose stated APR is lower than its figures give', async ({ page }) => {
      await open(page, viewport);
      await fill(page, COURT_LOAN);
      await reviewed(page);
      const apr = card(page, 'La TAE de tu contrato');
      await expect(apr).toContainText(
        'La TAE de tu contrato es más baja que la que sale de sus cifras (12,00 % frente a 16,61 %)',
      );
      await expect(apr).toContainText('La comisión de apertura añade 4,61 puntos a la TAE.');
      await expect(apr).toContainText('art. 21.4');
      const indicator = card(page, 'Tu TAE frente al tipo medio del Banco de España');
      await expect(indicator).toContainText('Diferencia con el tipo medio: 8,51 puntos');
      await expect(indicator).toContainText('febrero de 2019');
      await expect(indicator).toContainText('8,0989 %');
      await expect(indicator).toContainText('criterio del Tribunal Supremo');
      await expect(indicator).toContainText('un juez valora además las circunstancias del caso');
      await expect(card(page, 'Desistir del crédito')).toContainText(
        'El plazo terminó el 01-03-2019',
      );
      await expect(result(page)).toContainText('El Servicio de Reclamaciones del Banco de España');
      await expect(result(page)).not.toContainText('€ a ');
    });

    test('a revolving card on the edge of the average-rate band', async ({ page }) => {
      await open(page, viewport);
      await fill(page, {
        product: 'Tarjeta revolving',
        principal: '1.500,00',
        agreed: '2026-08-20',
        rate: '21,94',
        apr: '24,29',
        card: { payment: '60,00', balance: '1.200,00' },
      });
      await reviewed(page);
      await expect(card(page, 'La TAE de tu contrato')).toContainText('Coincide');
      const indicator = card(page, 'Tu TAE frente al tipo medio del Banco de España');
      await expect(indicator).toContainText(
        'En el borde: depende de cómo se ajuste el tipo medio por comisiones',
      );
      await expect(indicator).toContainText('6,03 puntos');
      await expect(indicator).toContainText('STS 258/2023');
      await expect(card(page, 'Desistir del crédito')).toContainText(
        'El plazo terminó el 03-09-2026',
      );
      await result(page).getByText('Cuánto tardarías en pagar la tarjeta').click();
      await expect(result(page)).toContainText('Con una deuda de 1.200,00 €');
    });

    test('a compensation for repaying early over the general cap', async ({ page }) => {
      await open(page, viewport);
      await fill(page, {
        product: 'Préstamo personal',
        principal: '6.000,00',
        agreed: '2023-01-10',
        rate: '7',
        apr: '7,23',
        instalments: { count: '60', amount: '118,81', first: '2023-02-10' },
        repaid: {
          on: '2025-01-10',
          principal: '3.000,00',
          compensation: '60,00',
          end: '2028-01-10',
        },
      });
      await reviewed(page);
      const repayment = card(page, 'Compensación por devolverlo antes');
      await expect(repayment).toContainText('Por encima del tope general del art. 30 (30,00 €)');
      await expect(repayment).toContainText('el 1 % da 30,00 €');
      await expect(repayment).toContainText('solo puede cobrar más si demuestra');
    });
  });
}

test('every sheet of the longest path fits in 360×640', async ({ page }) => {
  await open(page, { width: 360, height: 640 });
  await choose(sheet(page, 'Tu crédito'), '¿Qué es?', 'Financiación de coche');
  await next(page);
  await choose(
    sheet(page, 'Para qué es'),
    '¿Para qué lo pediste?',
    'Para mí o mi casa, fuera de mi trabajo o negocio',
  );
  await next(page);
  await type(sheet(page, 'El importe'), 'Importe del préstamo', '15.000,00');
  await next(page);
  const dates = sheet(page, 'Las fechas');
  await type(dates, '¿Cuándo lo contrataste?', '2024-03-01');
  await type(dates, '¿Cuándo recibiste el dinero?', '2024-03-01');
  await next(page);
  const rate = sheet(page, 'El interés');
  await type(rate, 'Tipo de interés nominal (TIN)', '6,5');
  await choose(rate, '¿El interés es fijo o variable?', 'Fijo');
  await next(page);
  const apr = sheet(page, 'La TAE del contrato');
  await choose(apr, '¿Tu contrato indica la TAE?', 'Sí');
  await type(apr, 'TAE que dice tu contrato', '7,9');
  await type(apr, 'Importe total adeudado que dice tu contrato', '18.500,00');
  await next(page);
  const instalments = sheet(page, 'Las cuotas');
  await type(instalments, 'Número de cuotas', '47');
  await type(instalments, 'Importe de cada cuota', '250,00');
  await type(instalments, 'Día de la primera cuota', '2024-04-01');
  await next(page);
  const balloon = sheet(page, 'La cuota final');
  await choose(balloon, '¿Hay una última cuota más grande que las demás?', 'Sí');
  await type(balloon, 'Importe de la cuota final', '6.000,00');
  await next(page);
  const opening = sheet(page, 'La comisión de apertura');
  await type(opening, 'Comisión de apertura', '300,00');
  await choose(opening, '¿Cómo la pagaste?', 'Se sumó al préstamo');
  await next(page);
  const other = sheet(page, 'Otros gastos');
  await type(other, 'Otros gastos al contratarlo', '100,00');
  await choose(other, '¿Cómo los pagaste?', 'Los pagué aparte');
  await next(page);
  const insurance = sheet(page, 'El seguro');
  await choose(insurance, '¿Contrataste un seguro con el préstamo?', 'Sí');
  await type(insurance, 'Prima del seguro', '600,00');
  await choose(insurance, '¿Cómo se paga?', 'Una sola vez');
  await next(page);
  const terms = sheet(page, 'Más sobre el seguro');
  await choose(terms, '¿La prima se sumó al préstamo?', 'Sí');
  await choose(terms, '¿Te dijeron que era obligatorio para darte el préstamo?', 'No lo sé');
  await next(page);
  await choose(
    sheet(page, 'La TAE que se compara'),
    '¿Qué TAE se compara con el tipo medio del Banco de España?',
    'La que dice tu contrato',
  );
  await next(page);
  const repayment = sheet(page, 'Si lo devolviste antes');
  await choose(repayment, '¿Has devuelto antes de tiempo todo o parte del préstamo?', 'Sí');
  await type(repayment, 'Día en que lo devolviste', '2025-09-01');
  await type(repayment, 'Capital que devolviste', '5.000,00');
  await next(page);
  const charged = sheet(page, 'Lo que te cobraron');
  await type(charged, 'Compensación que te cobraron por devolverlo antes', '40,00');
  await type(charged, 'Intereses que te cobraron ese día', '20,00');
  await next(page);
  const end = sheet(page, 'El final pactado');
  await type(end, 'Día en que acababa el préstamo según el contrato', '2028-03-01');
  await type(end, 'Intereses que quedaban por pagar según el cuadro', '900,00');
  await next(page);
  const payer = sheet(page, 'Quién lo pagó');
  await choose(payer, '¿Lo pagó un seguro?', 'No');
  await choose(
    payer,
    '¿El concesionario te cobró un descuento que te había hecho por financiar?',
    'Sí',
  );
  await next(page);
  const copy = sheet(page, 'Tu copia del contrato');
  await choose(copy, '¿Te dieron una copia del contrato con sus condiciones?', 'Sí');
  await type(copy, 'Día en que la recibiste, si fue después de contratarlo', '2024-03-05');
  await next(page);
  await reviewed(page);
  const aprCard = card(page, 'La TAE de tu contrato');
  await expect(aprCard).toContainText('Depende de un dato que no sabes');
  await expect(aprCard).toContainText('Si el seguro era obligatorio · Si va un mes después');
  await expect(card(page, 'Compensación por devolverlo antes')).toContainText(
    'Depende de un dato que no sabes',
  );
  await expect(card(page, 'Descuento que pierdes al devolverlo antes')).toContainText('Revísalo');
  await expect(card(page, 'Desistir del crédito')).toContainText('El plazo terminó el 19-03-2024');
});

test('a mortgage stops at the first sheet, with why', async ({ page }) => {
  await open(page, { width: 360, height: 640 });
  await choose(sheet(page, 'Tu crédito'), '¿Qué es?', 'Préstamo con hipoteca');
  await next(page);
  await reviewed(page);
  await expect(result(page)).toContainText('Esta revisión no cubre este crédito');
  await expect(result(page)).toContainText('créditos al consumo sin hipoteca');
  await expect(result(page).locator('[data-item]')).toHaveCount(0);
});

test('a loan for a business stops at its sheet', async ({ page }) => {
  await open(page, { width: 360, height: 640 });
  await choose(sheet(page, 'Tu crédito'), '¿Qué es?', 'Financiación de coche');
  await next(page);
  await choose(
    sheet(page, 'Para qué es'),
    '¿Para qué lo pediste?',
    'Para mi negocio o mi profesión',
  );
  await next(page);
  await reviewed(page);
  await expect(result(page)).toContainText('fines ajenos a su negocio o su profesión');
});

test('a loan from before the 2011 law stops, a card of then gets its indicator', async ({
  page,
}) => {
  await open(page, { width: 360, height: 640 });
  await fill(page, {
    product: 'Préstamo personal',
    principal: '3.000,00',
    agreed: '2010-05-03',
    rate: '9',
    apr: '9,38',
  });
  await reviewed(page);
  await expect(result(page)).toContainText('Lo contrataste antes del 25-09-2011');
  await expect(result(page).locator('[data-item]')).toHaveCount(0);

  await page.getByRole('button', { name: 'Empezar de nuevo' }).click();
  await fill(page, {
    product: 'Tarjeta revolving',
    principal: '1.500,00',
    agreed: '2009-04-01',
    rate: '22',
    apr: '24,60',
  });
  await reviewed(page);
  await expect(result(page)).toContainText('Tu tarjeta es anterior al 25-09-2011');
  const indicator = card(page, 'Tu TAE frente al tipo medio del Banco de España');
  await expect(indicator).toContainText('19,32 %');
  await expect(indicator).toContainText('Por debajo del umbral de 6 puntos (5,28 puntos)');
  await expect(result(page).locator('[data-item]')).toHaveCount(1);
});

test('a missing amount is named and the visit stays on the sheet', async ({ page }) => {
  await open(page, { width: 1280, height: 800 });
  await choose(sheet(page, 'Tu crédito'), '¿Qué es?', 'Préstamo personal');
  await next(page);
  await choose(
    sheet(page, 'Para qué es'),
    '¿Para qué lo pediste?',
    'Para mí o mi casa, fuera de mi trabajo o negocio',
  );
  await next(page);
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(sheet(page, 'El importe').getByText('Falta este dato')).toBeVisible();
  await expect(sheet(page, 'Las fechas')).toBeHidden();
});

test('the page shows when it was reviewed and makes no request', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith('http://localhost')) requests.push(r.url());
  });
  await open(page, { width: 1280, height: 800 });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'La TAE y los plazos de tu préstamo o tu tarjeta',
  );
  await expect(page.getByText(/^Revisado el /)).toBeVisible();
  await page.goto('');
  await page.getByRole('link', { name: 'Financiación', exact: true }).click();
  await expect(page).toHaveURL(/financiacion\/(#producto)?$/);
  expect(requests).toEqual([]);
});
