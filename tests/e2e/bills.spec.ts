import { test, expect, type Locator, type Page } from '@playwright/test';
import { fitsScreen, noSideScroll } from '../support/sheets';

// Runs only against a build with /facturas/ (TEST_BILLS=1). The tables are read as loaded on this
// day, so the clock is fixed.
const TODAY = '2026-10-13';

const SIZES = [
  { name: 'desktop', viewport: { width: 1280, height: 800 } },
  { name: '360×640', viewport: { width: 360, height: 640 } },
] as const;
type Viewport = (typeof SIZES)[number]['viewport'];

const sheet = (page: Page, name: string) => page.getByRole('group', { name, exact: true });
const choose = (scope: Locator, name: string, value: string) =>
  scope.getByRole('group', { name, exact: true }).getByLabel(value, { exact: true }).check();
const type = (scope: Locator, label: string, value: string) =>
  scope.getByLabel(label, { exact: true }).fill(value);
const result = (page: Page) => page.locator('#resultado');
const card = (page: Page, title: string) =>
  result(page)
    .locator('[data-item]')
    .filter({ has: page.getByRole('heading', { name: title, exact: true }) });

// Checks the sheet fits, then moves on with whichever button the sheet shows, and waits out the
// page turn.
async function next(page: Page) {
  await fitsScreen(page);
  const review = page.getByRole('button', { name: 'Revisar' });
  if (await review.isVisible()) await review.click();
  else await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== 'running'),
  );
}

async function open(page: Page, path: string, viewport: Viewport) {
  await page.clock.setFixedTime(new Date(`${TODAY}T12:00:00`));
  await page.setViewportSize(viewport);
  await page.goto(path);
}

async function reviewed(page: Page) {
  await expect(page.getByRole('heading', { name: 'Resultado', level: 2 })).toBeFocused();
  await noSideScroll(page);
}

// The words of the norm stay inside a quote: the page never says them in its own voice.
async function noLiteralOutsideQuotes(page: Page) {
  const text = await page.evaluate(() => {
    const copy = document.body.cloneNode(true) as HTMLElement;
    for (const q of copy.querySelectorAll('[data-legal-quote]')) q.remove();
    return copy.textContent ?? '';
  });
  expect(text.toLowerCase()).not.toContain('potencia máxima demandada');
}

interface Bill {
  readonly postcode?: string;
  readonly market: 'PVPC' | 'Mercado libre';
  readonly power: {
    readonly unit: '€/kW y día' | '€/kW y año';
    readonly p1: Line;
    readonly p2: Line;
  };
  readonly meter: string;
  readonly service?: { readonly label: string; readonly amount: string; readonly asked: string };
  readonly tax: string;
  readonly vat: string;
  readonly total: string;
}
interface Line {
  readonly price: string;
  readonly amount: string;
}

// A synthetic June 2026 bill of a household in Madrid: 4,6 kW in both periods, 250 kWh, its tolls
// and charges, the social bonus funding and a single-phase meter, worked out from the 2026 tables.
const JUNE_PVPC: Bill = {
  market: 'PVPC',
  power: {
    unit: '€/kW y año',
    p1: { price: '30,817413', amount: '11,65' },
    p2: { price: '0,725423', amount: '0,27' },
  },
  meter: '0,80',
  tax: '2,40',
  vat: '10,55',
  total: '60,77',
};

async function fillElectricity(page: Page, b: Bill) {
  const supply = sheet(page, 'Tu suministro');
  await type(supply, 'Código postal del suministro', b.postcode ?? '28001');
  await choose(supply, 'Tarifa de acceso', '2.0TD');
  await next(page);
  if (b.postcode?.startsWith('35')) return;

  await choose(sheet(page, 'Autoconsumo'), '¿Tienes placas solares en el suministro?', 'No');
  await next(page);
  const contracted = sheet(page, 'Potencia contratada');
  await type(contracted, 'Punta (P1), kW', '4,6');
  await type(contracted, 'Valle (P2), kW', '4,6');
  await next(page);
  const dates = sheet(page, 'Fechas de la factura');
  await type(dates, 'Fecha de emisión', '2026-07-02');
  await type(dates, 'Fecha de cargo o límite de pago', '2026-07-07');
  await next(page);
  const readings = sheet(page, 'Periodo de consumo');
  await type(readings, 'Lectura anterior', '2026-05-31');
  await type(readings, 'Lectura actual', '2026-06-30');
  await type(readings, 'Días que dice tu factura', '30');
  await next(page);
  const tariff = sheet(page, 'Tu tarifa');
  await choose(tariff, 'Tipo de contrato', b.market);
  if (b.market === 'PVPC') await choose(tariff, '¿Tu comercializadora es de referencia?', 'Sí');
  await next(page);
  await choose(
    sheet(page, 'A nombre de quién está el contrato'),
    'Titular del contrato',
    'Una persona',
  );
  await next(page);

  const power = sheet(page, 'Término de potencia');
  await choose(power, '¿En qué unidad da tu factura el precio de la potencia?', b.power.unit);
  await choose(power, '¿Cambió algún precio dentro del periodo?', 'No');
  await next(page);
  for (const [name, line] of [
    ['Potencia en punta (P1)', b.power.p1],
    ['Potencia en valle (P2)', b.power.p2],
  ] as const) {
    await type(sheet(page, name), 'Precio', line.price);
    await type(sheet(page, name), 'Importe', line.amount);
    await next(page);
  }
  const used = sheet(page, 'Potencia máxima que usaste');
  await type(used, 'Punta (P1), kW', '3,1');
  await type(used, 'Valle (P2), kW', '1,2');
  await next(page);
  for (const [name, kwh, price, amount] of [
    ['Energía en punta (P1)', '60', '0,20', '12,00'],
    ['Energía en llano (P2)', '70', '0,15', '10,50'],
    ['Energía en valle (P3)', '120', '0,10', '12,00'],
  ] as const) {
    await type(sheet(page, name), 'Consumo, kWh', kwh);
    await type(sheet(page, name), 'Precio, €/kWh', price);
    await type(sheet(page, name), 'Importe', amount);
    await next(page);
  }

  const tolls = sheet(page, 'Peajes y cargos');
  await choose(tolls, '¿Tu factura los desglosa?', 'Sí');
  await type(tolls, 'De potencia', '10,75');
  await type(tolls, 'De energía', '8,30');
  await next(page);
  const funding = sheet(page, 'Financiación del bono social');
  await choose(funding, '¿Aparece en tu factura?', 'Sí');
  await type(funding, 'Importe', '0,60');
  await next(page);
  await choose(sheet(page, 'Bono social'), '¿Tienes descuento por bono social?', 'No');
  await next(page);
  const meter = sheet(page, 'Alquiler del contador');
  await choose(meter, '¿Te cobran alquiler del contador?', 'Sí');
  await type(meter, 'Importe', b.meter);
  await next(page);
  const kind = sheet(page, 'Tu contador');
  await choose(kind, 'Tipo de contador', 'Monofásico');
  await choose(kind, '¿El contador es tuyo?', 'No');
  await next(page);
  await choose(sheet(page, 'Otros servicios'), '¿Cuántos cobra?', b.service ? 'Uno' : 'Ninguno');
  await next(page);
  if (b.service) {
    const service = sheet(page, 'Primer servicio');
    await service.getByLabel('Qué es', { exact: true }).selectOption({ label: b.service.label });
    await type(service, 'Importe', b.service.amount);
    await choose(service, '¿Lo pediste?', b.service.asked);
    await next(page);
  }
  await choose(sheet(page, 'Exceso de potencia'), '¿Te cobran exceso de potencia?', 'No');
  await next(page);
  await choose(
    sheet(page, 'Penalización por baja'),
    '¿Te cobran una penalización por dejar el contrato?',
    'No',
  );
  await next(page);
  await choose(
    sheet(page, 'Descuentos y regularizaciones'),
    '¿Regulariza facturas anteriores?',
    'No',
  );
  await next(page);
  await type(sheet(page, 'Impuesto eléctrico'), 'Importe', b.tax);
  await next(page);
  await type(sheet(page, 'IVA'), 'Importe', b.vat);
  await type(sheet(page, 'IVA'), 'Tipo, %', '21');
  await next(page);
  await type(sheet(page, 'Total'), 'Total de la factura', b.total);
  await next(page);
}

for (const { name, viewport } of SIZES) {
  test.describe(name, () => {
    test('a June PVPC bill that matches has no difference', async ({ page }) => {
      await open(page, 'facturas/luz/', viewport);
      await fillElectricity(page, JUNE_PVPC);
      await reviewed(page);
      await expect(result(page).locator('[data-lead]')).toHaveText(
        'Con lo que has metido, cada línea cuadra con tus propios precios y con lo que fija la norma.',
      );
      await expect(result(page).locator('[data-total-counted]')).toHaveText('0,00 €');
      await expect(result(page).locator('[data-total-under]')).toBeHidden();
      const statuses = await result(page)
        .locator('[data-item]')
        .evaluateAll((cards) => cards.map((c) => (c as HTMLElement).dataset['state']));
      expect(new Set(statuses)).toEqual(new Set(['matches', 'information']));
      await expect(card(page, 'Potencia que usaste')).toContainText(
        'La potencia máxima que usaste en los últimos 12 meses, según tu factura: 3,1 kW en punta y 1,2 kW en valle.',
      );
      await expect(card(page, 'IVA')).toContainText('IVA el 07-07-2026');
      await expect(card(page, 'Alquiler del contador')).toContainText(
        'Orden IET/1491/2013, disposición transitoria única',
      );
      await expect(
        result(page).getByRole('link', { name: 'Comparador de ofertas de la CNMC' }),
      ).toHaveAttribute('href', 'https://comparador.cnmc.gob.es/');
      await noLiteralOutsideQuotes(page);
    });

    test('a meter rental over the regulated price', async ({ page }) => {
      await open(page, 'facturas/luz/', viewport);
      await fillElectricity(page, { ...JUNE_PVPC, meter: '1,50', vat: '10,69', total: '61,61' });
      await reviewed(page);
      await expect(card(page, 'Alquiler del contador')).toContainText(
        'Por encima del precio regulado: 0,70 € de más',
      );
      await expect(card(page, 'Alquiler del contador')).toContainText(
        'El alquiler regulado de un contador monofásico por 30 días es como mucho 0,80 €',
      );
      await expect(result(page).locator('[data-total-counted]')).toHaveText('0,70 €');
      await expect(result(page).locator('[data-recurring]')).toBeVisible();
      await noSideScroll(page);
    });

    test('a service the person did not ask for, on a free-market bill', async ({ page }) => {
      await open(page, 'facturas/luz/', viewport);
      await fillElectricity(page, {
        market: 'Mercado libre',
        power: {
          unit: '€/kW y día',
          p1: { price: '0,10', amount: '13,80' },
          p2: { price: '0,01', amount: '1,38' },
        },
        meter: '0,80',
        service: { label: 'Mantenimiento', amount: '5,00', asked: 'No' },
        tax: '2,57',
        vat: '12,32',
        total: '70,97',
      });
      await reviewed(page);
      const service = card(page, 'Servicio aparte de la luz · Mantenimiento');
      await expect(service).toContainText('Por encima de lo que permite la norma: 5,00 € de más');
      await expect(service).toContainText('dices que no lo pediste');
      await expect(service).toContainText('Real Decreto 88/2026, art. 18.7');
      await expect(result(page).locator('[data-total-counted]')).toHaveText('5,00 €');
      await expect(card(page, 'Quién puede tener el PVPC')).toHaveCount(0);
      await noLiteralOutsideQuotes(page);
    });

    test('a Canary Islands postcode stops at the gate', async ({ page }) => {
      await open(page, 'facturas/luz/', viewport);
      await fillElectricity(page, { ...JUNE_PVPC, postcode: '35001' });
      await reviewed(page);
      await expect(result(page).locator('[data-out-of-scope]')).toContainText(
        'Esta revisión todavía no cubre tu territorio: en Canarias, Ceuta y Melilla la luz lleva otros impuestos y otros horarios.',
      );
      await expect(result(page).locator('[data-items] [data-item]')).toHaveCount(0);
      await expect(result(page).locator('[data-totals]')).toBeHidden();
    });

    test('a commitment penalty over its proportional share', async ({ page }) => {
      await open(page, 'facturas/permanencia/', viewport);
      const commitment = sheet(page, 'Tu permanencia');
      await choose(commitment, '¿Tenías permanencia?', 'Sí');
      await type(commitment, 'Inicio', '2025-03-01');
      await type(commitment, 'Meses', '18');
      await next(page);
      await type(sheet(page, 'Penalización pactada'), 'Penalización por irte el primer día', '180');
      await next(page);
      await type(sheet(page, 'Tu baja'), 'Día en que pediste la baja', '2026-03-01');
      await next(page);
      await choose(
        sheet(page, 'Cambios antes de irte'),
        '¿Te cambiaron las condiciones antes de irte?',
        'No',
      );
      await next(page);
      await type(sheet(page, 'Lo que te cobraron por irte'), 'Penalización cobrada', '120');
      await next(page);
      await choose(
        sheet(page, 'Cobros después de la baja'),
        '¿Te cobran días de después de pedir la baja?',
        'No',
      );
      await next(page);
      await reviewed(page);
      const penalty = card(page, 'Penalización por permanencia');
      await expect(penalty).toContainText('Por encima de lo que permite la norma: 59,67 € de más');
      await expect(penalty).toContainText(
        'Penalización pactada 180,00 € × 184 días que faltaban / 549 días de permanencia = 60,33 €.',
      );
      await expect(penalty).toContainText(
        'Texto refundido de la Ley General para la Defensa de los Consumidores y Usuarios, art. 62.5',
      );
      await expect(result(page).locator('[data-total-counted]')).toHaveText('59,67 €');
      await expect(
        result(page).getByRole('link', {
          name: 'Oficina de Atención al Usuario de Telecomunicaciones',
        }),
      ).toBeVisible();
      await noLiteralOutsideQuotes(page);
    });
  });
}

test('the section page links both reviews', async ({ page }) => {
  await page.goto('facturas/');
  await expect(
    page.getByRole('heading', { name: 'Tus facturas, frente a la norma', level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Luz', exact: true })).toHaveAttribute(
    'href',
    '/facturas/luz/',
  );
  await expect(page.getByRole('link', { name: 'Permanencia', exact: true })).toHaveAttribute(
    'href',
    '/facturas/permanencia/',
  );
  await noSideScroll(page);
});

test('the home page files the section as a live card', async ({ page }) => {
  await page.goto('');
  await expect(page.getByRole('link', { name: 'Facturas', exact: true })).toHaveAttribute(
    'href',
    '/facturas/',
  );
});

const PAGES = [
  { path: 'facturas/', graph: ['BreadcrumbList'] },
  { path: 'facturas/luz/', graph: ['WebApplication', 'BreadcrumbList', 'FAQPage'] },
  { path: 'facturas/permanencia/', graph: ['WebApplication', 'BreadcrumbList', 'FAQPage'] },
] as const;

for (const { path, graph } of PAGES) {
  test(`${path} has its title, description, canonical, JSON-LD and date`, async ({
    page,
    request,
  }) => {
    await page.goto(path);
    await expect(page.locator('h1')).toHaveCount(1);
    const title = (await page.title()).trim();
    expect([...title].length).toBeGreaterThan(0);
    expect([...title].length).toBeLessThanOrEqual(60);
    const description = await page.locator('meta[name="description"]').getAttribute('content');
    expect([...(description ?? '')].length).toBeGreaterThan(0);
    expect([...(description ?? '')].length).toBeLessThanOrEqual(155);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      `https://eslojusto.es/${path}`,
    );
    const jsonLd = await page.locator('script[type="application/ld+json"]').textContent();
    const nodes = (JSON.parse(jsonLd ?? '{}') as { '@graph': Record<string, unknown>[] })['@graph'];
    expect(nodes.map((n) => n['@type'])).toEqual(graph);
    expect(nodes.flatMap((n) => Object.keys(n))).not.toContain('aggregateRating');

    // The sitemap dates the page by the day its content last changed; a review page shows the same
    // day as when its rules were last checked.
    const sitemap = await (await request.get('sitemap-0.xml')).text();
    const lastmod = new RegExp(
      `<loc>https://eslojusto.es/${path}</loc><lastmod>(\\d{4}-\\d{2}-\\d{2})`,
    ).exec(sitemap)?.[1];
    expect(lastmod).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    if (graph.length > 1) {
      await expect(page.locator('.desk__reviewed time')).toHaveAttribute('datetime', lastmod ?? '');
      await expect(page.locator('.guide__sources')).toContainText('Revisado el');
      const faq = nodes.find((n) => n['@type'] === 'FAQPage') as {
        mainEntity: { name: string; acceptedAnswer: { text: string } }[];
      };
      await expect(page.locator('.faq-item summary')).toHaveText(faq.mainEntity.map((q) => q.name));
      for (const [i, q] of faq.mainEntity.entries())
        await expect(page.locator('.faq-item p').nth(i)).toHaveText(q.acceptedAnswer.text);
    }
  });
}

test('the electricity guide gives the 2026 taxes, the quote and its sources', async ({ page }) => {
  await open(page, 'facturas/luz/', SIZES[0].viewport);
  const guide = page.locator('.guide');
  await expect(guide.getByRole('heading', { name: 'Los impuestos de 2026' })).toBeVisible();
  await expect(guide).toContainText('Real Decreto-ley 25/2026');
  await expect(guide.locator('[data-legal-quote]')).toContainText(
    'con al menos un mes de antelación, por escrito y de manera separada a su factura',
  );
  await expect(
    guide.getByRole('link', { name: 'Real Decreto 88/2026, art. 6.1.m' }),
  ).toHaveAttribute('href', 'https://www.boe.es/buscar/act.php?id=BOE-A-2026-3212#a6');
  await guide.getByText('¿Cuánto cuesta el alquiler del contador?').click();
  await expect(page.locator('#faq-luz-contador')).toContainText('0,81 € al mes');
  await noLiteralOutsideQuotes(page);
});

test('the telecom guide gives the proportional penalty and the official channel', async ({
  page,
}) => {
  await open(page, 'facturas/permanencia/', SIZES[0].viewport);
  const guide = page.locator('.guide');
  await expect(guide).toContainText('180 × 184 / 549 = 60,33 €');
  await expect(guide).toContainText('resuelve desacuerdos con operadores');
  await expect(
    guide.getByRole('link', { name: 'Oficina de Atención al Usuario de Telecomunicaciones' }),
  ).toHaveAttribute('href', 'https://usuariosteleco.digital.gob.es/');
  await expect(guide.locator('[data-legal-quote]')).toHaveCount(2);
});

for (const path of ['facturas/luz/', 'facturas/permanencia/'])
  test(`the ${path} guide and its open questions fit a 360 px screen`, async ({ page }) => {
    await open(page, path, SIZES[1].viewport);
    const questions = page.locator('.faq-item');
    await expect(questions.first()).toBeAttached();
    for (const q of await questions.all()) {
      await q.locator('summary').click();
      await expect(q).toHaveAttribute('open', '');
    }
    await noSideScroll(page);
  });
