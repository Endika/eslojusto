import { test, expect, type Locator, type Page } from '@playwright/test';
import { fitsScreen, noSideScroll } from '../support/sheets';

// Runs only against a build with /hipoteca/ (TEST_MORTGAGE=1). The norms, rulings and legal
// interest are read as loaded on this day, so the clock is fixed.
const TODAY = '2026-10-10';

const SIZES = [
  { name: 'desktop', viewport: { width: 1280, height: 800 } },
  { name: '360×640', viewport: { width: 360, height: 640 } },
] as const;
type Viewport = (typeof SIZES)[number]['viewport'];

type Answer = 'Sí' | 'No' | 'No lo sé';

// A synthetic deed: every figure is made up.
interface Deed {
  readonly kind?: string;
  readonly borrower?: string;
  readonly purpose?: string;
  readonly on: string;
  readonly consumer?: Answer;
  readonly rate?: 'Fijo' | 'Variable' | 'Mixto';
  readonly expensesClause?: 'Sí, la tiene' | 'No la tiene' | 'No lo sé';
  readonly floor?: { readonly answer: Answer; readonly percent?: string };
  readonly invoices?: {
    readonly notary?: string;
    readonly registry?: string;
    readonly agency?: string;
    readonly valuation?: string;
    readonly tax?: string;
    readonly paidOn?: string;
  };
  readonly operation?: {
    readonly kind: string;
    readonly on: string;
    readonly principal: string;
    readonly fee: string;
    readonly option?: string;
  };
}

const sheet = (page: Page, name: string) => page.getByRole('group', { name, exact: true });
const choose = (scope: Locator, name: string, value: string) =>
  scope.getByRole('group', { name, exact: true }).getByLabel(value, { exact: true }).check();
const type = (scope: Locator, label: string, value: string) =>
  scope.getByLabel(label, { exact: true }).fill(value);
const result = (page: Page) => page.locator('#resultado');
const total = (page: Page, basis: 'statute' | 'case_law' | 'fees') =>
  result(page).locator(`[data-total="${basis}"]`);
const card = (page: Page, title: string) =>
  result(page)
    .locator('[data-item]')
    .filter({ has: page.getByRole('heading', { name: title, exact: true }) });

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
  await page.goto('hipoteca/');
}

const STANDARD = 'Hipoteca sobre una vivienda';

async function door(page: Page, d: Pick<Deed, 'kind' | 'borrower' | 'purpose'>) {
  await choose(sheet(page, 'Tu hipoteca'), '¿Qué es?', d.kind ?? STANDARD);
  await next(page);
  // Any other kind stops at the door and goes straight to the result.
  if ((d.kind ?? STANDARD) !== STANDARD) return;
  const holder = sheet(page, 'Quién y sobre qué');
  await expect(holder).toBeVisible();
  await choose(holder, '¿Quién la pidió?', d.borrower ?? 'Yo, como persona');
  if ((d.borrower ?? 'Yo, como persona') === 'Yo, como persona')
    await choose(
      holder,
      '¿Sobre qué es la hipoteca?',
      d.purpose ?? 'Una vivienda, con su garaje o trastero',
    );
  await next(page);
}

// Walks every sheet a deed asks, answering «No» to each clause it does not set.
async function fill(page: Page, d: Deed) {
  await door(page, d);
  const deed = sheet(page, 'La escritura');
  await type(deed, 'Fecha de la escritura', d.on);
  await choose(deed, '¿Pediste la hipoteca como particular, para tu casa?', d.consumer ?? 'Sí');
  await next(page);
  await choose(sheet(page, 'El tipo de interés'), '¿Qué tipo tiene?', d.rate ?? 'Variable');
  await next(page);
  await choose(
    sheet(page, 'La cláusula de gastos'),
    '¿Tu escritura tiene una cláusula que pone los gastos a cargo de quien pide el préstamo?',
    d.expensesClause ?? 'Sí, la tiene',
  );
  await next(page);
  if ((d.rate ?? 'Variable') !== 'Fijo') {
    const floor = sheet(page, 'La cláusula suelo');
    await choose(
      floor,
      '¿Tu escritura fija un tipo mínimo, por debajo del cual el interés no baja?',
      d.floor?.answer ?? 'No',
    );
    if (d.floor?.percent) await type(floor, 'Tipo mínimo que fija', d.floor.percent);
    await next(page);
    await choose(sheet(page, 'El índice'), '¿El tipo variable se calcula con el IRPH?', 'No');
    await next(page);
  }
  await choose(sheet(page, 'La demora'), '¿Tu escritura fija un interés de demora?', 'No');
  await next(page);
  await choose(
    sheet(page, 'El vencimiento anticipado'),
    '¿Tu escritura permite al banco pedir todo el préstamo si dejas de pagar?',
    'No lo sé',
  );
  await next(page);
  await choose(sheet(page, 'La comisión de apertura'), '¿Te cobraron comisión de apertura?', 'No');
  await next(page);
  const other = sheet(page, 'Otras cláusulas');
  await choose(other, '¿El tipo se redondea al alza, por ejemplo al cuarto de punto?', 'No');
  await choose(
    other,
    '¿La escritura te pide contratar un seguro u otro producto con el banco?',
    'No',
  );
  await next(page);

  const i = d.invoices;
  await choose(
    sheet(page, 'Tus facturas'),
    '¿Tienes las facturas o los importes de los gastos de la hipoteca?',
    i ? 'Sí' : 'No',
  );
  await next(page);
  if (i) {
    const notary = sheet(page, 'La notaría');
    if (i.notary) {
      await type(notary, 'Notaría del préstamo', i.notary);
      await choose(notary, '¿Esa factura incluye también la compraventa, sin separarla?', 'No');
    }
    await next(page);
    const registry = sheet(page, 'El registro');
    if (i.registry) {
      await type(registry, 'Registro de la hipoteca', i.registry);
      await choose(registry, '¿Esa factura incluye también la compraventa, sin separarla?', 'No');
    }
    await next(page);
    if (i.agency) await type(sheet(page, 'La gestoría'), 'Gestoría', i.agency);
    await next(page);
    if (i.valuation) await type(sheet(page, 'La tasación y el acta'), 'Tasación', i.valuation);
    await next(page);
    if (i.tax)
      await type(
        sheet(page, 'El impuesto'),
        'Impuesto del préstamo (actos jurídicos documentados)',
        i.tax,
      );
    await next(page);
    if (i.paidOn)
      await type(sheet(page, 'Cuándo pagaste'), 'Día en que pagaste esas facturas', i.paidOn);
    await next(page);
    await choose(
      sheet(page, 'Lo que ya hubo'),
      '¿Llegaste a un acuerdo con el banco sobre estos gastos?',
      'No',
    );
    await next(page);
  }

  const op = d.operation;
  await choose(
    sheet(page, 'Amortizaciones y cambios'),
    '¿Has amortizado antes de tiempo o cambiado tu hipoteca?',
    op?.kind ?? 'No',
  );
  await next(page);
  if (op) {
    const details = sheet(page, 'La operación');
    await type(details, 'Día de la operación', op.on);
    await type(details, 'Capital amortizado', op.principal);
    await type(details, 'Comisión que te cobraron', op.fee);
    await next(page);
    if (op.option) {
      await choose(
        sheet(page, 'Más sobre la operación'),
        '¿Qué comisión por amortizar fija tu escritura?',
        op.option,
      );
      await next(page);
    }
  }
}

async function reviewed(page: Page) {
  await expect(page.getByRole('heading', { name: 'Resultado', level: 2 })).toBeFocused();
  await noSideScroll(page);
}

for (const { name, viewport } of SIZES) {
  test.describe(name, () => {
    test('a 2021 deed: every cost by law, the valuation the borrower’s', async ({ page }) => {
      await open(page, viewport);
      await fill(page, {
        on: '2021-05-10',
        invoices: {
          notary: '700,00',
          registry: '450,00',
          agency: '350,00',
          valuation: '400,00',
          tax: '1.200,00',
          paidOn: '2021-05-10',
        },
      });
      await reviewed(page);
      await expect(total(page, 'statute')).toContainText('unos 2.700 €');
      await expect(total(page, 'case_law')).toContainText('Nada con lo que has metido');
      await expect(card(page, 'Notaría del préstamo')).toContainText(
        'La ley lo pone a cargo del banco: 700,00 €',
      );
      await expect(card(page, 'Tasación')).toContainText('A tu cargo');
      await expect(card(page, 'Impuesto del préstamo (AJD)')).toContainText('art. 29');
      await expect(result(page)).toContainText('El paso previo del art. 439 bis');
      await expect(result(page)).not.toContainText('pase');
    });

    test('a 2012 deed: the Supreme Court’s split, explained without a figure', async ({ page }) => {
      await open(page, viewport);
      await fill(page, {
        on: '2012-05-10',
        invoices: { notary: '800,00', registry: '500,00', valuation: '300,00', tax: '1.500,00' },
      });
      await reviewed(page);
      await expect(total(page, 'statute')).toContainText('Nada con lo que has metido');
      await expect(total(page, 'case_law')).toContainText('Sin cifra por ahora');
      await expect(total(page, 'case_law')).toContainText(
        'hace falta que el banco lo acepte o que un juez anule la cláusula de gastos',
      );
      const notary = card(page, 'Notaría del préstamo');
      await expect(notary).toContainText(
        'Según el reparto del Tribunal Supremo, el 50 % le correspondía al banco (sin cifra por ahora)',
      );
      await expect(notary).toContainText('sin comprobar en el texto de la sentencia');
      await expect(card(page, 'Impuesto del préstamo (AJD)')).toContainText('No aplica a tu fecha');
    });

    test('a December 2018 deed: the tax by law, the rest by the split, apart', async ({ page }) => {
      await open(page, viewport);
      await fill(page, {
        on: '2018-12-12',
        invoices: { notary: '600,00', tax: '1.100,00' },
      });
      await reviewed(page);
      await expect(total(page, 'statute')).toContainText('unos 1.100 €');
      await expect(total(page, 'case_law')).toContainText('Sin cifra por ahora');
      await expect(result(page).getByText('Estas cifras no se suman')).toBeVisible();
      await expect(card(page, 'Impuesto del préstamo (AJD)')).toContainText(
        'La ley lo pone a cargo del banco: 1.100,00 €',
      );
    });

    test('a company’s mortgage stops at its sheet, with why', async ({ page }) => {
      await open(page, viewport);
      await door(page, { borrower: 'Una empresa o sociedad' });
      await reviewed(page);
      await expect(result(page)).toContainText('Esta revisión no cubre tu tipo de hipoteca');
      await expect(result(page)).toContainText('un préstamo a una empresa tiene otras reglas');
      await expect(result(page).locator('[data-item]')).toHaveCount(0);
      await expect(total(page, 'statute')).toBeHidden();
    });
  });
}

test('every sheet of the longest path fits in 360×640', async ({ page }) => {
  await open(page, { width: 360, height: 640 });
  await door(page, {});
  const deed = sheet(page, 'La escritura');
  await type(deed, 'Fecha de la escritura', '2020-03-02');
  await type(deed, 'Capital del préstamo', '180.000,00');
  await choose(deed, '¿Pediste la hipoteca como particular, para tu casa?', 'No lo sé');
  await next(page);
  const rate = sheet(page, 'El tipo de interés');
  await choose(rate, '¿Qué tipo tiene?', 'Mixto');
  await type(rate, 'Cada cuántos meses se revisa el tipo', '12');
  await next(page);
  await choose(
    sheet(page, 'La cláusula de gastos'),
    '¿Tu escritura tiene una cláusula que pone los gastos a cargo de quien pide el préstamo?',
    'No lo sé',
  );
  await next(page);
  const floor = sheet(page, 'La cláusula suelo');
  await choose(
    floor,
    '¿Tu escritura fija un tipo mínimo, por debajo del cual el interés no baja?',
    'Sí',
  );
  await type(floor, 'Tipo mínimo que fija', '1');
  await next(page);
  await choose(sheet(page, 'El índice'), '¿El tipo variable se calcula con el IRPH?', 'Sí');
  await next(page);
  const late = sheet(page, 'La demora');
  await choose(late, '¿Tu escritura fija un interés de demora?', 'Sí');
  await type(late, 'Interés de demora', '8');
  await type(late, 'Interés ordinario', '2,5');
  await next(page);
  const term = sheet(page, 'El vencimiento anticipado');
  await choose(
    term,
    '¿Tu escritura permite al banco pedir todo el préstamo si dejas de pagar?',
    'Sí',
  );
  await type(term, 'Cuotas impagadas que pide la escritura', '1');
  await next(page);
  const opening = sheet(page, 'La comisión de apertura');
  await choose(opening, '¿Te cobraron comisión de apertura?', 'Sí');
  await type(opening, 'Comisión de apertura', '1.800,00');
  await choose(opening, '¿Y por estudio o tramitación?', 'Sí');
  await next(page);
  const other = sheet(page, 'Otras cláusulas');
  await choose(other, '¿El tipo se redondea al alza, por ejemplo al cuarto de punto?', 'Sí');
  await choose(
    other,
    '¿La escritura te pide contratar un seguro u otro producto con el banco?',
    'Sí',
  );
  await next(page);
  await choose(
    sheet(page, 'Tus facturas'),
    '¿Tienes las facturas o los importes de los gastos de la hipoteca?',
    'Sí',
  );
  await next(page);
  const notary = sheet(page, 'La notaría');
  await type(notary, 'Notaría del préstamo', '900,00');
  await choose(notary, '¿Esa factura incluye también la compraventa, sin separarla?', 'Sí');
  await next(page);
  const registry = sheet(page, 'El registro');
  await type(registry, 'Registro de la hipoteca', '420,00');
  await choose(registry, '¿Esa factura incluye también la compraventa, sin separarla?', 'No');
  await next(page);
  const agency = sheet(page, 'La gestoría');
  await type(agency, 'Gestoría', '1.900,00');
  await type(agency, 'Impuesto pagado por la gestoría', '1.300,00');
  await type(agency, 'Registro pagado por la gestoría', '420,00');
  await next(page);
  const valuation = sheet(page, 'La tasación y el acta');
  await type(valuation, 'Tasación', '350,00');
  await type(valuation, 'Acta notarial previa', '60,00');
  await next(page);
  await type(
    sheet(page, 'El impuesto'),
    'Impuesto del préstamo (actos jurídicos documentados)',
    '1.300,00',
  );
  await next(page);
  await type(sheet(page, 'Cuándo pagaste'), 'Día en que pagaste esas facturas', '2020-03-02');
  await next(page);
  const agreement = sheet(page, 'Lo que ya hubo');
  await choose(agreement, '¿Llegaste a un acuerdo con el banco sobre estos gastos?', 'No');
  await type(agreement, 'Lo que el banco ya te dio de estos gastos', '100,00');
  await next(page);
  await choose(
    sheet(page, 'Amortizaciones y cambios'),
    '¿Has amortizado antes de tiempo o cambiado tu hipoteca?',
    'La cancelé entera',
  );
  await next(page);
  const details = sheet(page, 'La operación');
  await type(details, 'Día de la operación', '2026-02-02');
  await type(details, 'Capital amortizado', '150.000,00');
  await type(details, 'Comisión que te cobraron', '600,00');
  await next(page);
  const terms = sheet(page, 'Más sobre la operación');
  await choose(terms, '¿Qué comisión por amortizar fija tu escritura?', 'No lo sé');
  await next(page);
  await choose(sheet(page, 'El seguro'), '¿Tenías un seguro ligado a la hipoteca?', 'Sí');
  await next(page);
  await reviewed(page);
  await expect(card(page, 'Notaría del préstamo')).toContainText('Revísalo');
  await expect(card(page, 'Gestoría')).toContainText('se cuentan una sola vez');
  await expect(card(page, 'Acta notarial previa')).toContainText('No debía cobrarse: 60,00 €');
  await expect(card(page, 'Cancelación antes de tiempo')).toContainText(
    'Depende de un dato que no sabes',
  );
  await expect(card(page, 'Cláusula suelo')).toContainText('la ley prohíbe');
  await expect(card(page, 'Vencimiento anticipado')).toContainText(
    'Cuotas impagadas que pide tu escritura: 1',
  );
});

test('flags alone give no figure', async ({ page }) => {
  await open(page, { width: 360, height: 640 });
  await fill(page, { on: '2010-06-01', floor: { answer: 'Sí', percent: '3' } });
  await reviewed(page);
  await expect(total(page, 'statute')).toContainText('Nada con lo que has metido');
  await expect(total(page, 'case_law')).toContainText('Nada con lo que has metido');
  const floor = card(page, 'Cláusula suelo');
  await expect(floor).toContainText('Aparece en tu escritura');
  await expect(floor).toContainText('Lo que dicen los tribunales · estado a 07-10-2026');
  await expect(floor).toContainText('C-154/15');
});

test('a missing date is named and the visit stays on the sheet', async ({ page }) => {
  await open(page, { width: 1280, height: 800 });
  await door(page, {});
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(sheet(page, 'La escritura').getByText('Falta este dato')).toBeVisible();
  await expect(sheet(page, 'El tipo de interés')).toBeHidden();
});

test('the page shows when it was reviewed and makes no request', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith('http://localhost')) requests.push(r.url());
  });
  await open(page, { width: 1280, height: 800 });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Los gastos, las comisiones y las cláusulas de tu hipoteca',
  );
  await expect(page.locator('.desk__reviewed')).toContainText('Revisado el 10 de octubre de 2026');
  await expect(page.locator('.desk__reviewed time')).toHaveAttribute('datetime', TODAY);
  await page.goto('');
  await page.getByRole('link', { name: 'Hipoteca', exact: true }).click();
  await expect(page).toHaveURL(/hipoteca\/(#hipoteca)?$/);
  expect(requests).toEqual([]);
});

test('the page has its title, heading, canonical, JSON-LD, guide and questions', async ({
  page,
}) => {
  await open(page, { width: 1280, height: 800 });
  const title = await page.title();
  expect(title).toBe('Gastos y comisiones de tu hipoteca: qué dice la ley');
  expect([...title].length).toBeLessThanOrEqual(60);
  const description = await page.locator('meta[name="description"]').getAttribute('content');
  expect(description).toContain('Tribunal Supremo');
  expect([...(description ?? '')].length).toBeLessThanOrEqual(155);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://eslojusto.es/hipoteca/',
  );
  const jsonLd = await page.locator('script[type="application/ld+json"]').textContent();
  const graph = JSON.parse(jsonLd ?? '{}') as {
    '@graph': { '@type': string; name?: string; mainEntity?: { name: string }[] }[];
  };
  expect(graph['@graph'].map((n) => n['@type'])).toEqual([
    'WebApplication',
    'BreadcrumbList',
    'FAQPage',
  ]);
  expect(graph['@graph'][0]?.name).toBe('Revisión de los gastos y las comisiones de tu hipoteca');
  const questions = graph['@graph'][2]?.mainEntity?.map((q) => q.name) ?? [];
  expect(questions).toEqual([
    '¿Quién paga la notaría, el registro, la gestoría y la tasación?',
    '¿Qué cambia si mi hipoteca es anterior a 2019?',
    '¿Quién paga el impuesto (AJD)?',
    '¿Cuánto me pueden cobrar por amortizar?',
    '¿Qué es una cláusula suelo?',
    '¿Qué es el IRPH?',
  ]);
  await expect(page.locator('.faq-item summary')).toHaveText(questions);

  const guide = page.locator('.guide');
  await expect(guide.locator('.guide__sources')).toContainText('Revisado el 10 de octubre de 2026');
  await expect(
    guide.getByRole('heading', { name: 'Desde el 16-06-2019, lo dice la ley' }),
  ).toBeVisible();
  await expect(guide.getByRole('table')).toContainText('Nadie: no se cobra');
  // Quotes of the law only inside <LegalQuote>, each with its source.
  await expect(guide.locator('[data-legal-quote]')).toHaveCount(6);
  await expect(guide).toContainText(
    'Fuente: Ley del Impuesto sobre Transmisiones Patrimoniales y Actos Jurídicos Documentados, art. 29',
  );
  // What the courts have said is dated and never shown as law.
  await expect(guide.locator('[data-guide="before_2019"]')).toContainText(
    'Lo que han dicho los tribunales, estado a 07-10-2026.',
  );
  await expect(guide).toContainText(
    'STS 35/2021, de 27 de enero (Pleno) · criterio del Tribunal Supremo, Sala de lo Civil, sin comprobar en el texto de la sentencia',
  );
  await expect(guide).toContainText(
    'asuntos acumulados C-154/15, C-307/15 y C-308/15 · criterio del Tribunal de Justicia de la Unión Europea',
  );
  await expect(guide).toContainText('El Servicio de Reclamaciones del Banco de España.');
  await guide.getByText('¿Cuánto me pueden cobrar por amortizar?').click();
  await expect(page.locator('#faq-hipoteca-amortizar')).toContainText('0,15 %');
});

test('the guide and its open questions fit a 360 px screen', async ({ page }) => {
  await open(page, { width: 360, height: 640 });
  const questions = page.locator('.faq-item');
  await expect(questions.first()).toBeVisible();
  for (const q of await questions.all()) {
    await q.locator('summary').click();
    await expect(q).toHaveAttribute('open', '');
  }
  await noSideScroll(page);
});
