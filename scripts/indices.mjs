// Checks the IRAV, CPI and IGC tables in src/engine/rental/data against the INE: every rate, every
// publication date, every CPI flash (its day, and on a sample of press releases its rate), that no
// published month is missing and that `coveredUntil` does not claim a day after a figure the
// table lacks. Read-only and networked, so it stays out of CI.
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { IGC } from '../src/engine/rental/data/igc.ts';
import { IPC, flashReleaseUrl } from '../src/engine/rental/data/ipc.ts';
import { IRAV } from '../src/engine/rental/data/irav.ts';

const USAGE = `Usage: npm run indices:check

There is no --write mode: when a month is missing, the check lists it with its rate and release
day, and the row is added by hand to src/engine/rental/data.`;

const API = 'https://servicios.ine.es/wstempus/js/ES';
const DEFINITIVE = 1;
const FLASH_SAMPLE = 6;
const MONTHS =
  'enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre'.split(
    ' ',
  );

if (!process.argv.includes('--check')) {
  console.error(USAGE);
  process.exit(2);
}

const madridDay = (ms) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date(ms));
const monthOf = (year, period) => `${year}-${String(period).padStart(2, '0')}`;

async function fetchOk(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response;
}
const get = async (url) => (await fetchOk(url)).json();

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

async function releaseText(url) {
  const response = await fetchOk(url);
  if (!url.endsWith('.pdf'))
    return (await response.text())
      .replace(/<[^>]+>/g, ' ')
      .replace(/&([a-z])acute;/gi, '$1')
      .replace(/&nbsp;/g, ' ');
  const pdf = await getDocument({
    data: new Uint8Array(await response.arrayBuffer()),
    verbosity: 0,
  }).promise;
  let text = '';
  for (let n = 1; n <= Math.min(pdf.numPages, 3); n++)
    text += ` ${(await (await pdf.getPage(n)).getTextContent()).items.map((i) => i.str).join(' ')}`;
  return text;
}

// The headline of each release: «El indicador adelantado del IPC sitúa su variación anual en el
// 1,1% en febrero».
async function releasedFlashRate(month) {
  const text = (await releaseText(flashReleaseUrl(month))).replace(/\s+/g, ' ');
  const name = MONTHS[Number(month.slice(5, 7)) - 1];
  const hit = new RegExp(
    `IPC,? sit[uú]a su variaci[oó]n anual en el ([−–-]?\\d+,\\d)\\s?% en ${name}`,
    'i',
  ).exec(text);
  return hit ? Number(hit[1].replace(/[−–]/, '-').replace(',', '.')) : null;
}

async function checkFlashes(series, releases, figures) {
  const errors = [];
  const flashes = series.values
    .filter((v) => v.flashRate !== undefined)
    .map((v) => ({
      month: v.month,
      rate: v.flashRate,
      publishedOn: v.flashPublishedOn,
      url: v.flashUrl,
    }));
  const pending = series.pendingFlash;
  if (pending) {
    flashes.push(pending);
    const [y, m] = series.values.at(-1).month.split('-').map(Number);
    const expected = m === 12 ? monthOf(y + 1, 1) : monthOf(y, m + 1);
    if (pending.month !== expected)
      errors.push(`pending flash ${pending.month}, expected ${expected}`);
    if (pending.publishedOn !== releases.flash.get(pending.month))
      errors.push(
        `pending flash ${pending.month}: ${pending.publishedOn} here, ${releases.flash.get(pending.month)} in the INE calendar`,
      );
    const provisional = figures.provisional.get(pending.month);
    if (provisional !== undefined && Math.abs(provisional - pending.rate) > 0.004)
      errors.push(
        `pending flash ${pending.month}: ${pending.rate} here, ${provisional} at the INE`,
      );
  }
  for (const f of flashes)
    if (f.url !== flashReleaseUrl(f.month))
      errors.push(`${f.month}: flash without its press release`);

  const step = Math.max(1, Math.floor(flashes.length / FLASH_SAMPLE));
  const sample = flashes.filter((_, i) => i % step === 0 || i === flashes.length - 1);
  for (const f of sample) {
    const released = await releasedFlashRate(f.month);
    if (released !== f.rate)
      errors.push(`${f.month}: flash ${f.rate} here, ${released} in ${f.url}`);
  }
  return { errors, sampled: sample.map((f) => f.month) };
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
    if (v.flashPublishedOn !== undefined && !v.flashUrl)
      errors.push(`${v.month}: flash without a URL`);
  }

  const last = series.values.at(-1).month;
  const later = [...new Set([...releases.definitive.keys(), ...releases.flash.keys()])]
    .filter((month) => month > last)
    .sort();
  for (const month of later) {
    const definitiveOn = releases.definitive.get(month);
    const loadedFlash = series.pendingFlash?.month === month;
    const flashOn = hasFlash && !loadedFlash ? releases.flash.get(month) : undefined;
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

  const flashes = hasFlash ? await checkFlashes(series, releases, figures) : null;
  if (flashes) errors.push(...flashes.errors);
  return { errors, sampled: flashes?.sampled ?? [] };
}

const today = madridDay(Date.now());
let failed = false;
for (const series of [IRAV, IPC, IGC]) {
  const { errors, sampled } = await check(series, today);
  const span = `${series.values[0].month} → ${series.values.at(-1).month}`;
  const pending = series.pendingFlash ? `, flash only for ${series.pendingFlash.month}` : '';
  console.log(
    `${series.id}: ${series.values.length} months (${span})${pending}, covered until ${series.coveredUntil}`,
  );
  if (sampled.length)
    console.log(`  flash rates read from their press releases: ${sampled.join(', ')}`);
  for (const e of errors) console.log(`  ✗ ${e}`);
  failed ||= errors.length > 0;
}
console.log(
  failed ? 'Index tables differ from the INE.' : `Index tables match the INE on ${today}.`,
);
process.exit(failed ? 1 : 0);
