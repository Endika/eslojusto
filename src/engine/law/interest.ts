import { addDays, daysInYear, ordinal, parseDate, toIso, type CivilDate } from '../date';
import { round2 } from '../money';

// A stretch of days with one interés legal del dinero, fixed for each calendar year by the State
// budget law (or its extension). `until` is the last day it holds.
export interface LegalInterestPeriod {
  readonly from: string;
  readonly until: string;
  // % per year.
  readonly rate: number;
  readonly url: string;
}

export type LegalInterestTable = readonly LegalInterestPeriod[];

// 365 or 360 days a year whatever the year, or the real length of each year (366 in a leap year).
export type InterestYearBase = 365 | 360 | 'actual';

export interface InterestSegment {
  // First day that accrues and the day after the last one.
  readonly from: CivilDate;
  readonly to: CivilDate;
  readonly days: number;
  readonly rate: number;
  readonly yearDays: number;
  // Not rounded, so that a sum of segments is rounded once.
  readonly interest: number;
}

export type LegalInterest =
  | {
      readonly kind: 'complete';
      readonly segments: readonly InterestSegment[];
      readonly interest: number;
    }
  // A day with no rate loaded: what came before it is counted up to `until`, and nothing after it.
  // The rate of an earlier year never stands in for a year not yet published.
  | {
      readonly kind: 'partial';
      readonly segments: readonly InterestSegment[];
      readonly interest: number;
      readonly until: string;
      readonly missingYear: number;
    }
  // Starts before the table's first day: no figure at all, not even for the days the table covers.
  | {
      readonly kind: 'before_table';
      readonly segments: readonly [];
      readonly tableFrom: string;
      readonly missingYear: number;
    };

export const periodOn = (
  day: CivilDate,
  table: LegalInterestTable,
): LegalInterestPeriod | undefined => {
  const iso = toIso(day);
  return table.find((p) => p.from <= iso && iso <= p.until);
};

export const rateOn = (day: CivilDate, table: LegalInterestTable): number | undefined =>
  periodOn(day, table)?.rate;

// The legal interest on `amount` from `from` (the first day that accrues) to `to` (which does
// not), split by calendar year and by change of rate.
export function interestByYear(
  amount: number,
  from: CivilDate,
  to: CivilDate,
  table: LegalInterestTable,
  base: InterestYearBase,
): LegalInterest {
  const tableFrom = table[0]?.from;
  if (ordinal(from) < ordinal(to) && (tableFrom === undefined || toIso(from) < tableFrom))
    return {
      kind: 'before_table',
      segments: [],
      tableFrom: tableFrom ?? toIso(from),
      missingYear: from.y,
    };
  const segments: InterestSegment[] = [];
  const total = () => round2(segments.reduce((s, x) => s + x.interest, 0));
  let cursor = from;
  while (ordinal(cursor) < ordinal(to)) {
    const period = periodOn(cursor, table);
    if (period === undefined)
      return {
        kind: 'partial',
        segments,
        interest: total(),
        until: toIso(addDays(cursor, -1)),
        missingYear: cursor.y,
      };
    const end = Math.min(
      ordinal(to),
      ordinal({ y: cursor.y + 1, m: 1, d: 1 }),
      ordinal(parseDate(period.until)) + 1,
    );
    const days = end - ordinal(cursor);
    const next = addDays(cursor, days);
    const yearDays = base === 'actual' ? daysInYear(cursor.y) : base;
    segments.push({
      from: cursor,
      to: next,
      days,
      rate: period.rate,
      yearDays,
      interest: (amount * period.rate * days) / (100 * yearDays),
    });
    cursor = next;
  }
  return { kind: 'complete', segments, interest: total() };
}
