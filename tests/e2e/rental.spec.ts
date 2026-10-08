import { test, expect, type Page } from '@playwright/test';

// Every case reads the indices and norms as loaded on this day, so the clock is fixed to it.
const TODAY = new Date('2026-10-08T12:00:00');

const SIZES = [
  { name: 'desktop', viewport: { width: 1280, height: 800 } },
  { name: '360×640', viewport: { width: 360, height: 640 } },
] as const;

interface Contract {
  readonly type?: string;
  readonly signed: string;
  readonly start: string;
}

interface Rise {
  readonly year: string;
  readonly previous: string;
  readonly next: string;
  readonly chargedFrom: string;
  readonly noticeOn: string;
  readonly agreed: 'Sí' | 'No' | 'No lo sé';
}

interface Case extends Contract {
  readonly large?: 'Sí' | 'No' | 'No lo sé';
  readonly clause: string;
  readonly percent?: string;
  readonly rise: Rise;
}

const sheet = (page: Page, name: string) => page.getByRole('group', { name, exact: true });
const next = (page: Page) => page.getByRole('button', { name: 'Siguiente' }).click();

async function open(page: Page, viewport: { width: number; height: number }) {
  await page.clock.setFixedTime(TODAY);
  await page.setViewportSize(viewport);
  await page.goto('alquiler/');
}

async function fillContract(page: Page, c: Contract) {
  const s = sheet(page, 'Tu contrato');
  await s.getByLabel(c.type ?? 'Vivienda habitual', { exact: true }).check();
  await s.getByLabel('Fecha del contrato', { exact: true }).fill(c.signed);
  await s.getByLabel('Fecha de entrada', { exact: true }).fill(c.start);
  await next(page);
}

async function fillCase(page: Page, c: Case) {
  await fillContract(page, c);
  const landlord = sheet(page, 'Tu casero');
  await landlord.getByLabel('Una persona').check();
  await landlord
    .getByRole('group', { name: '¿Tu casero es una empresa o tiene muchas viviendas?' })
    .getByLabel(c.large ?? 'No', { exact: true })
    .check();
  await landlord.getByLabel('Comunidad autónoma').selectOption({ label: 'Comunidad de Madrid' });
  await landlord
    .getByRole('group', { name: '¿Está la vivienda en una zona tensionada?' })
    .getByLabel('No', { exact: true })
    .check();
  await next(page);
  await expect(sheet(page, 'Lo que pagaste al entrar')).toBeVisible();
  await next(page);
  const rent = sheet(page, 'La renta');
  await rent.getByLabel('Renta al empezar').fill('1.000,00');
  await rent.getByLabel('Duración pactada, en meses').fill('60');
  await rent.getByLabel(c.clause, { exact: true }).check();
  if (c.percent) await rent.getByLabel('Porcentaje al año').fill(c.percent);
  await next(page);
  const rises = sheet(page, 'Las subidas');
  await rises.getByLabel('Sí, añadirlas').check();
  const row = rises.getByRole('group', { name: 'Subida 1' });
  await row.getByLabel('Año de la subida').fill(c.rise.year);
  await row.getByLabel('Primer recibo con la renta nueva').fill(c.rise.chargedFrom);
  await row.getByLabel('Renta antes').fill(c.rise.previous);
  await row.getByLabel('Renta después').fill(c.rise.next);
  await row.getByLabel('¿Cómo te avisaron?').selectOption({ label: 'Carta' });
  await row.getByLabel('Fecha del aviso').fill(c.rise.noticeOn);
  await row
    .getByRole('group', { name: '¿Aceptaste esa subida por escrito?' })
    .getByLabel(c.rise.agreed, { exact: true })
    .check();
  await next(page);
  await expect(sheet(page, 'Los gastos')).toBeVisible();
  await next(page);
  await expect(sheet(page, 'La salida')).toBeVisible();
  await page.getByRole('button', { name: 'Revisar' }).click();
  await expect(page.getByRole('heading', { name: 'Resultado', level: 2 })).toBeFocused();
}

for (const { name, viewport } of SIZES) {
  test.describe(name, () => {
    test('a 2025 rise above the IRAV is paid over, counted in the total', async ({ page }) => {
      await open(page, viewport);
      // 20-03-2025: the IRAV of February 2025 (2,08 %) caps a contract signed from 26-05-2023.
      await fillCase(page, {
        signed: '2024-03-15',
        start: '2024-03-20',
        clause: 'El IPC',
        rise: {
          year: '2025',
          previous: '1000',
          next: '1030',
          chargedFrom: '2025-03-01',
          noticeOn: '2025-02-01',
          agreed: 'No',
        },
      });
      const card = page.getByRole('region', { name: 'Subida del 20-03-2025' });
      await expect(card.locator('.item__status')).toHaveText(/Pagas de más: unos 110\s€/);
      await expect(card.getByRole('link', { name: /IRAV|INE/ }).first()).toBeVisible();
      await expect(page.getByRole('region', { name: 'Resumen' })).toContainText(
        /al menos unos 110\s€/,
      );
      // Without the documents API the detail is all there: index, month, publication and cap.
      await card.getByText('Cómo se calcula').click();
      await expect(card).toContainText('Tope legal');
      await expect(card).toContainText(/IRAV de febrero de 2025: 2,08 %, publicado el 14-03-2025/);
    });

    test('a contract from 2018 stops at the gate', async ({ page }) => {
      await open(page, viewport);
      await fillContract(page, { signed: '2018-05-02', start: '2018-05-02' });
      await expect(page.getByRole('heading', { name: 'Resultado', level: 2 })).toBeFocused();
      await expect(page.getByText('Esta revisión no cubre tu contrato')).toBeVisible();
      await expect(
        page.getByText('Esta versión no revisa contratos firmados antes del 6 de marzo de 2019'),
      ).toBeVisible();
      await expect(page.getByRole('region', { name: 'Resumen' })).toBeHidden();
    });

    test('a seasonal contract stops at the gate', async ({ page }) => {
      await open(page, viewport);
      await fillContract(page, { type: 'De temporada', signed: '2025-09-01', start: '2025-09-01' });
      await expect(page.getByText('Esta revisión no cubre tu tipo de contrato')).toBeVisible();
      await expect(page.getByText(/Un contrato de temporada/)).toBeVisible();
      // The sheets it skipped stay closed: the next tab is not a way around the gate.
      await page.getByRole('link', { name: /Contrato/ }).click();
      await expect(sheet(page, 'Tu contrato')).toBeVisible();
    });

    test('«No lo sé» on a large landlord gives two readings', async ({ page }) => {
      await open(page, viewport);
      // 25-06-2023: a 5 % rise agreed in writing; a large landlord stays within the IGC (2 %).
      await fillCase(page, {
        signed: '2020-06-20',
        start: '2020-06-25',
        large: 'No lo sé',
        clause: 'Un porcentaje fijo',
        percent: '5',
        rise: {
          year: '2023',
          previous: '1000',
          next: '1050',
          chargedFrom: '2023-06-01',
          noticeOn: '2023-05-01',
          agreed: 'Sí',
        },
      });
      const card = page.getByRole('region', { name: 'Subida del 25-06-2023' });
      await expect(card.locator('.item__status')).toHaveText('Depende');
      await expect(card).toContainText(
        /Depende de si tu casero es gran tenedor: no se puede comprobar o pagas de más unos 360\s€/,
      );
      await expect(card).toContainText('No se suma al total');
    });

    test('an anniversary inside RDL 8/2026 depends and stays out of the total', async ({
      page,
    }) => {
      await open(page, viewport);
      // 15-04-2026: the IRAV of March 2026 (2,47 %) against the 2 % of the repealed RDL 8/2026.
      await fillCase(page, {
        signed: '2024-04-10',
        start: '2024-04-15',
        clause: 'El IRAV',
        rise: {
          year: '2026',
          previous: '1000',
          next: '1024,70',
          chargedFrom: '2026-04-01',
          noticeOn: '2026-03-01',
          agreed: 'No',
        },
      });
      const card = page.getByRole('region', { name: 'Subida del 15-04-2026' });
      await expect(card.locator('.item__status')).toHaveText('Depende');
      await expect(card).toContainText(/Depende de cómo se lea una norma que ya está derogada/);
      await expect(card).toContainText('No se suma al total');
      await expect(card.getByText('derogada el 30-04-2026', { exact: true })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Resumen' })).not.toContainText('al menos');
    });
  });
}

test('no sheet scrolls sideways at 360×640, with every list open', async ({ page }) => {
  await open(page, { width: 360, height: 640 });
  const overflow = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
  const fits = async (where: string) => expect(await overflow(), where).toBeLessThanOrEqual(0);

  await fits('contrato');
  await fillContract(page, { signed: '2024-03-15', start: '2024-03-20' });
  const landlord = sheet(page, 'Tu casero');
  await fits('casero');
  await landlord.getByLabel('Una empresa').check();
  await landlord
    .getByRole('group', { name: '¿Tu casero es una empresa o tiene muchas viviendas?' })
    .getByLabel('No lo sé')
    .check();
  await landlord.getByLabel('Comunidad autónoma').selectOption({ label: 'Cataluña' });
  await landlord
    .getByRole('group', { name: '¿Está la vivienda en una zona tensionada?' })
    .getByLabel('No lo sé')
    .check();
  await next(page);
  const entry = sheet(page, 'Lo que pagaste al entrar');
  await entry.getByLabel('Fianza', { exact: true }).fill('1.500');
  await entry.getByLabel('Sí, añadirlas').check();
  await entry.getByRole('group', { name: 'Garantía 1' }).getByLabel('Importe').fill('2.000');
  await entry.getByLabel('Sí, añadir pagos').check();
  const fee = entry.getByRole('group', { name: 'Pago 1' });
  await fee.getByLabel('Importe').fill('1.210');
  const later = { name: '¿Te lo descontaron después de la renta o de la fianza?' };
  await fee.getByRole('group', later).getByLabel('No', { exact: true }).check();
  await entry.getByRole('button', { name: 'Añadir pago' }).click();
  const second = entry.getByRole('group', { name: 'Pago 2' });
  await second.getByLabel('Concepto').selectOption({ label: 'Estudio de solvencia' });
  await second.getByLabel('Importe').fill('150');
  await second.getByRole('group', later).getByLabel('No', { exact: true }).check();
  await fits('entrada');
  await next(page);
  const rent = sheet(page, 'La renta');
  await rent.getByLabel('Renta al empezar').fill('1000');
  await rent.getByLabel('Duración pactada, en meses').fill('84');
  await rent.getByLabel('El IPC', { exact: true }).check();
  await fits('renta');
  await next(page);
  await sheet(page, 'Las subidas').getByLabel('Sí, añadirlas').check();
  await fits('subidas');
  // A list never drops below its first row.
  await expect(sheet(page, 'Las subidas').getByRole('button', { name: /Quitar/ })).toBeHidden();
  await sheet(page, 'Las subidas').getByLabel('No ha habido subidas').check();
  await next(page);
  const charges = sheet(page, 'Los gastos');
  await charges.getByLabel('Sí, añadirlos').check();
  const charge = charges.getByRole('group', { name: 'Gasto 1' });
  await charge.getByLabel('Año', { exact: true }).fill('2025');
  await charge.getByLabel('Sí', { exact: true }).check();
  await charge.getByLabel('Importe al año que fija el contrato').fill('600');
  await charge.getByLabel('Lo que te cobraron ese año').fill('640');
  await fits('gastos');
  await next(page);
  const out = sheet(page, 'La salida');
  await out.getByLabel('Sí', { exact: true }).check();
  await out.getByLabel('Día en que devolviste las llaves').fill('2026-07-31');
  await out.getByRole('button', { name: 'Añadir devolución' }).click();
  await out.getByRole('group', { name: 'Devolución 1' }).getByLabel('Fecha').fill('2026-09-30');
  await out.getByRole('group', { name: 'Devolución 1' }).getByLabel('Importe').fill('1.000');
  await out.getByRole('button', { name: 'Añadir descuento' }).click();
  await out.getByRole('group', { name: 'Descuento 1' }).getByLabel('Importe').fill('200');
  await fits('salida');
  await page.getByRole('button', { name: 'Revisar' }).click();
  await expect(page.getByRole('heading', { name: 'Resultado', level: 2 })).toBeFocused();
  for (const d of await page.locator('#resultado details').all())
    await d.locator('summary').click();
  await fits('resultado');
  await expect(page.getByRole('region', { name: 'Devolución de la fianza' })).toContainText(
    'Te deben',
  );
});

test('an empty row on the last sheet can be removed and does not block the review', async ({
  page,
}) => {
  await open(page, { width: 1280, height: 800 });
  await fillCase(page, {
    signed: '2024-03-15',
    start: '2024-03-20',
    clause: 'El IPC',
    rise: {
      year: '2025',
      previous: '1000',
      next: '1030',
      chargedFrom: '2025-03-01',
      noticeOn: '2025-02-01',
      agreed: 'No',
    },
  });
  await page.getByRole('link', { name: /Salida/ }).click();
  const out = sheet(page, 'La salida');
  await out.getByLabel('Sí', { exact: true }).check();
  await out.getByLabel('Día en que devolviste las llaves').fill('2026-07-31');
  for (const [add, row] of [
    ['Añadir devolución', 'Devolución 1'],
    ['Añadir descuento', 'Descuento 1'],
  ] as const) {
    await out.getByRole('button', { name: add }).click();
    await out
      .getByRole('group', { name: row })
      .getByRole('button', { name: /Quitar/ })
      .click();
    await expect(out.getByRole('group', { name: row })).toHaveCount(0);
    await expect(out.getByRole('button', { name: add })).toBeFocused();
  }
  await page.getByRole('button', { name: 'Revisar' }).click();
  await expect(page.getByRole('heading', { name: 'Resultado', level: 2 })).toBeFocused();
  await expect(page.getByRole('region', { name: 'Devolución de la fianza' })).toBeVisible();
});

test('the page has its title, description, heading, canonical, JSON-LD and review date', async ({
  page,
}) => {
  await page.goto('alquiler/');
  const title = await page.title();
  expect(title.length).toBeLessThanOrEqual(60);
  expect(title).toMatch(/alquiler/i);
  expect(title).toMatch(/subida|fianza/i);
  const description =
    (await page.locator('meta[name="description"]').getAttribute('content')) ?? '';
  expect(description.length).toBeGreaterThan(0);
  expect(description.length).toBeLessThanOrEqual(155);
  expect(description).toMatch(/alquiler/);
  expect(description).toMatch(/subida|fianza/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Comprueba si tu alquiler es justo',
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://eslojusto.es/alquiler/',
  );

  const reviewed = page.locator('.desk__reviewed time');
  const day = (await reviewed.getAttribute('datetime')) ?? '';
  expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  const longDay = new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${day}T00:00:00Z`));
  await expect(reviewed).toHaveText(`Revisado el ${longDay}`);

  const json = (await page.locator('script[type="application/ld+json"]').textContent()) ?? '';
  const graph = (JSON.parse(json) as { '@graph': Record<string, unknown>[] })['@graph'];
  const app = graph.find((n) => n['@type'] === 'WebApplication');
  expect(app).toMatchObject({
    name: 'Revisión de alquiler',
    url: 'https://eslojusto.es/alquiler/',
    description,
  });
  const faq = graph.find((n) => n['@type'] === 'FAQPage') as
    { mainEntity: { name: string; acceptedAnswer: { text: string } }[] } | undefined;
  const questions = await page.locator('.faq-item summary').allTextContents();
  expect(questions).toContain('¿Cuánto me pueden subir el alquiler este año?');
  expect(faq?.mainEntity.map((q) => q.name)).toEqual(questions.map((q) => q.trim()));
  // Without the documents API there is no reading and no pass to ask about.
  expect(questions).not.toContain('¿Qué pasa con mis documentos?');

  const guide = page.locator('.guide');
  await expect(guide.getByRole('link', { name: 'IRAV e IPC de cada mes' })).toHaveAttribute(
    'href',
    /\/alquiler\/irav-ipc\/$/,
  );
  await expect(guide).toContainText('pendiente de convalidación');
  // The footer names the rental norms, not the labour ones.
  const footer = page.locator('.footer__note');
  await expect(footer).toContainText('Ley de Arrendamientos Urbanos (Ley 29/1994)');
  await expect(footer).not.toContainText('Estatuto de los Trabajadores');
});
