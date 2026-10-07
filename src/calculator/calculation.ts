import type { Calculation, Figure, Phrase } from '../engine/calculation';
import type { Translate } from '../i18n/client';
import { formatCalculationEuros, formatDays, formatInteger } from './number';

function figureText(f: Figure): string {
  if (typeof f === 'number') return String(f);
  if ('days' in f) return formatDays(f.days);
  if ('euros' in f) return formatCalculationEuros(f.euros);
  return formatInteger(f.integer);
}

export function phraseText(p: Phrase, tr: Translate): string {
  const vars = Object.fromEntries(
    Object.entries(p.vars ?? {}).map(([name, v]) => [
      name,
      typeof v === 'object' && 'key' in v ? phraseText(v, tr) : figureText(v),
    ]),
  );
  return tr(`client.calculation.${p.key}`, vars);
}

export const calculationText = (c: Calculation, tr: Translate): string =>
  c.map((p) => phraseText(p, tr)).join(' ');
