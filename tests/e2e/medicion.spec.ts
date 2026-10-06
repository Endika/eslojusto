import { gunzipSync } from 'node:zlib';
import { test, expect, type Page, type Request } from '@playwright/test';

// Runs only against a build with PUBLIC_POSTHOG_KEY=phc_test (PRUEBA_MEDICION=1).

const POSTHOG = 'https://eu.i.posthog.com';

interface Evento {
  event: string;
  properties: Record<string, unknown>;
  [clave: string]: unknown;
}

function decodificar(r: Request): string {
  const cuerpo = r.postDataBuffer();
  if (!cuerpo) return '';
  const compresion = new URL(r.url()).searchParams.get('compression');
  if (compresion === 'gzip-js' || (cuerpo[0] === 0x1f && cuerpo[1] === 0x8b))
    return gunzipSync(cuerpo).toString('utf8');
  const texto = cuerpo.toString('utf8');
  if (compresion === 'base64' || texto.startsWith('data=')) {
    const datos = new URLSearchParams(texto).get('data') ?? '';
    return Buffer.from(datos, 'base64').toString('utf8');
  }
  return texto;
}

function eventosDe(cuerpo: string): Evento[] {
  if (!cuerpo) return [];
  const json: unknown = JSON.parse(cuerpo);
  const lista = Array.isArray(json)
    ? json
    : json && typeof json === 'object' && 'batch' in json && Array.isArray(json.batch)
      ? json.batch
      : [json];
  return lista as Evento[];
}

// Random ids, clocks and measured times: each must have its shape, which nothing typed can
// take; only then is it left out of the search for typed values.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const NUMERO = /^\d+(\.\d+)?(e-\d+)?$/;
const FORMA: Record<string, RegExp> = {
  uuid: UUID,
  timestamp: ISO,
  distinct_id: UUID,
  $device_id: UUID,
  $session_id: UUID,
  $window_id: UUID,
  $pageview_id: UUID,
  $insert_id: /^[a-z0-9]{8,24}$/,
  $time: NUMERO,
  $prev_pageview_duration: NUMERO,
  $prev_pageview_max_scroll_percentage: NUMERO,
};

function sinAleatorios(e: Evento): string {
  const quitar = (objeto: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(objeto).filter(([clave, valor]) => {
        const forma = FORMA[clave];
        if (forma) expect(String(valor), clave).toMatch(forma);
        return !forma;
      }),
    );
  return JSON.stringify({ ...quitar(e), properties: quitar(e.properties) });
}

// The exact keys that leave with each kind of event. A posthog-js upgrade that adds one fails
// here, before the privacy page goes out of date.
const TECNICAS = [
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
const PAGINA = [
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
const claves = (e: Evento | undefined) => Object.keys(e?.properties ?? {}).toSorted();

async function espiar(page: Page) {
  // PostHog drops events from automated browsers; the page must look like a person's.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'userAgentData', { get: () => undefined });
    // Playwright cannot route a beacon, which PostHog uses on pagehide; a fetch it can.
    navigator.sendBeacon = (url, datos) => {
      void fetch(url, { method: 'POST', body: datos ?? null });
      return true;
    };
  });
  const cuerpos: string[] = [];
  const ajenas: string[] = [];
  page.on('request', (r) => {
    const { origin } = new URL(r.url());
    if (origin !== 'http://localhost:4321' && origin !== POSTHOG) ajenas.push(r.url());
  });
  await page.route(`${POSTHOG}/**`, async (route) => {
    cuerpos.push(decodificar(route.request()));
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":1}' });
  });
  const eventos = () => cuerpos.flatMap(eventosDe);
  const de = (nombre: string) => eventos().filter((e) => e.event === nombre);
  return { cuerpos, ajenas, eventos, de };
}

test.use({ locale: 'ja-JP' });

test('mide idiomas, pasos y resultado sin mandar nada de lo que escribes', async ({
  page,
  context,
}) => {
  const espia = await espiar(page);
  const bloqueos: string[] = [];
  page.on('console', (m) => {
    if (/Content Security Policy/i.test(m.text())) bloqueos.push(m.text());
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

  const siguiente = () => page.getByRole('button', { name: 'Siguiente' }).click();
  await siguiente(); // sin causa: error de validación
  await page.getByLabel('Despido improcedente').check();
  await siguiente();
  await page.getByLabel('Fecha de alta', { exact: true }).fill('2010-03-01');
  await page.getByLabel('Fecha de baja', { exact: true }).fill('2026-09-15');
  await siguiente();
  await page
    .getByRole('group', { name: '¿Tus pagas extra van prorrateadas en la nómina?' })
    .getByLabel('Sí')
    .check();
  await siguiente();
  await page.getByLabel('Salario bruto mensual').fill('1.500');
  await siguiente();
  await page.getByLabel('Días naturales disfrutados').fill('0');
  await siguiente();
  await page.getByLabel('1', { exact: true }).check();
  await siguiente();
  await page.getByLabel('Sí, añadir fechas').check();
  await page.getByLabel('Fecha de alta del trabajo 1').fill('2008-02-01');
  await page.getByLabel('Fecha de baja del trabajo 1').fill('2009-11-30');
  await page
    .getByRole('group', { name: '¿Has cobrado paro después de alguno?' })
    .getByLabel('No', { exact: true })
    .check();
  await siguiente();
  await page.getByLabel('Indemnización').fill('40.000,00');
  await page.getByRole('button', { name: 'Revisar' }).click();
  await expect(page.getByRole('heading', { name: /Resultado/ })).toBeVisible();
  await page.getByRole('region', { name: 'Indemnización' }).getByText('Cómo se calcula').click();
  await page.getByText('¿Se envían mis datos a algún sitio?').click();

  await expect.poll(() => espia.de('ayuda_abierta').length, { timeout: 15_000 }).toBe(1);
  await expect.poll(() => espia.de('revision_hecha').length, { timeout: 15_000 }).toBe(1);

  expect(espia.de('idioma_navegador').map((e) => e.properties['idioma'])).toEqual(['ja']);
  expect(espia.de('idioma_traducido').map((e) => e.properties['idioma'])).toEqual(['ar']);
  expect(espia.de('$pageview')).toHaveLength(1);
  expect(espia.de('error_validacion').map((e) => e.properties['campo'])).toEqual(['causa']);
  expect(espia.de('seccion_vista').map((e) => e.properties['seccion'])).toEqual([
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
  expect(espia.de('seccion_completada')).toHaveLength(8);
  expect(espia.de('detalle_abierto').map((e) => e.properties['partida'])).toEqual([
    'indemnizacion',
  ]);
  expect(espia.de('ayuda_abierta')[0]?.properties['tema']).toBe('faq-datos');
  expect(espia.de('revision_hecha')[0]?.properties).toMatchObject({
    causa: 'improcedente',
    tipo_temporal: 'no_aplica',
    pagas: 'prorrateadas',
    cifras_metidas: 1,
    resultado: expect.stringMatching(/^(falta|todo_coincide)$/),
    intento: '1',
    cambios: [],
    paro: 'con_cifras',
    otros_contratos: '1',
  });
  expect(claves(espia.de('revision_hecha')[0])).toEqual(
    [
      ...TECNICAS,
      ...PAGINA,
      '$pageview_id',
      'utm_source',
      'causa',
      'tipo_temporal',
      'pagas',
      'cifras_metidas',
      'por_debajo',
      'coinciden',
      'por_encima',
      'no_comprobables',
      'descuento_mayor',
      'diferencia',
      'resultado',
      'intento',
      'cambios',
      'segundos',
      'paro',
      'otros_contratos',
    ].toSorted(),
  );

  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  await expect.poll(() => espia.de('$pageleave').length, { timeout: 15_000 }).toBe(1);

  expect(claves(espia.de('$pageview')[0])).toEqual(
    [...TECNICAS, ...PAGINA, '$pageview_id', 'utm_source'].toSorted(),
  );
  expect(claves(espia.de('$pageleave')[0])).toEqual(
    [
      ...TECNICAS,
      ...PAGINA,
      '$pageview_id',
      'utm_source',
      '$prev_pageview_duration',
      '$prev_pageview_max_scroll_percentage',
    ].toSorted(),
  );
  expect(claves(espia.de('seccion_vista')[0])).toEqual(
    [...TECNICAS, ...PAGINA, 'utm_source', 'seccion'].toSorted(),
  );
  for (const e of espia.eventos())
    expect(Object.keys(e).toSorted(), e.event).toEqual([
      'event',
      'properties',
      'timestamp',
      'uuid',
    ]);
  expect(espia.de('$pageview')[0]?.properties).toMatchObject({
    $referring_domain: 'www.google.com',
    utm_source: 'test',
  });

  for (const e of espia.eventos()) {
    const texto = sinAleatorios(e);
    for (const prohibido of [
      '1500',
      '1.500',
      '40000',
      '40.000',
      '2010-03-01',
      '2026-09-15',
      '2008-02-01',
      '2009-11-30',
    ])
      expect(texto, `${e.event}: ${prohibido}`).not.toContain(prohibido);
  }
  const agente = await page.evaluate(() => navigator.userAgent);
  for (const cuerpo of espia.cuerpos)
    for (const prohibido of ['ABC123', 'gclid', 'ja-JP', agente, 'search', 'q=', 'finiquito+'])
      expect(cuerpo, prohibido).not.toContain(prohibido);
  const urls = espia.eventos().map((e) => String(e.properties['$current_url']));
  expect(urls.length).toBeGreaterThan(0);
  for (const url of urls) expect(url).toMatch(/^http:\/\/localhost:4321\/finiquito\/(#[a-z]+)?$/);
  expect(espia.ajenas).toEqual([]);
  expect(bloqueos).toEqual([]);
  expect(await context.cookies()).toEqual([]);
});

test('un recorrido completo no escribe nada en el almacenamiento del navegador', async ({
  page,
  context,
}) => {
  const espia = await espiar(page);
  const almacenado = () =>
    page.evaluate(() => ({ local: { ...localStorage }, sesion: { ...sessionStorage } }));
  await page.goto('finiquito/');
  const siguiente = () => page.getByRole('button', { name: 'Siguiente' }).click();
  await siguiente();
  await page.getByLabel('Fin de contrato temporal').check();
  await siguiente();
  await page.getByLabel('Eventual').check();
  await siguiente();
  await page.getByLabel('Fecha de alta', { exact: true }).fill('2024-01-01');
  await page.getByLabel('Fecha de baja', { exact: true }).fill('2026-09-15');
  await siguiente();
  await page
    .getByRole('group', { name: '¿Tus pagas extra van prorrateadas en la nómina?' })
    .getByLabel('No')
    .check();
  await siguiente();
  await page.getByLabel('Salario bruto mensual').fill('1.500');
  await siguiente();
  await page.getByLabel('Importe de cada paga').fill('1.500');
  await siguiente();
  await page.getByRole('button', { name: 'Atrás' }).click();
  await siguiente();
  await page.getByRole('checkbox', { name: 'No lo sé' }).check();
  await siguiente();
  await page.getByLabel('Prefiero no decirlo').check();
  await siguiente();
  await siguiente();
  await page.getByRole('button', { name: 'Revisar' }).click();
  await page.getByRole('region', { name: 'Indemnización' }).getByText('Cómo se calcula').click();
  await page.getByText('¿Se envían mis datos a algún sitio?').click();
  await page.getByRole('button', { name: 'Empezar de nuevo' }).click();
  await expect.poll(() => espia.de('empezar_de_nuevo').length, { timeout: 15_000 }).toBe(1);

  expect(await almacenado()).toEqual({ local: {}, sesion: {} });
  expect(await context.cookies()).toEqual([]);
  expect(espia.de('seccion_vista').map((e) => e.properties['seccion'])).toEqual([
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
  expect(espia.de('atras').map((e) => [e.properties['de'], e.properties['a']])).toEqual([
    ['vacaciones', 'pagas'],
  ]);

  // The theme is the one thing kept, and only once the visitor asks for it.
  await page.getByRole('button', { name: /Tema/ }).click();
  expect(Object.keys((await almacenado()).local)).toEqual(['tema']);
  expect((await almacenado()).sesion).toEqual({});
});

test('una revisión repetida cuenta el intento y nombra solo lo que cambió', async ({ page }) => {
  const espia = await espiar(page);
  await page.goto('finiquito/');
  const siguiente = () => page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByLabel('Baja voluntaria (dimisión)').check();
  await siguiente();
  await page.getByLabel('Fecha de alta', { exact: true }).fill('2020-01-01');
  await page.getByLabel('Fecha de baja', { exact: true }).fill('2026-09-15');
  await siguiente();
  await page
    .getByRole('group', { name: '¿Tus pagas extra van prorrateadas en la nómina?' })
    .getByLabel('Sí')
    .check();
  await siguiente();
  await page.getByLabel('Salario bruto mensual').fill('1.500');
  await siguiente();
  await page.getByLabel('Días naturales disfrutados').fill('0');
  await siguiente();
  await page.getByRole('button', { name: 'Revisar' }).click();
  await page.getByRole('link', { name: /Salario/ }).click();
  await siguiente(); // the Salario tab opens on the prorrateo sheet, already answered
  await page.getByLabel('Salario bruto mensual').fill('1.600');
  await siguiente();
  await siguiente();
  await page.getByRole('button', { name: 'Revisar' }).click();
  await page.getByRole('button', { name: 'Empezar de nuevo' }).click();

  await expect.poll(() => espia.de('empezar_de_nuevo').length, { timeout: 15_000 }).toBe(1);
  expect(
    espia.de('revision_hecha').map((e) => [e.properties['intento'], e.properties['cambios']]),
  ).toEqual([
    ['1', []],
    ['2', ['salarioMensual']],
  ]);
  expect(espia.de('atras').map((e) => [e.properties['de'], e.properties['a']])).toEqual([
    ['resultado', 'prorrateo'],
  ]);
  for (const e of espia.eventos()) expect(sinAleatorios(e)).not.toMatch(/1\.?[56]00/);
});

test('con la señal de no rastrear no se manda nada', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'globalPrivacyControl', { get: () => true });
  });
  const espia = await espiar(page);
  await page.goto('finiquito/');
  await page.getByLabel('Baja voluntaria (dimisión)').check();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.waitForTimeout(1500);
  expect(espia.cuerpos).toEqual([]);
  expect(espia.ajenas).toEqual([]);
});
