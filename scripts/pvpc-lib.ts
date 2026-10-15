// The pure part of scripts/pvpc.mjs, kept apart so tests run it without the network.

export type Hours = [number, number][];
export interface PvpcFile {
  readonly unit: string;
  readonly source: string;
  readonly url: string;
  readonly coveredUntil: string;
  readonly days: Readonly<Record<string, Hours>>;
}

export const REDATA = 'https://apidatos.ree.es/es/datos/mercados/precios-mercados-tiempo-real';
// REData's id for the PVPC series: ESIOS indicator 1001, the 2.0TD energy term with tolls and
// charges, in €/MWh. It is the same in every territory.
export const PVPC_ID = '1001';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const addDay = (day: string, n = 1): string => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// The URL for the hours of `from` to `to`, both included.
export const redataUrl = (from: string, to: string): string =>
  `${REDATA}?start_date=${from}T00:00&end_date=${to}T23:59&time_trunc=hour`;

// Requests of one calendar month at most, from `from` to `to`.
export function monthChunks(from: string, to: string): [string, string][] {
  const chunks: [string, string][] = [];
  let start = from;
  while (start <= to) {
    const [y, m] = start.split('-').map(Number) as [number, number];
    const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    const end = monthEnd < to ? monthEnd : to;
    chunks.push([start, end]);
    start = addDay(end);
  }
  return chunks;
}

// Day → [[local hour of start, €/MWh], …] from one REData answer. The day and the hour come from
// the local time REData prints, so the hour repeated when clocks go back stays twice.
interface RedataSeries {
  readonly id?: string;
  readonly type?: string;
  readonly attributes?: { readonly values?: readonly { value: unknown; datetime: unknown }[] };
}

export function parseRedata(json: {
  readonly included?: readonly RedataSeries[];
}): Map<string, Hours> {
  const series = (json.included ?? []).find((s) => s.id === PVPC_ID || s.type === 'PVPC');
  if (!series) throw new Error('No PVPC series in the REData answer');
  const days = new Map<string, Hours>();
  for (const { value, datetime } of series.attributes?.values ?? []) {
    if (typeof datetime !== 'string' || typeof value !== 'number' || !Number.isFinite(value))
      throw new Error(`Bad PVPC value: ${JSON.stringify({ value, datetime })}`);
    const day = datetime.slice(0, 10);
    const hour = Number(datetime.slice(11, 13));
    if (!DAY.test(day) || !(hour >= 0 && hour <= 23)) throw new Error(`Bad datetime: ${datetime}`);
    const hours = days.get(day) ?? [];
    hours.push([hour, Math.round(value * 100) / 100]);
    days.set(day, hours);
  }
  return days;
}

// The last Sunday of `month` (1-12) in `year`, when Spanish clocks change.
const lastSunday = (year: number, month: number): string => {
  const d = new Date(Date.UTC(year, month, 0));
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
};

// 23 hours, without 2 o'clock, on the last Sunday of March; 25, with 2 o'clock twice, on the last
// Sunday of October; 24, each once, any other day. In order.
export function checkDay(day: string, hours: Hours): void {
  const year = Number(day.slice(0, 4));
  const expected = day === lastSunday(year, 3) ? 23 : day === lastSunday(year, 10) ? 25 : 24;
  if (hours.length !== expected)
    throw new Error(`${day}: ${hours.length} hours from REData, expected ${expected}`);
  for (let i = 1; i < hours.length; i++) {
    const [before, now] = [hours[i - 1]?.[0] ?? 0, hours[i]?.[0] ?? 0];
    if (now < before || (now === before && !(expected === 25 && now === 2)))
      throw new Error(`${day}: hours out of order at ${now}`);
  }
}

// The table with the days from `from` to `to` added; every one of them must be there.
export function withDays(
  table: PvpcFile,
  fetched: ReadonlyMap<string, Hours>,
  from: string,
  to: string,
): PvpcFile {
  const days = { ...table.days };
  for (let day = from; day <= to; day = addDay(day)) {
    const hours = fetched.get(day);
    if (!hours) throw new Error(`${day}: missing from REData`);
    checkDay(day, hours);
    days[day] = hours;
  }
  return { ...table, coveredUntil: to, days };
}

// One line per day, so a weekly update reads as a few added lines.
export function serialise(table: PvpcFile): string {
  const head = Object.entries(table)
    .filter(([k]) => k !== 'days')
    .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`);
  const days = Object.keys(table.days)
    .sort()
    .map((d) => `    ${JSON.stringify(d)}: ${JSON.stringify(table.days[d])}`);
  return `{\n${head.join('\n')}\n  "days": {\n${days.join(',\n')}\n  }\n}\n`;
}
