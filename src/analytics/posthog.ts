import type { PostHogConfig } from 'posthog-js';
import { ANALYTICS_ORIGIN } from '../layouts/csp';
import { isValidEvent, type EventName, type Props } from './events';
import { cleanEvent } from './sanitize';

// Each option was checked against posthog-js 1.437.0's PostHogConfig.
export const POSTHOG_OPTIONS = {
  api_host: ANALYTICS_ORIGIN,
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
  before_send: cleanEvent,
} as const satisfies Partial<PostHogConfig>;

type Client = { capture(event: string, props: object): unknown };

const POSTHOG_KEY = import.meta.env.PUBLIC_POSTHOG_KEY;
let client: Promise<Client> | undefined;

type Signals = { globalPrivacyControl?: unknown; doNotTrack?: unknown };

// Global Privacy Control, or the older Do Not Track: whoever sends either is never measured.
export function asksNotToTrack(nav: Signals, win: Signals = {}): boolean {
  return (
    nav.globalPrivacyControl === true ||
    [nav.doNotTrack, win.doNotTrack].some((v) => v === '1' || v === 'yes')
  );
}

// Without a key (dev, tests, forks) or with a do-not-track signal, nothing loads and every
// call is a no-op.
export function startAnalytics(): Promise<Client> | undefined {
  if (!POSTHOG_KEY || asksNotToTrack(navigator as Signals, window as Signals)) return undefined;
  client ??= import('posthog-js').then(({ default: posthog }) => {
    posthog.init(POSTHOG_KEY, POSTHOG_OPTIONS);
    return posthog;
  });
  return client;
}

export function track<E extends EventName>(event: E, props: Props<E>): void {
  if (!isValidEvent(event, props)) {
    if (import.meta.env.DEV) console.warn(`track: ${event} does not match the catalogue`);
    return;
  }
  void startAnalytics()?.then((c) => c.capture(event, props));
}
