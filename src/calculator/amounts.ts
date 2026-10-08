import { formatEuros, formatWholeEuros } from './number';

// How every review section shows an approximate amount: rounded for the free summary, kept in its
// own isolated element inside the translated text.

// An amount for the free summary: to the nearest 10 €.
export const roundToTens = (n: number): number => Math.round(n / 10) * 10;

// How an approximate amount is shown: to tens («unos 340 €»), or with its cents where tens would
// say something false.
export interface Shown {
  readonly amount: number;
  readonly cents: boolean;
}

// One amount alone: to tens, unless that would turn something into «0 €».
export const shownOne = (n: number): Shown =>
  n > 0 && roundToTens(n) === 0
    ? { amount: n, cents: true }
    : { amount: roundToTens(n), cents: false };

// Two amounts that bound something (two readings, or what is counted and the most it can be): to
// tens only when the rounded figures stay apart and neither passes the other's figure; otherwise
// both keep their cents, so a range never reads as one figure and «al menos» never goes above
// the most there can be.
export function shownPair(low: number, high: number): readonly [Shown, Shown] {
  const [a, b] = [roundToTens(low), roundToTens(high)];
  const tens =
    low === high
      ? low === 0 || (a > 0 && a <= high)
      : a < b && a <= high && b >= low && (low === 0 || a > 0);
  return tens
    ? [
        { amount: a, cents: false },
        { amount: b, cents: false },
      ]
    : [
        { amount: low, cents: true },
        { amount: high, cents: true },
      ];
}

// An amount keeps its Spanish format and reads left to right, also inside right-to-left text.
export function amountEl(n: number, format: (n: number) => string = formatEuros): HTMLElement {
  const bdi = document.createElement('bdi');
  bdi.dir = 'ltr';
  bdi.textContent = format(n);
  return bdi;
}

export type Piece = string | Node;

// Fills a translated template, putting each `{variable}` amount in its own isolated element.
export function pieces(
  template: string,
  vars: Readonly<Record<string, number | string | Piece[]>>,
  format: (n: number) => string = formatWholeEuros,
): Piece[] {
  return template.split(/\{(\w+)\}/).flatMap((part, i): Piece[] => {
    if (i % 2 === 0) return part === '' ? [] : [part];
    const v = vars[part];
    if (v === undefined) return [`{${part}}`];
    if (typeof v === 'number') return [amountEl(v, format)];
    return typeof v === 'string' ? [v] : v;
  });
}

// An amount as decided for it: whole euros to the ten, or with its cents.
export const shownAmount = (s: Shown): Piece[] => [
  amountEl(s.amount, s.cents ? formatEuros : formatWholeEuros),
];
