import { describe, expect, it } from 'vitest';
import { BE1904 } from '../../../src/engine/credit/data/be1904';
import { rateFor, type DataSeries } from '../../../src/engine/credit/rates';

const REVOLVING = BE1904['BE_19_4.7'];
const ONE_TO_FIVE = BE1904['BE_19_4.10'];
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const nextMonth = (month: string): string => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};

describe('Bank of Spain table 19.4', () => {
  it('gives the published figure of the month', () => {
    expect(rateFor(ONE_TO_FIVE, '2019-02')).toEqual({
      kind: 'ok',
      month: '2019-02',
      value: 8.0989,
    });
    expect(rateFor(REVOLVING, '2010-12')).toEqual({ kind: 'ok', month: '2010-12', value: 19.3205 });
    expect(rateFor(REVOLVING, '2010-06')).toEqual({ kind: 'ok', month: '2010-06', value: 19.1504 });
    expect(rateFor(REVOLVING, '2026-08')).toEqual({ kind: 'ok', month: '2026-08', value: 18.2578 });
  });

  it('has no revolving figure before June 2010', () => {
    expect(rateFor(REVOLVING, '2010-05')).toEqual({ kind: 'no_data' });
  });

  it.each(Object.keys(BE1904))('%s has not published September 2026 yet', (alias) => {
    expect(rateFor(BE1904[alias as keyof typeof BE1904], '2026-09')).toEqual({
      kind: 'not_published',
    });
  });

  it('gives each published month its own figure, never a neighbour', () => {
    expect(rateFor(REVOLVING, '2015-12')).toEqual({ kind: 'ok', month: '2015-12', value: 21.1266 });
    expect(rateFor(REVOLVING, '2023-12')).toEqual({ kind: 'ok', month: '2023-12', value: 18.2179 });
    expect(rateFor(ONE_TO_FIVE, '2026-08')).toEqual({ kind: 'ok', month: '2026-08', value: 6.972 });
  });

  it.each(Object.entries(BE1904))('%s carries its source and download', (alias, series) => {
    expect(series.id).toBe(alias);
    expect(series.code).toMatch(/^DN_1TI2T\d{4}$/);
    expect(series.url).toMatch(/^https:\/\/www\.bde\.es\/.+\/be1904\.csv$/);
    expect(series.retrievedOn).toMatch(ISO);
    expect(series.lastModified).toMatch(ISO);
    expect(series.retrievedOn >= series.lastModified).toBe(true);
    expect(series.since).toMatch(MONTH);
    expect(series.coveredUntil).toMatch(MONTH);
  });

  it.each(Object.entries(BE1904))('%s holds ordered months of at most four decimals', (_, s) => {
    const months = s.values.map((v) => v.month);
    expect(months).toEqual([...new Set(months)].sort());
    for (const { month, value } of s.values) {
      expect(month).toMatch(MONTH);
      expect(month >= s.since && month <= s.coveredUntil).toBe(true);
      if (value !== null) expect(Math.round(value * 10_000) / 10_000).toBe(value);
    }
  });

  it.each(Object.entries(BE1904))('%s has no gap from its start to its last month', (_, s) => {
    let month = s.since;
    for (const v of s.values) {
      expect(v.month).toBe(month);
      month = nextMonth(month);
    }
    expect(s.values.at(-1)?.month).toBe(s.coveredUntil);
  });
});

describe('rateFor', () => {
  const series: DataSeries = {
    ...REVOLVING,
    since: '2030-01',
    coveredUntil: '2030-03',
    values: [
      { month: '2030-01', value: 20.5 },
      { month: '2030-02', value: null },
      { month: '2030-03', value: 21 },
    ],
  };

  it.each([
    ['2029-12', { kind: 'no_data' }],
    ['2030-01', { kind: 'ok', month: '2030-01', value: 20.5 }],
    ['2030-02', { kind: 'no_data' }],
    ['2030-03', { kind: 'ok', month: '2030-03', value: 21 }],
    ['2030-04', { kind: 'not_published' }],
  ])('reads %s as the source gives it', (month, expected) => {
    expect(rateFor(series, month)).toEqual(expected);
  });

  it('fails on a gap instead of reading it as not yet published', () => {
    const gap = { ...series, values: series.values.filter((v) => v.month !== '2030-02') };
    expect(() => rateFor(gap, '2030-02')).toThrow();
  });
});
