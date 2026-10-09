import { gunzipSync } from 'node:zlib';
import { test, expect, type Page, type Request } from '@playwright/test';
import { nextSheet } from '../support/sheets';

const ORIGIN = `http://localhost:${process.env['E2E_PORT'] ?? 4321}`;

// Runs only against a build with PUBLIC_POSTHOG_KEY=phc_test (TEST_ANALYTICS=1).

const POSTHOG = 'https://eu.i.posthog.com';

interface CapturedEvent {
  event: string;
  properties: Record<string, unknown>;
  [key: string]: unknown;
}

function decode(r: Request): string {
  const body = r.postDataBuffer();
  if (!body) return '';
  const compression = new URL(r.url()).searchParams.get('compression');
  if (compression === 'gzip-js' || (body[0] === 0x1f && body[1] === 0x8b))
    return gunzipSync(body).toString('utf8');
  const text = body.toString('utf8');
  if (compression === 'base64' || text.startsWith('data=')) {
    const data = new URLSearchParams(text).get('data') ?? '';
    return Buffer.from(data, 'base64').toString('utf8');
  }
  return text;
}

function eventsIn(body: string): CapturedEvent[] {
  if (!body) return [];
  const json: unknown = JSON.parse(body);
  const list = Array.isArray(json)
    ? json
    : json && typeof json === 'object' && 'batch' in json && Array.isArray(json.batch)
      ? json.batch
      : [json];
  return list as CapturedEvent[];
}

// Random ids, clocks and tracked times: each must have its shape, which nothing typed can
// take; only then is it left out of the search for typed values.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const NUMBER = /^\d+(\.\d+)?(e-\d+)?$/;
const SHAPE: Record<string, RegExp> = {
  uuid: UUID,
  timestamp: ISO,
  distinct_id: UUID,
  $device_id: UUID,
  $session_id: UUID,
  $window_id: UUID,
  $pageview_id: UUID,
  $insert_id: /^[a-z0-9]{8,24}$/,
  $time: NUMBER,
  $prev_pageview_duration: NUMBER,
  $prev_pageview_max_scroll_percentage: NUMBER,
};

function withoutRandom(e: CapturedEvent): string {
  const strip = (object: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(object).filter(([key, value]) => {
        const shape = SHAPE[key];
        if (shape) expect(String(value), key).toMatch(shape);
        return !shape;
      }),
    );
  return JSON.stringify({ ...strip(e), properties: strip(e.properties) });
}

// The exact keys that leave with each kind of event. A posthog-js upgrade that adds one fails
// here, before the privacy page goes out of date.
const TECHNICAL = [
  'token',
  'distinct_id',
  '$device_id',
  '$session_id',
  '$window_id',
  '$insert_id',
  '$time',
  '$lib',
  '$lib_version',
  '$process_person_profile',
];
const PAGE = [
  '$current_url',
  '$pathname',
  '$host',
  '$referring_domain',
  '$browser',
  '$browser_version',
  '$os',
  '$device_type',
  '$viewport_width',
  '$viewport_height',
];
const keys = (e: CapturedEvent | undefined) => Object.keys(e?.properties ?? {}).toSorted();

async function spyOn(page: Page) {
  // PostHog drops events from automated browsers; the page must look like a person's.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'userAgentData', { get: () => undefined });
    // Playwright cannot route a beacon, which PostHog uses on pagehide; a fetch it can.
    navigator.sendBeacon = (url, data) => {
      void fetch(url, { method: 'POST', body: data ?? null });
      return true;
    };
  });
  const bodies: string[] = [];
  const external: string[] = [];
  page.on('request', (r) => {
    const { origin } = new URL(r.url());
    if (origin !== ORIGIN && origin !== POSTHOG) external.push(r.url());
  });
  await page.route(`${POSTHOG}/**`, async (route) => {
    bodies.push(decode(route.request()));
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":1}' });
  });
  const events = () => bodies.flatMap(eventsIn);
  const named = (name: string) => events().filter((e) => e.event === name);
  return { bodies, external, events, named };
}

test.use({ locale: 'ja-JP' });

test('tracks languages, steps and outcome without sending anything typed', async ({
  page,
  context,
}) => {
  const spy = await spyOn(page);
  const blocked: string[] = [];
  page.on('console', (m) => {
    if (/Content Security Policy/i.test(m.text())) blocked.push(m.text());
  });

  // A campaign link from a search: the click id, the query strings and the search terms must
  // not reach PostHog.
  await page.goto('finiquito/?gclid=ABC123&utm_source=test#causa', {
    referer: 'https://www.google.com/search?q=finiquito+1500',
  });
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute(
    'content',
    /connect-src 'self' https:\/\/eu\.i\.posthog\.com;/,
  );

  // A browser translator marks <html> the way Chrome's and Google's do.
  await page.evaluate(() => {
    document.documentElement.classList.add('translated-rtl');
    document.documentElement.lang = 'ar';
  });

  const next = () => nextSheet(page);
  await next(); // no cause: a validation error
  await page.getByLabel('Despido improcedente').check();
  await next();
  await page.getByLabel('Fecha de alta', { exact: true }).fill('2010-03-01');
  await page.getByLabel('Fecha de baja', { exact: true }).fill('2026-09-15');
  await next();
  await next();
  await page
    .getByRole('group', { name: '¿Tus pagas extra van prorrateadas en la nómina?' })
    .getByLabel('Sí')
    .check();
  await next();
  await page.getByLabel('Salario bruto mensual').fill('1.500');
  await next();
  await next();
  await page.getByLabel('Disfrutados este año').fill('0');
  await next();
  await page.getByLabel('1', { exact: true }).check();
  await next();
  await page.getByLabel('Sí, añadir fechas').check();
  await page.getByLabel('Fecha de alta del trabajo 1').fill('2008-02-01');
  await page.getByLabel('Fecha de baja del trabajo 1').fill('2009-11-30');
  await page
    .getByRole('group', { name: '¿Has cobrado paro después de alguno?' })
    .getByLabel('No', { exact: true })
    .check();
  await next();
  await next();
  await page.getByLabel('Indemnización').fill('40.000,00');
  await page.getByRole('button', { name: 'Revisar' }).click();
  await expect(page.getByRole('heading', { name: /Resultado/ })).toBeVisible();
  await page.getByRole('region', { name: 'Indemnización' }).getByText('Cómo se calcula').click();
  await page.getByText('¿Se envían mis datos a algún sitio?').click();

  await expect.poll(() => spy.named('help_opened').length, { timeout: 15_000 }).toBe(1);
  await expect.poll(() => spy.named('review_completed').length, { timeout: 15_000 }).toBe(1);

  expect(spy.named('browser_language').map((e) => e.properties['lang'])).toEqual(['ja']);
  expect(spy.named('page_translated').map((e) => e.properties['lang'])).toEqual(['ar']);
  expect(spy.named('$pageview')).toHaveLength(1);
  expect(spy.named('validation_error').map((e) => e.properties['field'])).toEqual(['cause']);
  expect(spy.named('section_viewed').map((e) => e.properties['section'])).toEqual([
    'causa',
    'fechas',
    'situacion',
    'prorrateo',
    'salario',
    'erte',
    'vacaciones',
    'hijos',
    'otros',
    'pago',
    'finiquito',
    'resultado',
  ]);
  expect(spy.named('section_completed')).toHaveLength(11);
  expect(spy.named('detail_opened').map((e) => e.properties['item'])).toEqual(['severance']);
  expect(spy.named('help_opened')[0]?.properties['topic']).toBe('faq-datos');
  expect(spy.named('review_completed')[0]?.properties).toMatchObject({
    cause: 'unfair_dismissal',
    fixed_term_type: 'not_applicable',
    extra_pay: 'prorated',
    holiday_unit: 'working',
    work_week: '5',
    figures_entered: 1,
    result: expect.stringMatching(/^(shortfall|all_match)$/),
    attempt: '1',
    changed_fields: [],
    benefit: 'with_figures',
    other_contracts: '1',
    unfair_reference: 'none',
    detail: 'unlocked',
  });
  expect(keys(spy.named('review_completed')[0])).toEqual(
    [
      ...TECHNICAL,
      ...PAGE,
      '$pageview_id',
      'utm_source',
      'cause',
      'fixed_term_type',
      'extra_pay',
      'holiday_unit',
      'work_week',
      'figures_entered',
      'below_minimum',
      'matching',
      'above_minimum',
      'not_checkable',
      'deduction_too_high',
      'difference',
      'result',
      'attempt',
      'changed_fields',
      'seconds',
      'benefit',
      'other_contracts',
      'unfair_reference',
      'detail',
    ].toSorted(),
  );

  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  await expect.poll(() => spy.named('$pageleave').length, { timeout: 15_000 }).toBe(1);

  expect(keys(spy.named('$pageview')[0])).toEqual(
    [...TECHNICAL, ...PAGE, '$pageview_id', 'utm_source'].toSorted(),
  );
  expect(keys(spy.named('$pageleave')[0])).toEqual(
    [
      ...TECHNICAL,
      ...PAGE,
      '$pageview_id',
      'utm_source',
      '$prev_pageview_duration',
      '$prev_pageview_max_scroll_percentage',
    ].toSorted(),
  );
  // The first sheet can be reported before posthog-js has tagged the page view, so its id may
  // or may not be there yet; its shape is still checked when it is.
  expect(keys(spy.named('section_viewed')[0]).filter((k) => k !== '$pageview_id')).toEqual(
    [...TECHNICAL, ...PAGE, 'utm_source', 'section'].toSorted(),
  );
  for (const e of spy.events())
    expect(Object.keys(e).toSorted(), e.event).toEqual([
      'event',
      'properties',
      'timestamp',
      'uuid',
    ]);
  expect(spy.named('$pageview')[0]?.properties).toMatchObject({
    $referring_domain: 'www.google.com',
    utm_source: 'test',
  });

  for (const e of spy.events()) {
    const text = withoutRandom(e);
    for (const forbidden of [
      '1500',
      '1.500',
      '40000',
      '40.000',
      '2010-03-01',
      '2026-09-15',
      '2008-02-01',
      '2009-11-30',
    ])
      expect(text, `${e.event}: ${forbidden}`).not.toContain(forbidden);
  }
  const userAgent = await page.evaluate(() => navigator.userAgent);
  for (const body of spy.bodies)
    for (const forbidden of ['ABC123', 'gclid', 'ja-JP', userAgent, 'search', 'q=', 'finiquito+'])
      expect(body, forbidden).not.toContain(forbidden);
  const urls = spy.events().map((e) => String(e.properties['$current_url']));
  expect(urls.length).toBeGreaterThan(0);
  for (const url of urls) expect(url).toMatch(new RegExp(`^${ORIGIN}/finiquito/(#[a-z]+)?$`));
  expect(spy.external).toEqual([]);
  expect(blocked).toEqual([]);
  expect(await context.cookies()).toEqual([]);
});

test("a full run writes nothing to the browser's storage", async ({ page, context }) => {
  const spy = await spyOn(page);
  const stored = () =>
    page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }));
  await page.goto('finiquito/');
  const next = () => nextSheet(page);
  await next();
  await page.getByLabel('Fin de contrato temporal').check();
  await next();
  await page.getByLabel('Eventual').check();
  await next();
  await page.getByLabel('Fecha de alta', { exact: true }).fill('2024-01-01');
  await page.getByLabel('Fecha de baja', { exact: true }).fill('2026-09-15');
  await next();
  await page
    .getByRole('group', { name: '¿Tus pagas extra van prorrateadas en la nómina?' })
    .getByLabel('No')
    .check();
  await next();
  await page.getByLabel('Salario bruto mensual').fill('1.500');
  await next();
  await page.getByLabel('Importe de cada paga').fill('1.500');
  await next();
  await page.getByRole('button', { name: 'Atrás' }).click();
  await next();
  await page.getByRole('checkbox', { name: 'No lo sé' }).check();
  await next();
  await next();
  await page.getByLabel('Prefiero no decirlo').check();
  await next();
  await next();
  await next();
  await page.getByRole('button', { name: 'Revisar' }).click();
  await page.getByRole('region', { name: 'Indemnización' }).getByText('Cómo se calcula').click();
  await page.getByText('¿Se envían mis datos a algún sitio?').click();
  await page.getByRole('button', { name: 'Empezar de nuevo' }).click();
  await expect.poll(() => spy.named('started_over').length, { timeout: 15_000 }).toBe(1);

  expect(await stored()).toEqual({ local: {}, session: {} });
  expect(await context.cookies()).toEqual([]);
  expect(spy.named('section_viewed').map((e) => e.properties['section'])).toEqual([
    'causa',
    'temporal',
    'fechas',
    'prorrateo',
    'salario',
    'pagas',
    'vacaciones',
    'pagas',
    'vacaciones',
    'preaviso',
    'hijos',
    'otros',
    'pago',
    'finiquito',
    'resultado',
    'causa',
  ]);
  expect(spy.named('went_back').map((e) => [e.properties['from'], e.properties['to']])).toEqual([
    ['vacaciones', 'pagas'],
  ]);

  // The theme is the one thing kept, and only once the visitor asks for it.
  await page.getByRole('button', { name: /Tema/ }).click();
  expect(Object.keys((await stored()).local)).toEqual(['tema']);
  expect((await stored()).session).toEqual({});
});

test('a repeated review counts the attempt and names only what changed', async ({ page }) => {
  const spy = await spyOn(page);
  await page.goto('finiquito/');
  const next = () => nextSheet(page);
  await page.getByLabel('Baja voluntaria (dimisión)').check();
  await next();
  await page.getByLabel('Fecha de alta', { exact: true }).fill('2020-01-01');
  await page.getByLabel('Fecha de baja', { exact: true }).fill('2026-09-15');
  await next();
  await page
    .getByRole('group', { name: '¿Tus pagas extra van prorrateadas en la nómina?' })
    .getByLabel('Sí')
    .check();
  await next();
  await page.getByLabel('Salario bruto mensual').fill('1.500');
  await next();
  await page.getByLabel('Disfrutados este año').fill('0');
  await next();
  await next();
  await next();
  await page.getByRole('button', { name: 'Revisar' }).click();
  await page.getByRole('link', { name: /Salario/ }).click();
  await next(); // the Salario tab opens on the prorating sheet, already answered
  await page.getByLabel('Salario bruto mensual').fill('1.600');
  await next();
  await next();
  await next();
  await next();
  await page.getByRole('button', { name: 'Revisar' }).click();
  await page.getByRole('button', { name: 'Empezar de nuevo' }).click();

  await expect.poll(() => spy.named('started_over').length, { timeout: 15_000 }).toBe(1);
  expect(
    spy
      .named('review_completed')
      .map((e) => [e.properties['attempt'], e.properties['changed_fields']]),
  ).toEqual([
    ['1', []],
    ['2', ['monthlySalary']],
  ]);
  expect(spy.named('went_back').map((e) => [e.properties['from'], e.properties['to']])).toEqual([
    ['resultado', 'prorrateo'],
  ]);
  for (const e of spy.events()) expect(withoutRandom(e)).not.toMatch(/1\.?[56]00/);
});

test('the situations of a possibly null dismissal never leave the page, not even by name', async ({
  page,
}) => {
  const spy = await spyOn(page);
  await page.goto('finiquito/');
  const next = () => nextSheet(page);
  await page.getByLabel('Despido objetivo').check();
  await next();
  await page.getByLabel('Fecha de alta', { exact: true }).fill('2020-01-01');
  await page.getByLabel('Fecha de baja', { exact: true }).fill('2026-09-15');
  await next();
  await page.getByLabel('Sí, marcar cuáles').check();
  await page.getByLabel('Estabas embarazada').check();
  await page.getByLabel('Estabas de baja médica').check();
  await next();
  await page
    .getByRole('group', { name: '¿Tus pagas extra van prorrateadas en la nómina?' })
    .getByLabel('Sí')
    .check();
  await next();
  await page.getByLabel('Salario bruto mensual').fill('1.500');
  await next();
  await next();
  await page.getByLabel('Disfrutados este año').fill('0');
  await next();
  await next();
  await page.getByLabel('Ninguno').check();
  await next();
  await next();
  await next();
  await page.getByRole('button', { name: 'Revisar' }).click();
  await expect(page.getByRole('region', { name: 'Este despido podría ser nulo' })).toBeVisible();
  // Unticking one and reviewing again would name a changed field, were they ever tracked.
  await page.getByRole('link', { name: /Fechas/ }).click();
  await next();
  await page.getByLabel('Estabas de baja médica').uncheck();
  await page.getByRole('link', { name: /Tu finiquito/ }).click();
  await nextSheet(page);
  await page.getByRole('button', { name: 'Revisar' }).click();
  await expect.poll(() => spy.named('review_completed').length, { timeout: 15_000 }).toBe(2);

  expect(spy.named('review_completed')[1]?.properties['changed_fields']).toEqual([]);
  for (const e of spy.events())
    expect(withoutRandom(e)).not.toMatch(
      /situation|embaraz|pregnan|sick|baja m[eé]dica|family_leave|care_rights|violence/i,
    );
});

test('with the do-not-track signal nothing is sent', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'globalPrivacyControl', { get: () => true });
  });
  const spy = await spyOn(page);
  await page.goto('finiquito/');
  await page.getByLabel('Baja voluntaria (dimisión)').check();
  await nextSheet(page);
  await page.waitForTimeout(1500);
  expect(spy.bodies).toEqual([]);
  expect(spy.external).toEqual([]);
});

// The keys an event carries of its own, past what PostHog and the page add to every one.
const ownKeys = (e: CapturedEvent | undefined) =>
  keys(e).filter((k) => !TECHNICAL.includes(k) && !PAGE.includes(k) && k !== '$pageview_id');

test('the rental review sends sheets, field names and its outcome in codes, never a figure or a date', async ({
  page,
  context,
}) => {
  const spy = await spyOn(page);
  await page.clock.setFixedTime(new Date('2026-10-08T12:00:00'));
  await page.goto('alquiler/');
  const next = () => nextSheet(page);
  const sheet = (name: string) => page.getByRole('group', { name, exact: true });

  await next(); // nothing answered: validation errors, by field name
  const type = '¿Qué tipo de contrato es?';
  await sheet('Tu contrato').getByLabel(type).selectOption({ label: 'Vivienda habitual' });
  await next();
  await next(); // no dates yet: more validation errors
  const dates = sheet('Las fechas del contrato');
  await dates.getByLabel('Fecha del contrato', { exact: true }).fill('2024-03-15');
  await dates.getByLabel('Fecha de entrada', { exact: true }).fill('2024-03-20');
  await next();
  await sheet('Tu casero').getByLabel('Una persona').check();
  await next();
  await sheet('Gran tenedor').getByLabel('No lo sé', { exact: true }).check();
  await next();
  const home = sheet('Dónde está la vivienda');
  await home.getByLabel('Comunidad autónoma').selectOption({ label: 'Comunidad de Madrid' });
  await home
    .getByRole('group', { name: '¿Está la vivienda en una zona tensionada?' })
    .getByLabel('No', { exact: true })
    .check();
  await next();
  await next();
  await next();
  await next();
  const rent = sheet('La renta');
  await rent.getByLabel('Renta al empezar').fill('1.000,00');
  await rent.getByLabel('Duración pactada, en meses').fill('60');
  await next();
  await sheet('La actualización de la renta')
    .getByLabel('¿Qué dice el contrato sobre actualizar la renta?')
    .selectOption({ label: 'El IPC' });
  await next();
  const rises = sheet('Las subidas');
  await rises.getByLabel('Sí, añadirlas').check();
  const row = rises.getByRole('group', { name: 'Subida 1' });
  await row.getByLabel('Año de la subida').fill('2025');
  await row.getByLabel('Primer recibo con la renta nueva').fill('2025-03-01');
  await row.getByLabel('Renta antes').fill('1000');
  await row.getByLabel('Renta después').fill('1030');
  await row.getByLabel('¿Cómo te avisaron?').selectOption({ label: 'Carta' });
  await row.getByLabel('Fecha del aviso').fill('2025-02-01');
  await row
    .getByRole('group', { name: '¿Aceptaste esa subida?' })
    .getByLabel('No', { exact: true })
    .check();
  await next();
  await next();
  await page.getByRole('button', { name: 'Revisar' }).click();
  await expect(page.getByRole('heading', { name: 'Resultado', level: 2 })).toBeFocused();
  await page
    .getByRole('region', { name: 'Subida del 20-03-2025' })
    .getByText('Cómo se calcula')
    .click();
  await page.getByText('¿Qué es el IRAV?').click();

  await expect.poll(() => spy.named('help_opened').length, { timeout: 15_000 }).toBe(1);
  await expect.poll(() => spy.named('rental_review_completed').length, { timeout: 15_000 }).toBe(1);

  // A gate: a seasonal lease stops at the first sheet.
  await page.getByRole('button', { name: 'Empezar de nuevo' }).click();
  await sheet('Tu contrato').getByLabel(type).selectOption({ label: 'De temporada' });
  await next();
  await dates.getByLabel('Fecha del contrato', { exact: true }).fill('2025-09-01');
  await dates.getByLabel('Fecha de entrada', { exact: true }).fill('2025-09-01');
  await next();
  await expect.poll(() => spy.named('rental_out_of_scope').length, { timeout: 15_000 }).toBe(1);

  expect(new Set(spy.named('validation_error').map((e) => e.properties['field']))).toEqual(
    new Set(['contractType', 'signedOn', 'startDate']),
  );
  expect(
    spy.named('validation_error').map((e) => [e.properties['field'], e.properties['section']]),
  ).toEqual([
    ['contractType', 'contrato'],
    ['signedOn', 'fechas'],
    ['startDate', 'fechas'],
  ]);
  expect(spy.named('section_viewed').map((e) => e.properties['section'])).toEqual([
    'contrato',
    'fechas',
    'casero',
    'gran-tenedor',
    'vivienda',
    'entrada',
    'garantias',
    'pagos',
    'renta',
    'actualizacion',
    'subidas',
    'salida',
    'gastos',
    'resultado',
    'contrato',
    'fechas',
    'resultado',
  ]);
  expect(spy.named('detail_opened').map((e) => e.properties['item'])).toEqual(['rent_update']);
  expect(spy.named('help_opened').map((e) => e.properties['topic'])).toEqual(['faq-alquiler-irav']);
  expect(spy.named('started_over')).toHaveLength(1);

  const completed = spy.named('rental_review_completed')[0];
  expect(completed?.properties).toMatchObject({
    signed_period: '2023-2026',
    landlord: 'person',
    large_landlord: 'unknown',
    clause: 'ipc',
    updates: '1',
    rent_update: 'paid_over',
    fees: 'none',
    charges: 'none',
    deposit_return: 'none',
    offered: true,
    detail: 'unlocked',
    attempt: '1',
  });
  expect(ownKeys(completed)).toEqual(
    [
      'signed_period',
      'landlord',
      'large_landlord',
      'clause',
      'updates',
      'fees',
      'guarantees',
      'rent_update',
      'charges',
      'deposit_return',
      'depends',
      'difference',
      'offered',
      'detail',
      'attempt',
      'seconds',
    ].toSorted(),
  );
  const outOfScope = spy.named('rental_out_of_scope')[0];
  expect(outOfScope?.properties['reason']).toBe('seasonal');
  expect(ownKeys(outOfScope)).toEqual(['reason']);

  for (const e of spy.events()) {
    const text = withoutRandom(e);
    for (const forbidden of [
      '1000',
      '1.000',
      '1030',
      '1.030',
      '2024-03-15',
      '2024-03-20',
      '2025-03-01',
      '2025-02-01',
      '2025-09-01',
      '20-03-2025',
    ])
      expect(text, `${e.event}: ${forbidden}`).not.toContain(forbidden);
  }
  for (const e of spy.events())
    expect(String(e.properties['$current_url'])).toMatch(
      new RegExp(`^${ORIGIN}/alquiler/(#[a-z-]+)?$`),
    );
  expect(spy.external).toEqual([]);
  expect(await context.cookies()).toEqual([]);
});

test('the contract review sends sheets, field names and its outcome in codes, never a figure, a date or a name', async ({
  page,
  context,
}) => {
  const spy = await spyOn(page);
  await page.clock.setFixedTime(new Date('2026-10-08T12:00:00'));
  await page.goto('contrato/');
  const next = () => nextSheet(page);
  const sheet = (name: string) => page.getByRole('group', { name, exact: true });
  const choose = (scope: ReturnType<typeof sheet>, name: string, value: string) =>
    scope.getByRole('group', { name, exact: true }).getByLabel(value, { exact: true }).check();

  await next(); // nothing answered: validation errors, by field name
  const kind = '¿Qué relación tienes con la empresa?';
  await sheet('Tu relación laboral')
    .getByLabel(kind)
    .selectOption({ label: 'Trabajo por cuenta ajena' });
  await next();
  const hiring = sheet('Cómo te contrataron');
  await choose(hiring, '¿Te contrató una empresa de trabajo temporal para trabajar en otra?', 'No');
  await choose(hiring, '¿Es un contrato de relevo?', 'No');
  await next();
  const written = sheet('Tu edad y tu contrato');
  await choose(written, '¿Tienes menos de 18 años?', 'No');
  await choose(written, '¿Tienes el contrato por escrito?', 'Sí');
  await next();
  const dates = sheet('Fechas del contrato');
  await dates.getByLabel('Fecha de inicio', { exact: true }).fill('2026-01-01');
  await next();
  await sheet('Tu tipo de contrato')
    .getByLabel('¿Qué tipo de contrato es?')
    .selectOption({ label: 'Indefinido' });
  await next();
  await sheet('Tu salario').getByLabel('Salario bruto', { exact: true }).fill('1.150,00');
  await next();
  await choose(sheet('El periodo del salario'), '¿Por qué periodo es esa cifra?', 'Al mes');
  await next();
  await sheet('Horas del contrato').getByLabel('Horas a la semana', { exact: true }).fill('40');
  await next();
  const extras = sheet('Tus pagas extra');
  await extras.getByLabel('Pagas extra al año', { exact: true }).fill('2');
  await choose(extras, '¿Las pagas extra van prorrateadas en cada nómina?', 'No');
  await next();
  await next();
  await choose(sheet('Tu convenio'), '¿El contrato nombra tu convenio colectivo?', 'Sí');
  await next();
  await next();
  await next();
  await choose(sheet('Tu jornada'), '¿Trabajas a turnos?', 'No');
  await next();
  const night = sheet('Noche y jornada irregular');
  await choose(night, '¿Trabajas de noche?', 'No');
  await choose(night, '¿El contrato reparte la jornada de forma irregular en el año?', 'No');
  await next();
  await next();
  await choose(sheet('Teletrabajo y tiempo parcial'), '¿Es un contrato a tiempo parcial?', 'No');
  await next();
  const trial = sheet('Tu periodo de prueba');
  await choose(trial, '¿Eres técnico titulado?', 'No');
  await choose(trial, '¿El contrato tiene periodo de prueba?', 'Sí');
  await next();
  const length = sheet('Duración de la prueba');
  await length.getByLabel('Duración', { exact: true }).fill('2');
  await choose(length, 'En', 'Meses');
  await choose(length, '¿Tu empresa tiene menos de 25 personas en plantilla?', 'No lo sé');
  await next();
  const before = sheet('Más sobre la prueba');
  await choose(before, '¿Ya habías hecho este mismo trabajo en esta empresa?', 'No');
  await choose(before, '¿Vienes de un contrato formativo en esta empresa?', 'No');
  await next();
  const holidays = sheet('Tus vacaciones');
  await choose(holidays, '¿El contrato dice cuántos días de vacaciones tienes?', 'Sí');
  await holidays.getByLabel('Días de vacaciones al año', { exact: true }).fill('30');
  await choose(holidays, '¿Qué días son?', 'Naturales');
  await next();
  await choose(
    sheet('Cómo se cuentan y se pagan'),
    '¿Dice que las vacaciones van incluidas en el salario?',
    'No',
  );
  // On to the last sheet: the agreement's figures, the clauses, the offer and what the contract
  // has to say keep their answers.
  for (let i = 0; i < 9; i++) await next();
  await page.getByRole('button', { name: 'Revisar' }).click();
  await expect(page.getByRole('heading', { name: 'Resultado', level: 2 })).toBeFocused();
  await page
    .getByRole('region', { name: 'Salario frente al SMI', exact: true })
    .getByText('Cómo se calcula')
    .click();
  await page.getByText('¿Cuánto puede durar el periodo de prueba?').click();

  await expect.poll(() => spy.named('help_opened').length, { timeout: 15_000 }).toBe(1);
  await expect
    .poll(() => spy.named('employment_review_completed').length, { timeout: 15_000 })
    .toBe(1);

  // A gate: household employment stops once its dates are in.
  await page.getByRole('button', { name: 'Empezar de nuevo' }).click();
  await sheet('Tu relación laboral').getByLabel(kind).selectOption({ label: 'Empleo del hogar' });
  await next();
  await dates.getByLabel('Fecha de inicio', { exact: true }).fill('2025-03-01');
  await next();
  await expect.poll(() => spy.named('employment_out_of_scope').length, { timeout: 15_000 }).toBe(1);

  expect(spy.named('validation_error').every((e) => e.properties['section'] === 'relacion')).toBe(
    true,
  );
  expect(spy.named('validation_error').map((e) => e.properties['field'])).toContain('relationship');
  expect(spy.named('section_viewed').map((e) => e.properties['section'])).toEqual([
    'relacion',
    'contratacion',
    'escrito',
    'fechas',
    'modalidad',
    'salario',
    'periodo',
    'horas',
    'pagas-extra',
    'desglose',
    'convenio',
    'convenio-cifras',
    'nominas',
    'jornada',
    'noche',
    'horas-extra',
    'parcial',
    'prueba',
    'prueba-duracion',
    'prueba-antes',
    'vacaciones',
    'vacaciones-pago',
    'convenio-condiciones',
    'clausulas',
    'oferta',
    'informacion',
    'informacion-puesto',
    'informacion-salario',
    'informacion-duracion',
    'informacion-igualdad',
    'informacion-otros',
    'resultado',
    'relacion',
    'fechas',
    'resultado',
  ]);
  expect(spy.named('detail_opened').map((e) => e.properties['item'])).toEqual(['minimum_wage']);
  expect(spy.named('help_opened').map((e) => e.properties['topic'])).toEqual([
    'faq-contrato-prueba',
  ]);
  expect(spy.named('started_over')).toHaveLength(1);

  const completed = spy.named('employment_review_completed')[0];
  expect(completed?.properties).toMatchObject({
    start_period: '2026+',
    modality: 'permanent',
    part_time: false,
    written: 'yes',
    technical: 'no',
    small_company: 'unknown',
    smi: 'below_minimum',
    smi_years_below: '1',
    smi_not_published: false,
    payslips: '0',
    history: false,
    offer: false,
    agreement_named: true,
    difference: '500-2000',
    offered: true,
    detail: 'unlocked',
    attempt: '1',
  });
  expect(ownKeys(completed)).toEqual(
    [
      'start_period',
      'modality',
      'part_time',
      'written',
      'technical',
      'small_company',
      'smi',
      'modality_check',
      'chaining',
      'trial',
      'working_time',
      'part_time_check',
      'holidays',
      'extra_pays',
      'clauses',
      'information',
      'smi_years_below',
      'smi_not_published',
      'payslips',
      'history',
      'offer',
      'agreement_named',
      'difference',
      'offered',
      'detail',
      'attempt',
      'seconds',
    ].toSorted(),
  );
  const outOfScope = spy.named('employment_out_of_scope')[0];
  expect(outOfScope?.properties['reason']).toBe('special_relationship');
  expect(ownKeys(outOfScope)).toEqual(['reason']);

  for (const e of spy.events()) {
    const text = withoutRandom(e);
    for (const forbidden of [
      '1150',
      '1.150',
      '16100',
      '16.100',
      '17094',
      '17.094',
      '2026-01-01',
      '01-01-2026',
      '2025-03-01',
      'household',
    ])
      expect(text, `${e.event}: ${forbidden}`).not.toContain(forbidden);
  }
  for (const e of spy.events())
    expect(String(e.properties['$current_url'])).toMatch(
      new RegExp(`^${ORIGIN}/contrato/(#[a-z-]+)?$`),
    );
  expect(spy.external).toEqual([]);
  expect(await context.cookies()).toEqual([]);
});
