import type { CaptureResult, Properties } from 'posthog-js';
import { CATALOGO, SECCIONES } from './eventos';

// What leaves with each event, key by key (GDPR art. 5.1.c). Anything else PostHog adds is
// dropped, so a new default in a posthog-js upgrade never ships unnoticed: the e2e asserts the
// exact key sets, and the privacy page lists these same keys in plain words.

// PostHog needs these to ingest an event; ids and clocks are random or technical.
export const CLAVES_TECNICAS = [
  'token',
  'distinct_id',
  '$device_id',
  '$session_id',
  '$window_id',
  '$pageview_id',
  '$insert_id',
  '$time',
  '$lib',
  '$lib_version',
  // `false` under person_profiles 'never'; without it ingestion would create a person.
  '$process_person_profile',
] as const;

// Each one answers a product question: which page, from where, on what, how long and how far.
export const CLAVES_PRODUCTO = [
  '$current_url',
  '$pathname',
  '$host',
  '$referring_domain',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  '$browser',
  '$browser_version',
  '$os',
  '$device_type',
  '$viewport_width',
  '$viewport_height',
  '$prev_pageview_duration',
  '$prev_pageview_max_scroll_percentage',
] as const;

const CLAVES_CATALOGO = Object.values(CATALOGO).flatMap((reglas) => Object.keys(reglas));

const PERMITIDAS: ReadonlySet<string> = new Set([
  ...CLAVES_TECNICAS,
  ...CLAVES_PRODUCTO,
  ...CLAVES_CATALOGO,
]);

// Origin and path; the hash only when it is a section id.
export function urlLimpia(url: string): string {
  try {
    const u = new URL(url);
    const seccion = u.hash.slice(1);
    const hash = (SECCIONES as readonly string[]).includes(seccion) ? u.hash : '';
    return `${u.origin}${u.pathname}${hash}`;
  } catch {
    return '';
  }
}

export function propiedadesLimpias(props: Properties): Properties {
  const limpias: Properties = {};
  for (const [clave, valor] of Object.entries(props)) {
    if (!PERMITIDAS.has(clave) || valor === null || valor === undefined) continue;
    limpias[clave] =
      clave === '$current_url' && typeof valor === 'string' ? urlLimpia(valor) : valor;
  }
  return limpias;
}

// `$set` and `$set_once` get the same allowlist and are left out when nothing remains, which
// under person_profiles 'never' is always.
export function eventoLimpio(evento: CaptureResult | null): CaptureResult | null {
  if (!evento) return evento;
  const { $set, $set_once, ...resto } = evento;
  const persona = (props: Properties | undefined) => {
    const limpias = props && propiedadesLimpias(props);
    return limpias && Object.keys(limpias).length > 0 ? limpias : undefined;
  };
  const set = persona($set);
  const setOnce = persona($set_once);
  return {
    ...resto,
    properties: propiedadesLimpias(evento.properties),
    ...(set ? { $set: set } : {}),
    ...(setOnce ? { $set_once: setOnce } : {}),
  };
}
