import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  addDay,
  checkDay,
  monthChunks,
  parseRedata,
  redataUrl,
  serialise,
  withDays,
  type Hours,
  type PvpcFile,
} from '../../scripts/pvpc-lib';

// A REData answer recorded on 15-10-2026: the PVPC of 28 and 29 March 2026, the day clocks went
// forward, beside the spot price it also carries.
const answer = JSON.parse(
  readFileSync(new URL('./fixtures/redata-pvpc.json', import.meta.url), 'utf8'),
) as Parameters<typeof parseRedata>[0];

const empty: PvpcFile = {
  unit: 'EUR/MWh',
  source: 'REData',
  url: 'https://www.ree.es/',
  coveredUntil: '2026-03-27',
  days: {},
};

const day = (n: number): Hours => Array.from({ length: n }, (_, h) => [h, 100 + h]);

describe('the PVPC update script', () => {
  it('takes the PVPC series only, by local day and hour', () => {
    const days = parseRedata(answer);
    expect([...days.keys()]).toEqual(['2026-03-28', '2026-03-29']);
    expect(days.get('2026-03-28')).toHaveLength(24);
    // 23 hours on the day clocks go forward: no 2 o'clock.
    const forward = days.get('2026-03-29') ?? [];
    expect(forward).toHaveLength(23);
    expect(forward.map(([h]) => h)).not.toContain(2);
  });

  it('keeps the hour repeated when clocks go back, twice', () => {
    const back = parseRedata({
      included: [
        {
          id: '1001',
          attributes: {
            values: [
              { value: 90, datetime: '2026-10-25T01:00:00.000+02:00' },
              { value: 80, datetime: '2026-10-25T02:00:00.000+02:00' },
              { value: 70, datetime: '2026-10-25T02:00:00.000+01:00' },
            ],
          },
        },
      ],
    });
    expect(back.get('2026-10-25')).toEqual([
      [1, 90],
      [2, 80],
      [2, 70],
    ]);
  });

  it('refuses an answer without the PVPC or with a bad value', () => {
    expect(() => parseRedata({ included: [] })).toThrow(/No PVPC series/);
    expect(() =>
      parseRedata({
        included: [
          { id: '1001', attributes: { values: [{ value: 'x', datetime: '2026-01-01' }] } },
        ],
      }),
    ).toThrow(/Bad PVPC value/);
  });

  it('accepts 23 to 25 hours a day, in order, and nothing else', () => {
    expect(() => checkDay('d', day(23))).not.toThrow();
    expect(() => checkDay('d', day(25))).not.toThrow();
    expect(() => checkDay('d', day(22))).toThrow(/22 hours/);
    expect(() => checkDay('d', [[1, 1], [0, 1], ...day(22)])).toThrow(/out of order/);
  });

  it('adds every day asked for and moves coveredUntil, or adds none', () => {
    const fetched = parseRedata(answer);
    const updated = withDays(empty, fetched, '2026-03-28', '2026-03-29');
    expect(updated.coveredUntil).toBe('2026-03-29');
    expect(Object.keys(updated.days)).toEqual(['2026-03-28', '2026-03-29']);
    expect(() => withDays(empty, fetched, '2026-03-28', '2026-03-30')).toThrow(
      /2026-03-30: missing/,
    );
  });

  it('writes one line per day, read back as the same table', () => {
    const updated = withDays(empty, parseRedata(answer), '2026-03-28', '2026-03-29');
    const text = serialise(updated);
    expect(JSON.parse(text)).toEqual(updated);
    expect(text.split('\n').filter((l) => l.startsWith('    "2026-'))).toHaveLength(2);
  });

  it('asks REData a calendar month at a time', () => {
    expect(monthChunks('2026-01-30', '2026-03-02')).toEqual([
      ['2026-01-30', '2026-01-31'],
      ['2026-02-01', '2026-02-28'],
      ['2026-03-01', '2026-03-02'],
    ]);
    expect(addDay('2026-12-31')).toBe('2027-01-01');
    expect(redataUrl('2026-03-01', '2026-03-31')).toContain(
      'start_date=2026-03-01T00:00&end_date=2026-03-31T23:59&time_trunc=hour',
    );
  });

  it('the table in the repo starts on 1 January 2026 and has every day up to coveredUntil', () => {
    const table = JSON.parse(
      readFileSync(
        new URL('../../src/engine/bills/data/pvpc-hourly.json', import.meta.url),
        'utf8',
      ),
    ) as PvpcFile;
    const days = Object.keys(table.days).sort();
    expect(days[0]).toBe('2026-01-01');
    expect(days.at(-1)).toBe(table.coveredUntil);
    for (let d = '2026-01-01'; d <= table.coveredUntil; d = addDay(d)) {
      const hours = table.days[d];
      expect(hours, d).toBeDefined();
      checkDay(d, hours ?? []);
    }
    expect(table.days['2026-03-29']).toHaveLength(23);
  });
});
