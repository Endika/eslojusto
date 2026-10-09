// Compares or regenerates src/engine/credit/data/be1904.ts with the Banco de España CSV of
// table 19.4 (latin-1; `_` marks a month with no figure). Nothing is interpolated: a month the CSV
// leaves empty stays null. Networked, so it stays out of CI.
import { readFileSync, writeFileSync } from 'node:fs';
import { BE1904 } from '../src/engine/credit/data/be1904.ts';

const USAGE = `Usage: npm run bde:check   compare the repo with the published CSV
       npm run bde:write   rewrite the repo file from the published CSV`;

const CSV = 'https://www.bde.es/webbe/es/estadisticas/compartido/datos/csv/be1904.csv';
const TARGET = new URL('../src/engine/credit/data/be1904.ts', import.meta.url);
const MONTHS = 'ENE FEB MAR ABR MAY JUN JUL AGO SEP OCT NOV DIC'.split(' ');
const MONTH_ROW = /^([A-Z]{3}) (\d{4})$/;

const mode = process.argv.includes('--write')
  ? 'write'
  : process.argv.includes('--check')
    ? 'check'
    : null;
if (mode === null) {
  console.error(USAGE);
  process.exit(2);
}

// One CSV line into cells, quotes removed; the separator is the first `;` or `,` outside quotes.
function cells(line, separator) {
  const out = [];
  let cell = '';
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === separator && !quoted) {
      out.push(cell.trim());
      cell = '';
    } else cell += ch;
  }
  out.push(cell.trim());
  return out;
}

function figure(text) {
  if (text === '_' || text === '') return null;
  const value = Number(text.replace(',', '.'));
  if (!Number.isFinite(value)) throw new Error(`Not a figure: ${text}`);
  return value;
}

// Month → value for each series alias in the file.
function parse(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  const separator = lines[0].replace(/"[^"]*"/g, '').includes(';') ? ';' : ',';
  const rows = lines.map((l) => cells(l, separator));
  const aliasRow = rows.find((r) => r[0].toUpperCase() === 'ALIAS DE LA SERIE');
  if (!aliasRow) throw new Error('No "ALIAS DE LA SERIE" row in the CSV');
  const series = new Map();
  for (const row of rows) {
    const match = MONTH_ROW.exec(row[0].toUpperCase());
    if (!match) continue;
    const month = `${match[2]}-${String(MONTHS.indexOf(match[1]) + 1).padStart(2, '0')}`;
    if (month.endsWith('-00')) throw new Error(`Unknown month: ${row[0]}`);
    aliasRow.forEach((alias, i) => {
      if (i === 0) return;
      if (!series.has(alias)) series.set(alias, new Map());
      series.get(alias).set(month, figure(row[i] ?? '_'));
    });
  }
  return series;
}

const isoDay = (date) => date.toISOString().slice(0, 10);
const madridDay = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());

const response = await fetch(CSV, { signal: AbortSignal.timeout(30_000) });
if (!response.ok) throw new Error(`${CSV}: HTTP ${response.status}`);
const header = response.headers.get('last-modified');
const lastModified = header === null ? null : isoDay(new Date(header));
const published = parse(new TextDecoder('latin1').decode(await response.arrayBuffer()));

const columnOf = (alias) => {
  const column = published.get(alias);
  if (!column) throw new Error(`${alias} not in the CSV`);
  return column;
};

if (mode === 'check') {
  const problems = [];
  const sample = Object.values(BE1904)[0];
  if (lastModified !== sample.lastModified)
    problems.push(`Last-Modified is ${lastModified}, the repo has ${sample.lastModified}`);
  for (const series of Object.values(BE1904)) {
    const column = columnOf(series.id);
    for (const { month, value } of series.values)
      if (column.get(month) !== value)
        problems.push(`${series.id} ${month}: CSV ${column.get(month)}, repo ${value}`);
    const loaded = new Set(series.values.map((v) => v.month));
    const newer = [...column.keys()].filter(
      (m) => m > series.coveredUntil && column.get(m) !== null,
    );
    if (newer.length > 0) problems.push(`${series.id}: new months ${newer.join(', ')}`);
    const missing = [...column.keys()].filter(
      (m) => m >= series.since && m <= series.coveredUntil && !loaded.has(m),
    );
    if (missing.length > 0) problems.push(`${series.id}: months missing ${missing.join(', ')}`);
  }
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  console.log(`be1904 matches the CSV (Last-Modified ${lastModified}).`);
} else {
  const lastMonth = [...published.values()]
    .flatMap((column) => [...column].filter(([, v]) => v !== null).map(([m]) => m))
    .sort()
    .at(-1);
  const source = readFileSync(TARGET, 'utf8');
  const rewritten = Object.values(BE1904).reduce((text, series) => {
    const column = columnOf(series.id);
    const months = [...column.keys()].filter((m) => m >= series.since && m <= lastMonth).sort();
    const rows = months.map((m) => `    ['${m}', ${column.get(m) ?? 'null'}],`).join('\n');
    const start = `series('${series.id}', '${series.code}', '${series.since}', [`;
    const at = text.indexOf(start);
    if (at < 0) throw new Error(`${series.id} not found in ${TARGET.pathname}`);
    const end = text.indexOf(']),', at);
    return `${text.slice(0, at)}${start}\n${rows}\n  ${text.slice(end)}`;
  }, source);

  writeFileSync(
    TARGET,
    rewritten
      .replace(/const RETRIEVED_ON = '[^']*'/, `const RETRIEVED_ON = '${madridDay()}'`)
      .replace(/const LAST_MODIFIED = '[^']*'/, `const LAST_MODIFIED = '${lastModified}'`)
      .replace(/const COVERED_UNTIL = '[^']*'/, `const COVERED_UNTIL = '${lastMonth}'`),
  );
  console.log(`Wrote ${TARGET.pathname}; run npm run format to tidy it.`);
}
