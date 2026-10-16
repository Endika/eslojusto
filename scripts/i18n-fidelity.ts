import { createHash } from 'node:crypto';

// What keeps a translation honest, for the tests and the stamp script (Node only, never shipped).

// The fingerprint of the Spanish a translation was made from: when the Spanish changes, it no
// longer matches and the translation reads as stale.
export const sourceHash = (spanish: string): string =>
  createHash('sha256').update(spanish).digest('hex').slice(0, 12);

// A prose file or a copy module names the hash of its Spanish file on its first `source:` line.
export const SOURCE_LINE = /^\s*\/\/ source: ([0-9a-f]{12})$/m;

const sorted = (values: readonly string[]): string[] => [...values].sort();

// The `{variables}` a string takes: a translation must take the same ones.
export const placeholders = (text: string): string[] =>
  sorted([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? ''));

// Every run of digits, as written: an article, a law, a sum of days or euros. A translation
// keeps them all, in the Spanish format, so none can be lost or changed on the way.
export const figures = (text: string): string[] => sorted(text.match(/\d+/g) ?? []);

// What a translation of one string gets wrong against its Spanish, if anything.
export function fidelityProblems(spanish: string, translation: string): string[] {
  const problems: string[] = [];
  if (placeholders(spanish).join() !== placeholders(translation).join())
    problems.push(
      `variables ${placeholders(spanish).join(',')} → ${placeholders(translation).join(',')}`,
    );
  if (figures(spanish).join() !== figures(translation).join())
    problems.push(`figures ${figures(spanish).join(',')} → ${figures(translation).join(',')}`);
  return problems;
}
