// Checks the IRAV, CPI and IGC tables in src/engine/rental/data against the INE API: every rate,
// every publication date, that no published month is missing and that `coveredUntil` does not
// claim a day after a figure the table lacks. Read-only and networked, so it stays out of CI.
//
//   node scripts/indices.mjs --check
import { IGC } from '../src/engine/rental/data/igc.ts';
import { IPC } from '../src/engine/rental/data/ipc.ts';
import { IRAV } from '../src/engine/rental/data/irav.ts';

const API = 'https://servicios.ine.es/wstempus/js/ES';
const DEFINITIVE = 1;

if (!process.argv.includes('--check')) {
  console.error('Usage: node scripts/indices.mjs --check');
  process.exit(2);
}

const madridDay = (ms) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date(ms));
const monthOf = (year, period) => `${year}-${String(period).padStart(2, '0')}`;

async function get(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

// `Fecha` in the data arrives shifted a day in UTC, so the month comes from `Anyo` + `FK_Periodo`.
async function ineFigures(table, code) {
  const rows = await get(`${API}/DATOS_TABLA/${table}?nult=120`);
  const series = rows.find((row) => row.COD === code);
  if (!series) throw new Error(`Series ${code} not in table ${table}`);
  const definitive = new Map();
  const provisional = new Map();
  for (const d of series.Data) {
    const month = monthOf(d.Anyo, d.FK_Periodo);
    (d.FK_TipoDato === DEFINITIVE ? definitive : provisional).set(month, d.Valor);
  }
  return { definitive, provisional };
}

// A release dated inside its own month is the CPI flash; the first one after it, the definitive.
// Later re-releases of an old month are ignored.
async function calendar(url) {
  const releases = await get(url);
  const definitive = new Map();
  const flash = new Map();
  for (const r of releases) {
    const month = monthOf(r.Anyo, r.FK_Periodo);
    const day = madridDay(r.Fecha);
    const target = day.slice(0, 7) === month ? flash : day.slice(0, 7) > month ? definitive : null;
    if (target && (!target.has(month) || day < target.get(month))) target.set(month, day);
  }
  return { definitive, flash };
}

async function check(series, today) {
  const errors = [];
  const figures = await ineFigures(series.table, series.series);
  const releases = await calendar(series.values[0].publishedUrl);
  const hasFlash = series.values.some((v) => v.flashPublishedOn !== undefined);

  for (const v of series.values) {
    const rate = figures.definitive.get(v.month);
    if (rate === undefined) errors.push(`${v.month}: no definitive figure in the INE series`);
    else if (Math.abs(rate - v.rate) > 0.004)
      errors.push(`${v.month}: ${v.rate} here, ${rate} at the INE`);
    const published = releases.definitive.get(v.month) ?? null;
    if (v.publishedOn !== null && v.publishedOn !== published)
      errors.push(`${v.month}: published ${v.publishedOn} here, ${published} in the INE calendar`);
    const flashOn = releases.flash.get(v.month);
    if (v.flashPublishedOn !== undefined && v.flashPublishedOn !== flashOn)
      errors.push(`${v.month}: flash ${v.flashPublishedOn} here, ${flashOn} in the INE calendar`);
  }

  const last = series.values.at(-1).month;
  const later = [...new Set([...releases.definitive.keys(), ...releases.flash.keys()])]
    .filter((month) => month > last)
    .sort();
  for (const month of later) {
    const definitiveOn = releases.definitive.get(month);
    const flashOn = hasFlash ? releases.flash.get(month) : undefined;
    if (definitiveOn !== undefined && definitiveOn <= today) {
      const rate = figures.definitive.get(month);
      errors.push(
        `${month}: published ${definitiveOn} (${rate ?? 'not yet in the series'}), not loaded`,
      );
    }
    for (const day of [definitiveOn, flashOn])
      if (day !== undefined && day <= series.coveredUntil)
        errors.push(`coveredUntil ${series.coveredUntil} reaches ${month}, released ${day}`);
  }
  if (series.coveredUntil > today)
    errors.push(`coveredUntil ${series.coveredUntil} is after today`);

  const pending = [...figures.provisional].map(([m, r]) => `${m} provisional ${r}`).join(', ');
  return { errors, pending };
}

const today = madridDay(Date.now());
let failed = false;
for (const series of [IRAV, IPC, IGC]) {
  const { errors, pending } = await check(series, today);
  const span = `${series.values[0].month} → ${series.values.at(-1).month}`;
  console.log(
    `${series.id}: ${series.values.length} months (${span}), covered until ${series.coveredUntil}`,
  );
  if (pending) console.log(`  not loaded on purpose: ${pending}`);
  for (const e of errors) console.log(`  ✗ ${e}`);
  failed ||= errors.length > 0;
}
console.log(
  failed ? 'Index tables differ from the INE.' : `Index tables match the INE on ${today}.`,
);
process.exit(failed ? 1 : 0);
