import { gunzipSync } from 'node:zlib';
import { test, expect, type Locator, type Page, type Request } from '@playwright/test';
import { fitsScreen, noSideScroll } from '../support/sheets';

// Runs only against a build with /empleada-de-hogar/ (TEST_HOUSEHOLD=1), which also carries a test
// analytics key. Every case reads the minimum wage and the norms as loaded on this day, so the
// clock is fixed.
const TODAY = new Date('2026-10-08T12:00:00');

const SIZES = [
  { name: 'desktop', viewport: { width: 1280, height: 800 } },
  { name: '360×640', viewport: { width: 360, height: 640 } },
] as const;
type Viewport = (typeof SIZES)[number]['viewport'];

const sheet = (page: Page, name: string) => page.getByRole('group', { name, exact: true });
const question = (scope: Locator, name: string) => scope.getByRole('group', { name, exact: true });
const choose = (scope: Locator, name: string, value: string) =>
  question(scope, name).getByLabel(value, { exact: true }).check();
const type = (scope: Locator, label: string, value: string) =>
  scope.getByLabel(label, { exact: true }).fill(value);

async function next(page: Page, fit: boolean) {
  if (fit) await fitsScreen(page);
  else await noSideScroll(page);
  await page.getByRole('button', { name: 'Siguiente' }).click();
  // The page turn moves in steps, so a click during it can land beside its target.
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== 'running'),
  );
}

async function open(page: Page, viewport: Viewport) {
  await page.clock.setFixedTime(TODAY);
  await page.setViewportSize(viewport);
  await page.goto('empleada-de-hogar/');
}

const WORK = {
  hourly: 'Por horas, sin vivir en la casa',
  monthly: 'Por meses, sin vivir en la casa',
  liveIn: 'Viviendo en la casa',
} as const;
const ENDING = {
  working: 'Sí, sigo trabajando',
  desistimiento: 'No: la familia ha desistido',
  other: 'No: terminó por otra causa',
  unknown: 'No: no sé cómo terminó',
} as const;

// Everything the walk may answer; what a case leaves out stays blank or unasked.
interface Case {
  readonly work: string;
  readonly start: string;
  readonly ending: string;
  readonly end?: string;
  readonly monthly?: string;
  readonly inKind?: string;
  readonly hourly?: string;
  readonly average?: string;
  readonly extras?: { count: string; apart?: { amount: string; accrual: string } };
  readonly hours?: string;
  readonly weeklyRest?: string;
  readonly rest?: string;
  readonly madeUp?: string;
  readonly holidays?: { days: string; stretch?: string; taken?: string };
  readonly cause?: string;
  readonly writing?: string;
  readonly severance?: { available: string; offered?: string };
  readonly noticeDays?: string;
  readonly substitute?: string;
  readonly night?: string;
  readonly serious?: string;
}

// Answers the sheets the case reaches, in order, up to the last one; `fit` also checks that each
// sheet sits whole on screen. It stops on the last sheet, ready to review.
async function walk(page: Page, c: Case, fit: boolean) {
  const go = () => next(page, fit);
  const work = sheet(page, '¿Cómo trabajas en la casa?');
  await work.getByLabel(c.work, { exact: true }).check();
  await type(work, 'Fecha de inicio', c.start);
  await go();
  const ending = sheet(page, '¿Sigues trabajando?');
  await ending.getByLabel(c.ending, { exact: true }).check();
  if (c.end) await type(ending, 'Último día de trabajo', c.end);
  await go();
  const desistimiento = c.ending === ENDING.desistimiento;
  if (desistimiento) {
    if (c.cause)
      await choose(sheet(page, '¿Qué decía el desistimiento?'), '¿Qué causa indicaba?', c.cause);
    await go();
    const written = sheet(page, '¿Cómo te lo comunicaron?');
    if (c.writing) await choose(written, '¿Te lo comunicaron por escrito?', c.writing);
    await go();
    const severance = sheet(page, '¿Y la indemnización?');
    if (c.severance) {
      await choose(
        severance,
        '¿Pusieron la indemnización a tu disposición al avisarte?',
        c.severance.available,
      );
      if (c.severance.offered)
        await type(severance, 'Importe a tu disposición (bruto)', c.severance.offered);
    }
    await go();
    const notice = sheet(page, '¿Con cuánta antelación te avisaron?');
    if (c.noticeDays) await type(notice, 'Días de antelación', c.noticeDays);
    if (c.substitute)
      await type(notice, 'Pago por los días de preaviso que faltaron', c.substitute);
    await go();
    if (c.work === WORK.liveIn) {
      const night = sheet(page, '¿A qué hora te avisaron?');
      if (c.night) await choose(night, '¿Fue entre las 17:00 y las 08:00?', c.night);
      if (c.serious)
        await choose(
          night,
          '¿Alegaron una falta muy grave a la lealtad y la confianza?',
          c.serious,
        );
      await go();
    }
  }
  const pay = sheet(page, '¿Cuánto cobras?');
  if (c.monthly) await type(pay, 'Sueldo al mes en dinero (bruto)', c.monthly);
  if (c.inKind) await type(pay, 'Pago en especie al mes', c.inKind);
  if (c.hourly) await type(pay, 'Precio por hora (bruto)', c.hourly);
  if (c.average) await type(pay, 'Lo que cobras al mes de media (bruto)', c.average);
  await go();
  if (c.extras) {
    const extras = sheet(page, '¿Y las pagas extra?');
    await type(extras, 'Pagas extra al año', c.extras.count);
    if (c.extras.apart) {
      await choose(extras, '¿Van repartidas en las doce mensualidades?', 'No');
      await type(extras, 'Importe de cada paga extra (bruto)', c.extras.apart.amount);
    } else if (c.extras.count !== '0')
      await choose(extras, '¿Van repartidas en las doce mensualidades?', 'Sí');
    await go();
    if (c.extras.apart) {
      await choose(
        sheet(page, '¿Y cuándo las cobras?'),
        '¿Cuándo se pagan?',
        c.extras.apart.accrual,
      );
      await go();
    }
  }
  const time = sheet(page, '¿Cuántas horas trabajas?');
  if (c.hours) await type(time, 'Horas de trabajo a la semana', c.hours);
  if (c.weeklyRest) await type(time, 'Descanso semanal seguido (horas)', c.weeklyRest);
  await go();
  const rests = sheet(page, '¿Y los descansos?');
  if (c.rest) await type(rests, 'Descanso más corto entre jornadas (horas)', c.rest);
  if (c.madeUp)
    await choose(
      rests,
      'Si descansas menos de 12 horas, ¿se compensa en cuatro semanas?',
      c.madeUp,
    );
  await go();
  const holidays = sheet(page, '¿Y las vacaciones?');
  await type(holidays, 'Días naturales de vacaciones al año', c.holidays?.days ?? '30');
  if (c.holidays?.stretch)
    await type(holidays, 'Vacaciones seguidas más largas (días)', c.holidays.stretch);
  if (c.holidays?.taken) await type(holidays, 'Días ya disfrutados este año', c.holidays.taken);
}

async function review(page: Page, fit: boolean) {
  if (fit) await fitsScreen(page);
  await page.getByRole('button', { name: 'Revisar' }).click();
  await expect(page.getByRole('heading', { name: 'Resultado', level: 2 })).toBeFocused();
  await noSideScroll(page);
}

const HOURLY_BELOW: Case = {
  work: WORK.hourly,
  start: '2025-01-07',
  ending: ENDING.working,
  hourly: '8,50',
  hours: '20',
  weeklyRest: '36',
  rest: '12',
};
const MONTHLY_BELOW: Case = {
  work: WORK.monthly,
  start: '2024-03-01',
  ending: ENDING.working,
  monthly: '1.000,00',
  extras: { count: '2', apart: { amount: '1.000', accrual: 'Al final de cada semestre' } },
  hours: '40',
  weeklyRest: '36',
  rest: '12',
  holidays: { days: '30', stretch: '15' },
};
// A live-in desistimiento without written notice, with a short notice and a night notice.
const LIVE_IN_DESISTIMIENTO: Case = {
  work: WORK.liveIn,
  start: '2020-01-10',
  ending: ENDING.desistimiento,
  end: '2026-09-21',
  monthly: '1.200',
  inKind: '200',
  extras: { count: '2', apart: { amount: '1.200', accrual: 'Al final de cada semestre' } },
  hours: '45',
  weeklyRest: '36',
  rest: '10',
  madeUp: 'No',
  holidays: { days: '30', stretch: '15', taken: '12' },
  cause: 'Un cambio sustancial de sus necesidades',
  writing: 'No',
  severance: { available: 'No' },
  noticeDays: '7',
  substitute: '0',
  night: 'Sí',
  serious: 'No',
};

const card = (page: Page, name: string) => page.getByRole('region', { name, exact: true });

// A card carries the number of the tab its point belongs to.
async function onTab(page: Page, cardName: string, tabName: string) {
  const number = await page
    .locator('.tabs .tab', { hasText: tabName })
    .locator('.tab__number')
    .textContent();
  await expect(card(page, cardName).locator('[data-tab-number]')).toHaveText(number ?? '');
}

for (const { name, viewport } of SIZES) {
  const fit = viewport.width <= 360;
  test.describe(name, () => {
    test('an hourly external worker below the hourly minimum', async ({ page }) => {
      await open(page, viewport);
      await walk(page, HOURLY_BELOW, fit);
      await review(page, fit);

      const hourly = card(page, 'Precio por hora frente al mínimo');
      await expect(hourly.locator('.item__status')).toHaveText(
        /Por debajo de lo que marca la norma/,
      );
      await expect(hourly.getByRole('link', { name: /art\. 8\.5/ })).toBeVisible();
      await hourly.getByText('Cómo se calcula').click();
      await expect(hourly).toContainText('Mínimo por hora de 2026');
      await expect(hourly).toContainText('9,55 €');
      await expect(hourly).toContainText('Te faltan 1,05 € por cada hora trabajada.');
      await expect(card(page, 'Horas a la semana').locator('.item__status')).toHaveText(
        /Dentro de lo que marca la norma/,
      );
      await expect(page.getByRole('region', { name: 'Resumen' })).toContainText(
        'Hay puntos que quedan por debajo de lo que marca la norma.',
      );
      // The shortfall is per hour: nothing adds up to a total, and the summary says why.
      await expect(page.getByRole('region', { name: 'Resumen' })).toContainText(
        'Lo que se ha encontrado no lleva un importe que sumar',
      );
      await onTab(page, 'Precio por hora frente al mínimo', 'Sueldo');
      await onTab(page, 'Horas a la semana', 'Jornada');
      // The extra payments are not asked of an hourly worker, nor reviewed.
      await expect(card(page, 'Pagas extra')).toHaveCount(0);
    });

    test('a monthly worker below the minimum counts a rounded shortfall', async ({ page }) => {
      await open(page, viewport);
      await walk(page, MONTHLY_BELOW, fit);
      await review(page, fit);

      // 1.000 € × 12 + 2 × 1.000 € = 14.000 € a year; the 2026 minimum is 17.094 €.
      const wage = card(page, 'Sueldo frente al SMI');
      await expect(wage.locator('.item__status')).toHaveText(/Podrían faltarte unos 3\.090\s€/);
      await expect(wage.getByRole('link', { name: /art\. 8\.1/ })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Resumen' })).toContainText(
        /Lo que cuenta en todas las lecturas: unos 3\.090\s€\./,
      );
      await expect(card(page, 'Pagas extra').locator('.item__status')).toHaveText(
        /Dentro de lo que marca la norma/,
      );
      await onTab(page, 'Sueldo frente al SMI', 'Sueldo');
      // Still working: no ending to review, no final pay; the unemployment block says the general
      // requirements apply.
      const unemployment = page.getByRole('region', { name: 'Paro', exact: true });
      await expect(unemployment).toContainText('requisitos generales');
      await expect(unemployment).toContainText('disposición transitoria 2.ª');
      await expect(card(page, 'Indemnización del desistimiento')).toHaveCount(0);
      await expect(
        page.getByRole('region', { name: 'Lo que queda por cobrar al terminar' }),
      ).toBeHidden();
    });

    test('a live-in desistimiento without written notice is presumed a dismissal', async ({
      page,
    }) => {
      await open(page, viewport);
      await walk(page, LIVE_IN_DESISTIMIENTO, fit);
      await review(page, fit);

      const presumed = card(page, 'Presunción de despido');
      await expect(presumed.locator('.item__status')).toHaveText(
        /La norma presume que es un despido/,
      );
      await expect(presumed.getByRole('link', { name: /art\. 11\.3/ })).toBeVisible();
      const night = card(page, 'Aviso entre las 17:00 y las 08:00');
      await expect(night.locator('.item__status')).toHaveText(/Falta un requisito de la norma/);
      await expect(night).toContainText('art. 11.4');
      // The severance was not made available: all of it is missing, with the incomplete year
      // read two ways, and only the lower one counts.
      const severance = card(page, 'Indemnización del desistimiento');
      await expect(severance.locator('.item__status')).toHaveText(
        /Podrían faltarte unos 3\.310\s€, y hasta 3\.730\s€/,
      );
      await expect(severance).toContainText('contando solo los años completos');
      await expect(severance).toContainText('contando un día por cada mes empezado');
      await expect(page.getByRole('region', { name: 'Resumen' })).toContainText(
        'Según cómo se cuenten los puntos que la norma deja abiertos',
      );
      await onTab(page, 'Presunción de despido', 'El final');
      await onTab(page, 'Indemnización del desistimiento', 'El final');
      // A warning for working time never adds euros.
      await expect(card(page, 'Horas a la semana').locator('.item__status')).toHaveText(
        /Aviso: conviene revisarlo/,
      );
      await expect(page.getByRole('region', { name: 'Resumen' })).toContainText(
        'Es un aviso: no suma importes.',
      );
      // What is left to collect, and the unemployment information with its link.
      const pending = page.getByRole('region', { name: 'Lo que queda por cobrar al terminar' });
      await expect(pending).toBeVisible();
      await expect(pending).toContainText('Vacaciones sin disfrutar');
      const unemployment = page.getByRole('region', { name: 'Paro', exact: true });
      // The engine's lines say it with their articles; the general text is not repeated.
      await expect(unemployment.locator('[data-unemployment-text]')).toBeHidden();
      await expect(unemployment).toContainText('360 días cotizados');
      await expect(unemployment.getByRole('link', { name: /267/ }).first()).toBeVisible();
      await expect(
        unemployment.getByRole('link', { name: 'Estima cuánto cobrarías de paro' }),
      ).toHaveAttribute('href', /\/paro\/$/);
    });
  });
}

// Not live-in: the night question is never asked and never blocks the review. The «y hasta» comes
// from the incomplete year and from the day the notice is measured to, so it names neither.
test('an external desistimiento reaches the result with a neutral «y hasta»', async ({ page }) => {
  await open(page, SIZES[0].viewport);
  await walk(
    page,
    {
      work: WORK.monthly,
      start: '2025-09-20',
      ending: ENDING.desistimiento,
      end: '2026-09-30',
      monthly: '1.400',
      extras: { count: '2', apart: { amount: '1.400', accrual: 'Al final de cada semestre' } },
      cause: 'Un cambio sustancial de sus necesidades',
      writing: 'Sí',
      severance: { available: 'No' },
      noticeDays: '15',
      hours: '40',
      weeklyRest: '36',
      rest: '12',
    },
    false,
  );
  await review(page, false);
  await expect(page.getByRole('region', { name: 'Resumen' })).toContainText(
    'Según cómo se cuenten los puntos que la norma deja abiertos',
  );
  await expect(card(page, 'Aviso entre las 17:00 y las 08:00')).toHaveCount(0);
  await onTab(page, 'Preaviso', 'El final');
});

test('every sheet of the longest path fits in 360×640', async ({ page }) => {
  await open(page, { width: 360, height: 640 });
  // Every question that can be asked is asked: in kind, the extra payments apart and when, the
  // made-up rest, the stretch and the days taken, the substitute pay and the serious breach.
  await walk(
    page,
    { ...LIVE_IN_DESISTIMIENTO, severance: { available: 'Sí', offered: '1.000' }, noticeDays: '7' },
    true,
  );
  await fitsScreen(page);
});

test('the other sheets that open fit as well', async ({ page }) => {
  await open(page, { width: 360, height: 640 });
  // Spread-over extras and another cause of the Estatuto: the shorter paths.
  await walk(
    page,
    {
      work: WORK.monthly,
      start: '2023-02-01',
      ending: ENDING.other,
      end: '2026-06-30',
      monthly: '1.700',
      extras: { count: '2' },
      hours: '35',
      holidays: { days: '30', taken: '5' },
    },
    true,
  );
  await fitsScreen(page);
  // An hourly worker who also gets the monthly average, once it ended by desistimiento.
  await open(page, { width: 360, height: 640 });
  await walk(
    page,
    {
      work: WORK.hourly,
      start: '2023-02-01',
      ending: ENDING.desistimiento,
      end: '2026-06-30',
      hourly: '10',
      average: '900',
      cause: 'Pérdida de confianza',
      writing: 'Sí',
      severance: { available: 'Sí', offered: '300' },
      noticeDays: '20',
    },
    true,
  );
  await fitsScreen(page);
});

test('the dates sheet stops a relationship that ended before the reform', async ({ page }) => {
  await open(page, { width: 360, height: 640 });
  const work = sheet(page, '¿Cómo trabajas en la casa?');
  await work.getByLabel(WORK.monthly, { exact: true }).check();
  await type(work, 'Fecha de inicio', '2019-05-01');
  await next(page, true);
  const ending = sheet(page, '¿Sigues trabajando?');
  await ending.getByLabel(ENDING.other, { exact: true }).check();
  await type(ending, 'Último día de trabajo', '2022-05-01');
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page.getByRole('heading', { name: 'Resultado', level: 2 })).toBeFocused();
  const out = page.getByRole('region', { name: 'Fuera de esta revisión' });
  await expect(out).toContainText('9 de septiembre de 2022');
  await expect(out).toContainText('disposición transitoria 1.ª');
  await expect(page.getByRole('region', { name: 'Resumen' })).toBeHidden();
  await noSideScroll(page);
});

test('«no sé cómo terminó» reviews the pay and says the end was not reviewed', async ({ page }) => {
  await open(page, { width: 360, height: 640 });
  await walk(
    page,
    {
      work: WORK.monthly,
      start: '2024-03-01',
      ending: ENDING.unknown,
      monthly: '2.000',
      extras: { count: '0' },
      hours: '30',
    },
    true,
  );
  await review(page, true);
  await expect(page.getByRole('region', { name: 'Resumen' })).toContainText(
    'Como no sabes cómo terminó, no se ha revisado el final',
  );
});

test('a figure that does not read is announced next to its field', async ({ page }) => {
  await open(page, { width: 360, height: 640 });
  const work = sheet(page, '¿Cómo trabajas en la casa?');
  await work.getByLabel(WORK.monthly, { exact: true }).check();
  await type(work, 'Fecha de inicio', '2024-03-01');
  await next(page, true);
  await sheet(page, '¿Sigues trabajando?').getByLabel(ENDING.working, { exact: true }).check();
  await next(page, true);
  await type(sheet(page, '¿Cuánto cobras?'), 'Sueldo al mes en dinero (bruto)', 'mucho');
  await page.getByRole('button', { name: 'Siguiente' }).click();
  const field = page.getByLabel('Sueldo al mes en dinero (bruto)', { exact: true });
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText('Escribe una cifra, por ejemplo 1.250,00.')).toBeVisible();
});

test('the page has its title, heading, canonical, JSON-LD, review date and guide', async ({
  page,
}) => {
  await open(page, { width: 1280, height: 800 });
  await expect(page).toHaveTitle(/Empleada de hogar/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Comprueba si lo que te pagan en casa es justo',
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://eslojusto.es/empleada-de-hogar/',
  );
  await expect(page.locator('.desk__reviewed')).toContainText('Revisado el');
  const jsonLd = await page.locator('script[type="application/ld+json"]').textContent();
  const graph = JSON.parse(jsonLd ?? '{}') as { '@graph': { '@type': string }[] };
  expect(graph['@graph'].map((n) => n['@type'])).toEqual([
    'WebApplication',
    'BreadcrumbList',
    'FAQPage',
  ]);
  await expect(page.getByRole('heading', { name: 'El desistimiento de la familia' })).toBeVisible();
  await page.getByText('¿Cuál es el sueldo mínimo en el servicio del hogar?').click();
  await expect(page.locator('#faq-hogar-smi')).toContainText('9,55 €');
  await expect(page.getByText('informa sobre tus derechos y no da asesoramiento')).toBeVisible();
});

test('the home page shows the card and the sitemap lists the page', async ({ page, request }) => {
  await page.goto('');
  const home = page.getByRole('link', { name: 'Empleada de hogar' });
  await expect(home).toHaveAttribute('href', /\/empleada-de-hogar\/$/);
  await expect(
    page.getByText('Trabajas en una casa: tu sueldo y el desistimiento frente a la ley'),
  ).toBeVisible();
  const sitemap = await request.get('sitemap-0.xml');
  expect(await sitemap.text()).toContain('/empleada-de-hogar/');
});

test('the form asks for no name, identifier, address, nationality, status, health or pregnancy', async ({
  page,
}) => {
  await open(page, { width: 1280, height: 800 });
  const form = await page.locator('#household').innerText();
  const labels = await page.locator('#household label, #household legend').allInnerTexts();
  const text = `${form} ${labels.join(' ')}`.toLowerCase();
  for (const word of [
    'nombre',
    'dni',
    'nie',
    'domicilio',
    'dirección',
    'nacionalidad',
    'extranjer',
    'permiso de residencia',
    'situación administrativa',
    'salud',
    'embaraz',
    'baja médica',
  ])
    expect(text, word).not.toContain(word);
  // Only these kinds of control exist.
  const kinds = await page
    .locator('#household input')
    .evaluateAll((els) => [...new Set(els.map((e) => (e as HTMLInputElement).type))].sort());
  expect(kinds).toEqual(['date', 'radio', 'text']);
});

// ---------- Analytics ----------

const POSTHOG = 'https://eu.i.posthog.com';

interface Captured {
  event: string;
  properties: Record<string, unknown>;
}

function decode(r: Request): string {
  const body = r.postDataBuffer();
  if (!body) return '';
  const compression = new URL(r.url()).searchParams.get('compression');
  if (compression === 'gzip-js' || (body[0] === 0x1f && body[1] === 0x8b))
    return gunzipSync(body).toString('utf8');
  const raw = body.toString('utf8');
  if (compression === 'base64' || raw.startsWith('data=')) {
    const data = new URLSearchParams(raw).get('data') ?? '';
    return Buffer.from(data, 'base64').toString('utf8');
  }
  return raw;
}

function eventsIn(body: string): Captured[] {
  if (!body) return [];
  const json: unknown = JSON.parse(body);
  const list = Array.isArray(json)
    ? json
    : json && typeof json === 'object' && 'batch' in json && Array.isArray(json.batch)
      ? json.batch
      : [json];
  return list as Captured[];
}

test('analytics carry codes and buckets, never a typed value', async ({ page }) => {
  await page.addInitScript(() => {
    // PostHog drops events from automated browsers; the page must look like a person's.
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'userAgentData', { get: () => undefined });
    // Playwright cannot route a beacon, which PostHog uses on pagehide; a fetch it can.
    navigator.sendBeacon = (url, data) => {
      void fetch(url, { method: 'POST', body: data ?? null });
      return true;
    };
  });
  const bodies: string[] = [];
  await page.route(`${POSTHOG}/**`, async (route) => {
    bodies.push(decode(route.request()));
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":1}' });
  });
  const named = (n: string) => bodies.flatMap(eventsIn).filter((e) => e.event === n);

  await open(page, { width: 360, height: 640 });
  // A rejected answer first: its field is named, never what was typed.
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await walk(
    page,
    {
      work: WORK.liveIn,
      start: '2020-01-10',
      ending: ENDING.desistimiento,
      end: '2026-09-21',
      monthly: '1.234,56',
      extras: { count: '2', apart: { amount: '1.234,56', accrual: 'Una vez al año' } },
      hours: '47,5',
      weeklyRest: '35',
      rest: '9,5',
      madeUp: 'No',
      holidays: { days: '30', stretch: '14', taken: '13' },
      cause: 'Pérdida de confianza',
      writing: 'No',
      severance: { available: 'Sí', offered: '987,65' },
      noticeDays: '9',
      substitute: '321,09',
      night: 'No',
    },
    false,
  );
  await review(page, false);
  await card(page, 'Presunción de despido').getByText('Cómo se calcula').click();
  await page.getByText('¿Qué es el desistimiento y qué tiene que cumplir?').click();

  await expect.poll(() => named('household_review_completed').length, { timeout: 15_000 }).toBe(1);
  await expect.poll(() => named('help_opened').length, { timeout: 15_000 }).toBe(1);
  await expect.poll(() => named('detail_opened').length, { timeout: 15_000 }).toBe(1);

  expect(named('section_viewed').map((e) => e.properties['section'])).toEqual([
    'trabajo',
    'fechas',
    'desistimiento',
    'escrito',
    'indemnizacion',
    'preaviso',
    'noche',
    'sueldo',
    'pagas',
    'pagas-cuando',
    'jornada',
    'descansos',
    'vacaciones',
    'resultado',
  ]);
  expect(named('validation_error').map((e) => e.properties['field'])).toEqual([
    'work',
    'startDate',
  ]);
  const completed = named('household_review_completed')[0]?.properties;
  expect(completed).toMatchObject({
    work: 'live_in',
    pay_period: '2026+',
    ending: 'desistimiento',
    extra_pays: 'apart',
    written: 'no',
    severance_available: 'yes',
  });
  expect(named('help_opened')[0]?.properties['topic']).toBe('faq-hogar-desistimiento');
  expect(named('detail_opened')[0]?.properties['item']).toBe('termination');

  // Nothing typed leaves in any request: not a figure, a date nor a day count.
  const everything = bodies.join('\n');
  for (const typed of [
    '1.234,56',
    '1234,56',
    '1234.56',
    '47,5',
    '47.5',
    '9,5',
    '987,65',
    '987.65',
    '321,09',
    '321.09',
    '2020-01-10',
    '10-01-2020',
    '2026-09-21',
    '21-09-2026',
  ])
    expect(everything, typed).not.toContain(typed);
});
