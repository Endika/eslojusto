import type { Confidence, ExtractedValue } from '../documents/contract';
import type { ReadMark } from '../documents/ports';
import { parseDate, toIso, type CivilDate } from '../engine/date';

const RANK: Record<Confidence, number> = { high: 2, medium: 1, low: 0 };

// The least sure of the confidences.
export const lowest = (...cs: Confidence[]): Confidence =>
  cs.reduce(
    // Stryker disable next-line EqualityOperator: two confidences of the same rank are the same confidence
    (a, b) => (RANK[b] < RANK[a] ? b : a),
    'high',
  );

export const numberOf = (v: ExtractedValue | undefined): number | null =>
  // Stryker disable next-line ConditionalExpression: Number.isFinite is false for a non-number; typeof only narrows
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;

// A figure of money, to the cent.
export const amountOf = (v: ExtractedValue | undefined): number | null => {
  const n = numberOf(v);
  return n === null ? null : Math.round(n * 100) / 100;
};

export const textOf = (v: ExtractedValue | undefined): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : null;

export function dateOf(v: ExtractedValue | undefined): CivilDate | null {
  // Stryker disable next-line ConditionalExpression: parseDate throws on a non-string, which the catch turns into null
  if (typeof v !== 'string') return null;
  try {
    return parseDate(v);
  } catch {
    return null;
  }
}

export function isoOf(v: ExtractedValue | undefined): string | null {
  const day = dateOf(v);
  return day === null ? null : toIso(day);
}

// The answers a reading gives to a form, in order, and how surely each was read.
export class Answers<Field extends string> {
  readonly entries: [string, string][] = [];
  readonly marks: ReadMark[] = [];

  read(name: Field, value: string, confidence: Confidence, derived = false) {
    this.entries.push([name, value]);
    this.marks.push({
      id: name,
      container: `[data-field="${name}"]`,
      confidence,
      ...(derived && { derived: true as const }),
    });
  }

  // An answer that only opens what was read, such as «Sí» above the figure it asks for.
  open(name: Field, value: string) {
    this.entries.push([name, value]);
  }

  lowConfidence(): boolean {
    return this.marks.some((m) => m.confidence === 'low');
  }
}
