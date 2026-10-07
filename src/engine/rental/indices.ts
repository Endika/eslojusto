import { toIso, type CivilDate } from '../date';

export type IndexId = 'irav' | 'ipc' | 'igc';

export interface IndexValue {
  readonly month: string;
  // Annual change in %, two decimals at most.
  readonly rate: number;
  // The day the definitive figure came out; null when not known.
  readonly publishedOn: string | null;
  readonly publishedUrl: string | null;
  // The CPI flash estimate for the month, which comes out before the definitive figure.
  readonly flashRate?: number;
  readonly flashPublishedOn?: string;
  readonly flashUrl?: string;
}

export interface IndexSeries {
  readonly id: IndexId;
  readonly citation: string;
  readonly url: string;
  readonly table: number;
  readonly series: string;
  // Last day the table is known to hold every figure published so far.
  readonly coveredUntil: string;
  readonly values: readonly IndexValue[];
}

export type ReferenceMonth =
  | { readonly kind: 'ok'; readonly value: IndexValue }
  | { readonly kind: 'same_day'; readonly value: IndexValue; readonly previous: IndexValue | null }
  | {
      readonly kind: 'flash_window';
      readonly definitive: IndexValue;
      readonly flashNext: IndexValue;
    }
  | {
      readonly kind: 'flash_not_loaded';
      readonly definitive: IndexValue;
      readonly next: IndexValue;
    }
  | { readonly kind: 'not_loaded' }
  | { readonly kind: 'publication_unknown' };

// LAU art. 18.1: the reference month is the last one published on the day of the update. The
// lookup never falls back to an earlier month without saying so.
export function referenceMonth(series: IndexSeries, date: CivilDate): ReferenceMonth {
  const day = toIso(date);
  if (day > series.coveredUntil) return { kind: 'not_loaded' };
  const { values } = series;
  for (let i = values.length - 1; i >= 0; i--) {
    const value = values[i];
    if (value === undefined || value.month >= day.slice(0, 7)) continue;
    if (value.publishedOn === null) return { kind: 'publication_unknown' };
    if (value.publishedOn > day) continue;
    if (value.publishedOn === day)
      return { kind: 'same_day', value, previous: values[i - 1] ?? null };
    const next = values[i + 1];
    if (next?.flashPublishedOn !== undefined && next.flashPublishedOn <= day) {
      return next.flashRate === undefined
        ? { kind: 'flash_not_loaded', definitive: value, next }
        : { kind: 'flash_window', definitive: value, flashNext: next };
    }
    return { kind: 'ok', value };
  }
  return { kind: 'not_loaded' };
}
