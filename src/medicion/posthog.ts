import type { PostHogConfig } from 'posthog-js';
import { ORIGEN_ANALITICA } from '../layouts/csp';
import { eventoValido, type Evento, type Props } from './eventos';
import { eventoLimpio } from './limpiar';

// Each option was checked against posthog-js 1.437.0's PostHogConfig.
export const OPCIONES_POSTHOG = {
  api_host: ORIGEN_ANALITICA,
  persistence: 'memory',
  autocapture: false,
  capture_pageview: true,
  capture_pageleave: true,
  disable_session_recording: true,
  disable_surveys: true,
  disable_external_dependency_loading: true,
  person_profiles: 'never',
  advanced_disable_flags: true,
  mask_all_text: true,
  mask_all_element_attributes: true,
  // Off explicitly: unset, these fall back to the project's remote settings.
  capture_exceptions: false,
  capture_performance: false,
  capture_heatmaps: false,
  capture_dead_clicks: false,
  rageclick: false,
  disable_web_experiments: true,
  disable_product_tours: true,
  disable_conversations: true,
  // Strips click ids, the raw user agent, query strings and the full language tag.
  before_send: eventoLimpio,
} as const satisfies Partial<PostHogConfig>;

type Cliente = { capture(evento: string, props: object): unknown };

const CLAVE = import.meta.env.PUBLIC_POSTHOG_KEY;
let cliente: Promise<Cliente> | undefined;

type Senales = { globalPrivacyControl?: unknown; doNotTrack?: unknown };

// Global Privacy Control, or the older Do Not Track: whoever sends either is never measured.
export function pideNoRastrear(nav: Senales, win: Senales = {}): boolean {
  return (
    nav.globalPrivacyControl === true ||
    [nav.doNotTrack, win.doNotTrack].some((v) => v === '1' || v === 'yes')
  );
}

// Without a key (dev, tests, forks) or with a do-not-track signal, nothing loads and every
// call is a no-op.
export function iniciarMedicion(): Promise<Cliente> | undefined {
  if (!CLAVE || pideNoRastrear(navigator as Senales, window as Senales)) return undefined;
  cliente ??= import('posthog-js').then(({ default: posthog }) => {
    posthog.init(CLAVE, OPCIONES_POSTHOG);
    return posthog;
  });
  return cliente;
}

export function medir<E extends Evento>(evento: E, props: Props<E>): void {
  if (!eventoValido(evento, props)) {
    if (import.meta.env.DEV) console.warn(`medir: ${evento} no cumple el catálogo`);
    return;
  }
  void iniciarMedicion()?.then((c) => c.capture(evento, props));
}
