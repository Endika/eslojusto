import { addDays, daysInYear, ordinal, toIso, type CivilDate } from '../date';
import type { BillsNormId, NormStatus, NormTable } from './norms';
import { valueOn, type Table, type TableRow, type RowDoubt } from './tables';

// The days a bill covers: from the day after the first reading to the day of the last one.
export interface BillingPeriod {
  readonly from: CivilDate;
  readonly to: CivilDate;
}

export const periodDays = ({ from, to }: BillingPeriod): number => ordinal(to) - ordinal(from);

// Consecutive days of one year that the same rows cover. More than one row means the value
// depends on a norm not yet settled on those days.
export interface Stretch<V> {
  readonly first: string;
  readonly last: string;
  readonly days: number;
  readonly yearDays: 365 | 366;
  readonly rows: readonly TableRow<V>[];
}

export type Span<V> =
  | {
      readonly kind: 'covered';
      readonly stretches: readonly Stretch<V>[];
      readonly deciding: readonly BillsNormId[];
    }
  // A day no row covers: no figure for the whole period, never the row before in its place.
  | { readonly kind: 'missing'; readonly day: string };

const sameRows = <V>(a: readonly TableRow<V>[], b: readonly TableRow<V>[]): boolean =>
  a.length === b.length && a.every((row, i) => row === b[i]);

// The rows of `table` over every day of the period.
export function spanOf<V>(table: Table<V>, period: BillingPeriod, norms: NormTable): Span<V> {
  const stretches: Stretch<V>[] = [];
  const deciding = new Set<BillsNormId>();
  const days = periodDays(period);
  for (let i = 1; i <= days; i++) {
    const date = addDays(period.from, i);
    const day = toIso(date);
    const lookup = valueOn(table, day, norms);
    if (lookup.kind === 'missing') return { kind: 'missing', day };
    const rows = lookup.kind === 'ok' ? [lookup.row] : lookup.rows;
    if (lookup.kind === 'conditional') for (const id of lookup.norms) deciding.add(id);
    const last = stretches.at(-1);
    if (
      last !== undefined &&
      sameRows(last.rows, rows) &&
      last.last.slice(0, 4) === day.slice(0, 4)
    )
      stretches[stretches.length - 1] = { ...last, last: day, days: last.days + 1 };
    else stretches.push({ first: day, last: day, days: 1, yearDays: daysInYear(date.y), rows });
  }
  return { kind: 'covered', stretches, deciding: [...deciding] };
}

// The lowest and highest a period adds up to, from a value per year shared out by day: on days
// whose value is not settled, the lowest and the highest row.
export interface Range {
  readonly low: number;
  readonly high: number;
}

export const addRanges = (a: Range, b: Range): Range => ({
  low: a.low + b.low,
  high: a.high + b.high,
});

// No norm says whether a leap year divides by 365 or 366: both are taken.
export type YearBase = 365 | 'actual';

export function prorated<V>(
  stretches: readonly Stretch<V>[],
  perYear: (value: V) => number,
  base: YearBase,
): Range {
  let low = 0;
  let high = 0;
  for (const s of stretches) {
    const values = s.rows.map((r) => perYear(r.value));
    const share = s.days / (base === 365 ? 365 : s.yearDays);
    low += Math.min(...values) * share;
    high += Math.max(...values) * share;
  }
  return { low, high };
}

// One value over the whole period, read from the rows of its stretches: when the value changes
// within the period, null, for nothing says how much was used before and after the change.
export function wholePeriod<V>(
  stretches: readonly Stretch<V>[],
  of: (value: V) => number,
): Range | null {
  const ranges = stretches.map((s) => {
    const values = s.rows.map((r) => of(r.value));
    return { low: Math.min(...values), high: Math.max(...values) };
  });
  const [first, ...rest] = ranges;
  if (first === undefined || rest.some((r) => r.low !== first.low || r.high !== first.high))
    return null;
  return first;
}

// A row a figure rests on, with the days it covers and the status of its norm.
export interface RowCitation {
  readonly from: string;
  readonly until: string | null;
  readonly norm: BillsNormId;
  readonly url: string;
  readonly status: NormStatus;
  readonly doubt: RowDoubt | null;
}

export const rowsCited = <V>(
  stretches: readonly Stretch<V>[],
  norms: NormTable,
): readonly RowCitation[] => citeRows([...new Set(stretches.flatMap((s) => s.rows))], norms);

export function citeRows<V>(
  rows: readonly TableRow<V>[],
  norms: NormTable,
): readonly RowCitation[] {
  return rows.map((row) => ({
    from: row.from,
    until: row.until,
    norm: row.norm,
    url: row.url,
    status: norms[row.norm].status,
    doubt: row.doubt ?? null,
  }));
}

// Every row of `table` that may hold on one day, as a tax read on the day the bill falls due, and
// the norms not yet settled that choose between them.
export type DayRows<V> =
  | {
      readonly kind: 'covered';
      readonly rows: readonly TableRow<V>[];
      readonly deciding: readonly BillsNormId[];
    }
  | { readonly kind: 'missing'; readonly day: string };

export function rowsOn<V>(table: Table<V>, day: string, norms: NormTable): DayRows<V> {
  const lookup = valueOn(table, day, norms);
  if (lookup.kind === 'missing') return { kind: 'missing', day };
  return lookup.kind === 'ok'
    ? { kind: 'covered', rows: [lookup.row], deciding: [] }
    : { kind: 'covered', rows: lookup.rows, deciding: lookup.norms };
}

// An official figure over a period, for each way of dividing the year, with the rows it rests on.
export type Official =
  | {
      readonly kind: 'ok';
      // One range for 365 days a year and one for the real length of each year; the same in a
      // year that is not a leap year.
      readonly byBase: readonly [Range, Range];
      readonly rows: readonly RowCitation[];
      // Norms not settled on some day of the period: in the world where they never apply there is
      // no figure at all.
      readonly deciding: readonly BillsNormId[];
    }
  | { readonly kind: 'missing'; readonly day: string };

export type OfficialFigure = Official & { readonly kind: 'ok' };

// A value per year from `table`, shared out over the days of the period.
export function proratedOver<V>(
  table: Table<V>,
  period: BillingPeriod,
  norms: NormTable,
  perYear: (value: V) => number,
): Official {
  const span = spanOf(table, period, norms);
  if (span.kind === 'missing') return span;
  return {
    kind: 'ok',
    byBase: [prorated(span.stretches, perYear, 365), prorated(span.stretches, perYear, 'actual')],
    rows: rowsCited(span.stretches, norms),
    deciding: span.deciding,
  };
}

// Two official figures added up; missing if either is.
export function addOfficial(a: Official, b: Official): Official {
  if (a.kind === 'missing') return a;
  if (b.kind === 'missing') return b;
  return {
    kind: 'ok',
    byBase: [addRanges(a.byBase[0], b.byBase[0]), addRanges(a.byBase[1], b.byBase[1])],
    rows: [...a.rows, ...b.rows],
    deciding: [...new Set([...a.deciding, ...b.deciding])],
  };
}

// The lowest and highest values the norms leave open, each with every year base it may use.
export interface OfficialValues {
  readonly low: readonly number[];
  readonly high: readonly number[];
}

export const officialValues = (byBase: readonly [Range, Range]): OfficialValues => ({
  low: [...new Set(byBase.map((r) => r.low))],
  high: [...new Set(byBase.map((r) => r.high))],
});
