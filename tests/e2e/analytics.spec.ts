import { gunzipSync } from 'node:zlib';
import { test, expect, type Page, type Request } from '@playwright/test';

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
    /connect-src https:\/\/eu\.i\.posthog\.com;/,
  );

  // A browser translator marks <html> the way Chrome's and Google's do.
  await page.evaluate(() => {
    document.documentElement.classList.add('translated-rtl');
    document.documentElement.lang = 'ar';
  });

  const next = () => page.getByRole('button', { name: 'Siguiente' }).click();
  await next(); // no cause: a validation error
  await page.getByLabel('Despido improcedente').check();
  await next();
  await page.getByLabel('Fecha de alta', { exact: true }).fill('2010-03-01');
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
    'prorrateo',
    'salario',
    'vacaciones',
    'hijos',
    'otros',
    'finiquito',
    'resultado',
  ]);
  expect(spy.named('section_completed')).toHaveLength(8);
  expect(spy.named('detail_opened').map((e) => e.properties['item'])).toEqual(['severance']);
  expect(spy.named('help_opened')[0]?.properties['topic']).toBe('faq-datos');
  expect(spy.named('review_completed')[0]?.properties).toMatchObject({
    cause: 'unfair_dismissal',
    fixed_term_type: 'not_applicable',
    extra_pay: 'prorated',
    holiday_unit: 'working',
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
  expect(keys(spy.named('section_viewed')[0])).toEqual(
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
  const next = () => page.getByRole('button', { name: 'Siguiente' }).click();
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
  await page.getByLabel('Prefiero no decirlo').check();
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
    'hijos',
    'otros',
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
  const next = () => page.getByRole('button', { name: 'Siguiente' }).click();
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
  await page.getByRole('button', { name: 'Revisar' }).click();
  await page.getByRole('link', { name: /Salario/ }).click();
  await next(); // the Salario tab opens on the prorating sheet, already answered
  await page.getByLabel('Salario bruto mensual').fill('1.600');
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

test('with the do-not-track signal nothing is sent', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'globalPrivacyControl', { get: () => true });
  });
  const spy = await spyOn(page);
  await page.goto('finiquito/');
  await page.getByLabel('Baja voluntaria (dimisión)').check();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.waitForTimeout(1500);
  expect(spy.bodies).toEqual([]);
  expect(spy.external).toEqual([]);
});
