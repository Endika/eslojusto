import { describe, expect, it } from 'vitest';
import {
  COLUMNS,
  FIRST_MONTH,
  PATH,
  example,
  figures,
  formatMonth,
  formatRate,
  lastPublished,
  latest,
  monthRows,
} from '../../src/content/rent-indices';
import { LAST_UPDATED } from '../../src/content/updated';

const rows = monthRows();

describe('the monthly rent indices', () => {
  it('starts at the IRAV and runs newest first, one row per month', () => {
    const months = rows.map((r) => r.month);
    expect(months.at(-1)).toBe(FIRST_MONTH);
    expect(months).toEqual(months.toSorted().toReversed());
    expect(new Set(months).size).toBe(months.length);
  });

  it('every figure shown has a source URL and a publication date', () => {
    for (const row of rows) {
      expect(
        COLUMNS.some((c) => row[c] !== null),
        row.month,
      ).toBe(true);
      for (const c of COLUMNS) {
        const f = row[c];
        if (f === null) continue;
        expect(f.url, `${row.month} ${c}`).toMatch(/^https:\/\/(www|servicios)\.ine\.es\//);
        expect(f.publishedOn, `${row.month} ${c}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        // A month's figure always comes out after the month starts.
        expect(f.publishedOn > row.month, `${row.month} ${c}`).toBe(true);
      }
    }
  });

  it('dates the sitemap entry with the newest publication shown', () => {
    const newest = figures(rows)
      .map((f) => f.publishedOn)
      .toSorted()
      .at(-1);
    expect(lastPublished(rows)).toBe(newest);
    expect(LAST_UPDATED[PATH]).toBe(newest);
  });

  it('finds the latest figure of each column', () => {
    expect(latest('irav', rows)?.month).toBe(rows.find((r) => r.irav)?.month);
  });

  it('writes rates and months the Spanish way', () => {
    expect(formatRate(2.2, 'irav')).toBe('2,20\u00a0%');
    expect(formatRate(4.3, 'ipc')).toBe('4,3\u00a0%');
    expect(formatRate(-0.33, 'igc')).toBe('-0,33\u00a0%');
    expect(formatMonth('2026-08')).toBe('agosto de 2026');
  });

  it('works the example out from the IRAV published on the anniversary', () => {
    const ex = example();
    expect(ex.month < ex.anniversary.slice(0, 7)).toBe(true);
    expect(ex.figure.publishedOn <= ex.anniversary).toBe(true);
    expect(ex.maxRent).toBe(Math.round(ex.rent * (100 + ex.figure.rate)) / 100);
    expect(ex.maxRentLater).toBe(ex.rent * 1.02);
  });
});
