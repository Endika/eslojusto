import { parseAmount } from '../calculator/number';
import {
  MAX_REDUCTION_PERCENT,
  MIN_REDUCTION_PERCENT,
  isReductionPercent,
  type ErteInput,
  type ErteMeasure,
  type ErteRegime,
} from '../engine/erte';
import type { Children } from '../engine/unemployment';

export const ERTE_FIELDS = ['regime', 'measure', 'percent', 'base', 'children'] as const;
export type ErteField = (typeof ERTE_FIELDS)[number];
export type ErteAnswers = Readonly<Record<ErteField, string>>;

export const ERTE_ERRORS: Readonly<Record<ErteField, string>> = {
  regime: 'Elige una opción; «No lo sé» también vale',
  measure: 'Elige una opción',
  percent: `Escribe un porcentaje entre ${MIN_REDUCTION_PERCENT} y ${MAX_REDUCTION_PERCENT}`,
  base: 'Escribe la base en euros al mes, por ejemplo 1.500,00',
  children: 'Elige una opción; «Prefiero no decirlo» también vale',
};

export type ErteParse =
  | { readonly kind: 'unknown_regime' }
  | { readonly kind: 'input'; readonly input: ErteInput }
  | { readonly kind: 'errors'; readonly fields: readonly ErteField[] };

const REGIMES: readonly string[] = ['etop', 'force_majeure', 'red'];
const CHILDREN: Readonly<Record<string, Children>> = {
  '0': 0,
  '1': 1,
  '2': 2,
  not_said: null,
};

// An unknown type needs nothing else: there is no single figure to ask for.
export function parseErte(a: ErteAnswers): ErteParse {
  if (a.regime === 'unknown') return { kind: 'unknown_regime' };
  const errors: ErteField[] = [];
  if (!REGIMES.includes(a.regime)) errors.push('regime');
  let measure: ErteMeasure = { kind: 'suspension' };
  if (a.measure === 'reduction') {
    const percent = parseAmount(a.percent);
    if (percent === null || !isReductionPercent(percent)) errors.push('percent');
    else measure = { kind: 'reduction', percent };
  } else if (a.measure !== 'suspension') errors.push('measure');
  const base = parseAmount(a.base);
  if (base === null || !Number.isFinite(base) || base <= 0 || base > 1_000_000) errors.push('base');
  // RED has no limit by children, so it does not ask.
  const askChildren = a.regime !== 'red';
  if (askChildren && !(a.children in CHILDREN)) errors.push('children');
  if (errors.length > 0) return { kind: 'errors', fields: errors };
  return {
    kind: 'input',
    input: {
      regime: a.regime as ErteRegime,
      measure,
      base: base as number,
      children: askChildren ? (CHILDREN[a.children] ?? null) : null,
    },
  };
}
