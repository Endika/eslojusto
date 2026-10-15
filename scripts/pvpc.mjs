// Compares or extends src/engine/bills/data/pvpc-hourly.json with REE's REData: the hourly PVPC
// 2.0TD energy term, from the day after `coveredUntil` to yesterday in Madrid. Networked, so it
// stays out of CI; .github/workflows/pvpc.yml runs `--write` weekly and opens a pull request.
import { readFileSync, writeFileSync } from 'node:fs';
import { addDay, monthChunks, parseRedata, redataUrl, serialise, withDays } from './pvpc-lib.ts';

const USAGE = `Usage: npm run pvpc:check   say which days REData has that the repo lacks
       npm run pvpc:write   add them to the repo file`;

const TARGET = new URL('../src/engine/bills/data/pvpc-hourly.json', import.meta.url);

const mode = process.argv.includes('--write')
  ? 'write'
  : process.argv.includes('--check')
    ? 'check'
    : null;
if (mode === null) {
  console.error(USAGE);
  process.exit(2);
}

const madridDay = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());

const table = JSON.parse(readFileSync(TARGET, 'utf8'));
const from = addDay(table.coveredUntil);
const to = addDay(madridDay(), -1);
if (from > to) {
  console.log(`pvpc-hourly.json already covers ${table.coveredUntil}.`);
  process.exit(0);
}

const fetched = new Map();
for (const [start, end] of monthChunks(from, to)) {
  const url = redataUrl(start, end);
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  for (const [day, hours] of parseRedata(await response.json())) fetched.set(day, hours);
}
const updated = withDays(table, fetched, from, to);

if (mode === 'check') {
  console.log(`REData has ${from} to ${to}; the repo covers up to ${table.coveredUntil}.`);
  process.exit(1);
}
writeFileSync(TARGET, serialise(updated));
console.log(`Wrote ${from} to ${to} into ${TARGET.pathname}.`);
