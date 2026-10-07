import { toIso, type CivilDate } from '../date';

export type IndexId = 'irav' | 'ipc' | 'igc';

export interface IndexValue {
  readonly month: string;
  // Annual change in %, two decimals at most.
  readonly rate: number;
  // The day the definitive figure came out; null when not known.
  readonly publishedOn: string | null;
  readonly publishedUrl: string | null;
  // The CPI flash estimate for the month, which comes out before the definitive figure. Its day
  // can be known while its rate is not loaded.
  readonly flashRate?: number;
  readonly flashPublishedOn?: string;
  readonly flashUrl?: string;
}

export interface IndexFlash {
  readonly month: string;
  readonly rate: number;
  readonly publishedOn: string;
  readonly url: string;
}

export interface IndexSeries {
  readonly id: IndexId;
  readonly citation: string;
  readonly url: string;
  readonly table: number;
  readonly series: string;
  // Last day the table is known to hold every figure published so far.
  readonly coveredUntil: string;
  // True when the first value is the first the index ever had.
  readonly loadedFromStart: boolean;
  readonly values: readonly IndexValue[];
  // The flash of the month after the last value, out before its definitive figure.
  readonly pendingFlash: IndexFlash | null;
}

export type IndexTables = Readonly<Record<IndexId, IndexSeries>>;

export type ReferenceMonth =
  | { readonly kind: 'ok'; readonly value: IndexValue }
  // On the day a definitive figure comes out, the reading published until that morning (the
  // month's flash, or the previous month for an index without one) is the other candidate.
  | {
      readonly kind: 'same_day';
      readonly value: IndexValue;
      readonly earlier:
        | { readonly source: 'flash'; readonly flash: IndexFlash }
        | { readonly source: 'previous'; readonly value: IndexValue }
        | null;
    }
  | { readonly kind: 'flash_window'; readonly definitive: IndexValue; readonly flash: IndexFlash }
  | { readonly kind: 'flash_not_loaded'; readonly definitive: IndexValue; readonly month: string }
  | { readonly kind: 'none_published' }
  | { readonly kind: 'not_loaded' }
  | { readonly kind: 'publication_unknown' };

interface FlashSlot {
  readonly month: string;
  readonly publishedOn: string;
  readonly flash: IndexFlash | null;
}

function flashSlot(value: IndexValue): FlashSlot | null {
  const { month, flashRate: rate, flashPublishedOn: publishedOn, flashUrl: url } = value;
  if (publishedOn === undefined) return null;
  const flash = rate === undefined || url === undefined ? null : { month, rate, publishedOn, url };
  return { month, publishedOn, flash };
}

// LAU art. 18.1: the reference month is the last one published on the day of the update. The
// lookup never falls back to an earlier month without saying so.
export function referenceMonth(series: IndexSeries, date: CivilDate): ReferenceMonth {
  const day = toIso(date);
  if (day > series.coveredUntil) return { kind: 'not_loaded' };
  const { values, pendingFlash } = series;
  for (let i = values.length - 1; i >= 0; i--) {
    const value = values[i];
    if (value === undefined || value.month >= day.slice(0, 7)) continue;
    if (value.publishedOn === null) return { kind: 'publication_unknown' };
    if (value.publishedOn > day) continue;
    if (value.publishedOn === day) {
      const own = flashSlot(value);
      const previous = values[i - 1];
      if (own !== null)
        return own.flash === null
          ? { kind: 'flash_not_loaded', definitive: value, month: value.month }
          : { kind: 'same_day', value, earlier: { source: 'flash', flash: own.flash } };
      const earlier =
        previous === undefined ? null : { source: 'previous' as const, value: previous };
      return { kind: 'same_day', value, earlier };
    }
    const next = values[i + 1];
    const slot =
      next !== undefined
        ? flashSlot(next)
        : pendingFlash && {
            month: pendingFlash.month,
            publishedOn: pendingFlash.publishedOn,
            flash: pendingFlash,
          };
    if (slot && slot.publishedOn <= day)
      return slot.flash === null
        ? { kind: 'flash_not_loaded', definitive: value, month: slot.month }
        : { kind: 'flash_window', definitive: value, flash: slot.flash };
    return { kind: 'ok', value };
  }
  return series.loadedFromStart ? { kind: 'none_published' } : { kind: 'not_loaded' };
}
