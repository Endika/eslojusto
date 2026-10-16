import type { Key } from './es';
import { interpolate, type Variables } from './interpolate';

export type ClientKey = Extract<Key, `client.${string}`>;
export type Translate = (key: ClientKey, vars?: Variables) => string;

export const translator =
  (strings: Partial<Record<string, string>>): Translate =>
  (key, vars) =>
    interpolate(strings[key] ?? key, vars);

const strings = (id: string): Record<string, string> | null => {
  const data = document.getElementById(id)?.textContent;
  return data ? (JSON.parse(data) as Record<string, string>) : null;
};

// Base.astro writes the page language's `client.` strings into #client-strings; the scripts read them here.
export function pageTranslator(): Translate {
  return translator(strings('client-strings') ?? {});
}

// The words of the report and the letters, always Spanish: they go to a Spanish employer, landlord,
// bank or supplier. A page in another language ships them apart, in #client-strings-papers.
export function papersTranslator(): Translate {
  return translator(strings('client-strings-papers') ?? strings('client-strings') ?? {});
}
