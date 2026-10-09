// A monthly series an official body publishes, kept in the repo as downloaded: `month` is
// 'YYYY-MM' and a null value is a month the source itself leaves empty.
export interface SeriesValue {
  readonly month: string;
  readonly value: number | null;
}

export interface DataSeries {
  readonly id: string;
  readonly citation: string;
  // The file the values come from.
  readonly url: string;
  // The source's own code for the series.
  readonly code: string;
  readonly unit: 'percent';
  // Day the file was downloaded and its `Last-Modified` day.
  readonly retrievedOn: string;
  readonly lastModified: string;
  // First month the series has a figure for; earlier months have none.
  readonly since: string;
  // Last month the file held when it was downloaded.
  readonly coveredUntil: string;
  readonly values: readonly SeriesValue[];
}

export type SeriesRate =
  | { readonly kind: 'ok'; readonly month: string; readonly value: number }
  // After the last month the file held.
  | { readonly kind: 'not_published' }
  // Before the series starts, or a month the source leaves empty.
  | { readonly kind: 'no_data' };

// The figure of exactly `month` ('YYYY-MM'); never an earlier or later month in its place.
export function rateFor(series: DataSeries, month: string): SeriesRate {
  if (month < series.since) return { kind: 'no_data' };
  if (month > series.coveredUntil) return { kind: 'not_published' };
  const found = series.values.find((v) => v.month === month);
  if (found === undefined) throw new Error(`${series.id} has no row for ${month}`);
  if (found.value === null) return { kind: 'no_data' };
  return { kind: 'ok', month, value: found.value };
}
