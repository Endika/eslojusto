import { parseDate, toIso, type CivilDate } from '../engine/date';
import type { Confidence, ExtractedValue } from './contract';

type Read = ExtractedValue | undefined;

const RANK: Record<Confidence, number> = { high: 2, medium: 1, low: 0 };

// The least sure of the confidences.
export const lowest = (...cs: Confidence[]): Confidence =>
  cs.reduce(
    // Stryker disable next-line EqualityOperator: two confidences of the same rank are the same confidence
    (a, b) => (RANK[b] < RANK[a] ? b : a),
    'high',
  );

export const isNumber = (v: Read): v is number => Number.isFinite(v);

export const numberOf = (v: Read): number | null => (isNumber(v) && v >= 0 ? v : null);

const toCents = (n: number): number => Math.round(n * 100) / 100;

// A figure of money, to the cent.
export const amountOf = (v: Read): number | null => {
  const n = numberOf(v);
  return n === null ? null : toCents(n);
};

// A figure above zero before it is rounded to the cent, so half a cent reads as 0.
export const positiveAmountOf = (v: Read): number | null =>
  isNumber(v) && v > 0 ? toCents(v) : null;

// A figure of money that is still above zero once rounded to the cent.
export const positiveOf = (v: Read): number | null => {
  const n = amountOf(v);
  return n === 0 ? null : n;
};

export const wholeOf = (v: Read, least = Number.NEGATIVE_INFINITY): number | null =>
  isNumber(v) && Number.isInteger(v) && v >= least ? v : null;

export const textOf = (v: Read): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : null;

export const textOrBlank = (v: Read): string => textOf(v) ?? '';

export const oneOf = <T extends string>(v: Read, options: readonly T[]): T | null =>
  options.find((o) => o === v) ?? null;

export const yesNo = (v: Read): 'yes' | 'no' | null =>
  v === true ? 'yes' : v === false ? 'no' : null;

export function dateOf(v: Read): CivilDate | null {
  // prettier-ignore
  try { return parseDate(String(v)); }
  catch { return null; }
}

export const isoOf = (v: Read): string | null => {
  const day = dateOf(v);
  return day === null ? null : toIso(day);
};
