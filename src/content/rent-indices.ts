import { ordinal, parseDate } from '../engine/date';
import { round2 } from '../engine/money';
import { referenceMonth, type IndexSeries } from '../engine/rental/indices';
import { IGC } from '../engine/rental/data/igc';
import { IPC } from '../engine/rental/data/ipc';
import { IRAV } from '../engine/rental/data/irav';

// The monthly page of the rent indices, read from the engine's tables at build time.

export const PATH = '/alquiler/irav-ipc/';

// The IRAV's first month; the table starts there for every index.
export const FIRST_MONTH = '2024-11';

// The day the norms' status on this page was last checked against the BOE.
export const NORMS_CHECKED_ON = '2026-10-07';

// Each month the norms are read again; a check older than this is due.
export const NORMS_REVIEW_DAYS = 35;

export const normsReviewDue = (today: string, checkedOn: string = NORMS_CHECKED_ON): boolean =>
  ordinal(parseDate(today)) - ordinal(parseDate(checkedOn)) > NORMS_REVIEW_DAYS;

export interface Figure {
  readonly rate: number;
  readonly publishedOn: string;
  readonly url: string;
}

export interface MonthRow {
  readonly month: string;
  readonly irav: Figure | null;
  readonly ipc: Figure | null;
  readonly ipcFlash: Figure | null;
  readonly igc: Figure | null;
}

export type Column = Exclude<keyof MonthRow, 'month'>;

export const COLUMNS: readonly Column[] = ['irav', 'ipcFlash', 'ipc', 'igc'];

// The INE table a reader can open, rather than the API the figures were loaded from.
export const inePage = (series: IndexSeries): string =>
  `https://www.ine.es/jaxiT3/Tabla.htm?t=${series.table}`;

const definitive = (series: IndexSeries, month: string): Figure | null => {
  const v = series.values.find((x) => x.month === month);
  return v && v.publishedOn !== null
    ? { rate: v.rate, publishedOn: v.publishedOn, url: inePage(series) }
    : null;
};

const flash = (month: string): Figure | null => {
  const v = IPC.values.find((x) => x.month === month);
  if (v?.flashRate !== undefined && v.flashPublishedOn && v.flashUrl)
    return { rate: v.flashRate, publishedOn: v.flashPublishedOn, url: v.flashUrl };
  const p = IPC.pendingFlash;
  return p && p.month === month ? { rate: p.rate, publishedOn: p.publishedOn, url: p.url } : null;
};

// Every month from the IRAV's first one that has at least one figure, newest first.
export const monthRows = (): readonly MonthRow[] => {
  const months = new Set(
    [IRAV, IPC, IGC]
      .flatMap((s) => s.values.map((v) => v.month))
      .concat(IPC.pendingFlash ? [IPC.pendingFlash.month] : [])
      .filter((m) => m >= FIRST_MONTH),
  );
  return [...months]
    .toSorted()
    .toReversed()
    .map((month) => ({
      month,
      irav: definitive(IRAV, month),
      ipc: definitive(IPC, month),
      ipcFlash: flash(month),
      igc: definitive(IGC, month),
    }));
};

export const figures = (rows: readonly MonthRow[]): Figure[] =>
  rows.flatMap((row) => COLUMNS.map((c) => row[c]).filter((f): f is Figure => f !== null));

// The newest publication among the figures shown: the page's last change.
export const lastPublished = (rows: readonly MonthRow[] = monthRows()): string =>
  figures(rows)
    .map((f) => f.publishedOn)
    .reduce((a, b) => (a > b ? a : b));

// The sitemap's lastmod: the newest figure, or the last check of the norms if later.
export const lastChanged = (rows: readonly MonthRow[] = monthRows()): string => {
  const published = lastPublished(rows);
  return published > NORMS_CHECKED_ON ? published : NORMS_CHECKED_ON;
};

// The last day every table is known to be complete.
export const checkedOn = (): string =>
  [IRAV, IPC, IGC].map((s) => s.coveredUntil).reduce((a, b) => (a < b ? a : b));

export interface Latest {
  readonly month: string;
  readonly figure: Figure;
}

export const latest = (column: Column, rows: readonly MonthRow[] = monthRows()): Latest | null => {
  const row = rows.find((r) => r[column] !== null);
  const figure = row?.[column];
  return row && figure ? { month: row.month, figure } : null;
};

export const SERIES = { irav: IRAV, ipc: IPC, igc: IGC } as const;

// The 2 % of RDL 29/2026, DF 6.ª.
export const DECREE_CAP = 2;

// A worked example on made-up figures: a rent updated by the IRAV on its anniversary.
export const EXAMPLE = { rent: 800, anniversary: '2026-09-01', later: '2026-11-01' } as const;

export interface Example {
  readonly rent: number;
  readonly anniversary: string;
  readonly month: string;
  readonly figure: Figure;
  readonly maxRent: number;
  readonly later: string;
  readonly maxRentLater: number;
}

export const example = (): Example => {
  const found = referenceMonth(IRAV, parseDate(EXAMPLE.anniversary));
  if (found.kind !== 'ok' || found.value.publishedOn === null)
    throw new Error(`No IRAV published on ${EXAMPLE.anniversary}`);
  const { month, rate, publishedOn } = found.value;
  const raise = (rate: number) => round2((EXAMPLE.rent * (100 + rate)) / 100);
  return {
    rent: EXAMPLE.rent,
    anniversary: EXAMPLE.anniversary,
    month,
    figure: { rate, publishedOn, url: inePage(IRAV) },
    maxRent: raise(rate),
    later: EXAMPLE.later,
    maxRentLater: raise(DECREE_CAP),
  };
};

// Spanish formats for the page: «2,47 %», «15-09-2026», «agosto de 2026».
const DECIMALS: Record<Column, number> = { irav: 2, ipc: 1, ipcFlash: 1, igc: 2 };

export const formatRate = (rate: number, column: Column = 'irav'): string =>
  `${new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: DECIMALS[column],
    maximumFractionDigits: 2,
  }).format(rate)}\u00a0%`;

export const formatDay = (iso: string): string => iso.split('-').reverse().join('-');

const MONTH = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export const formatMonth = (month: string): string =>
  MONTH.format(new Date(`${month}-01T00:00:00Z`));

export const formatLongDay = (iso: string): string =>
  new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${iso}T00:00:00Z`));

export const formatEuros = (n: number): string =>
  `${new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: 'always',
  }).format(n)}\u00a0€`;
