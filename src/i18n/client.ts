import type { Key } from './es';
import { interpolate, type Variables } from './interpolate';

export type ClientKey = Extract<Key, `client.${string}`>;
export type Translate = (key: ClientKey, vars?: Variables) => string;

export const translator =
  (strings: Partial<Record<string, string>>): Translate =>
  (key, vars) =>
    interpolate(strings[key] ?? key, vars);

// Base.astro writes the page language's `client.` strings into #client-strings; the scripts read them here.
export function pageTranslator(): Translate {
  const data = document.getElementById('client-strings')?.textContent ?? '{}';
  return translator(JSON.parse(data) as Record<string, string>);
}
