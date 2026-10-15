import type { PvpcHourly } from '../electricity-official';

// The table as the paid report reads it, with where its prices come from.
export interface PvpcTable extends PvpcHourly {
  readonly source: string;
  readonly url: string;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

const isHour = (h: unknown): h is readonly [number, number] =>
  Array.isArray(h) &&
  h.length === 2 &&
  Number.isInteger(h[0]) &&
  h[0] >= 0 &&
  h[0] <= 23 &&
  typeof h[1] === 'number' &&
  Number.isFinite(h[1]);

// pvpc-hourly.json checked as it arrives: each day 23 to 25 hours, `coveredUntil` a day. Null when
// anything is off, so the report leaves the section out rather than use a wrong price.
export function pvpcTable(raw: unknown): PvpcTable | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { source, url, coveredUntil, days } = raw as Record<string, unknown>;
  if (typeof source !== 'string' || typeof url !== 'string') return null;
  if (typeof coveredUntil !== 'string' || !DAY.test(coveredUntil)) return null;
  if (typeof days !== 'object' || days === null) return null;
  for (const [day, hours] of Object.entries(days)) {
    if (!DAY.test(day) || !Array.isArray(hours)) return null;
    if (hours.length < 23 || hours.length > 25 || !hours.every(isHour)) return null;
  }
  return { source, url, coveredUntil, days: days as PvpcHourly['days'] };
}
