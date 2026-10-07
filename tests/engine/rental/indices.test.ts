import { describe, expect, it } from 'vitest';
import { parseDate } from '../../../src/engine/date';
import { IGC } from '../../../src/engine/rental/data/igc';
import { IPC } from '../../../src/engine/rental/data/ipc';
import { IRAV } from '../../../src/engine/rental/data/irav';
import { LEGAL_INTEREST } from '../../../src/engine/rental/data/legal-interest';
import {
  referenceMonth,
  type IndexSeries,
  type IndexValue,
} from '../../../src/engine/rental/indices';

const INE = 'https://servicios.ine.es/';
const BDE = 'https://clientebancario.bde.es/';

const nextMonth = (month: string): string => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};
const lookup = (series: IndexSeries, day: string) => referenceMonth(series, parseDate(day));

describe.each([IRAV, IPC, IGC])('the $id table', (series) => {
  it('cites the INE series it was loaded from', () => {
    expect(series.url).toBe(`${INE}wstempus/js/ES/DATOS_SERIE/${series.series}`);
    expect(series.coveredUntil).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('has one value per month, without gaps, at two decimals at most', () => {
    series.values.forEach((v, i) => {
      expect(Math.abs(v.rate * 100 - Math.round(v.rate * 100))).toBeLessThan(1e-9);
      const previous = series.values[i - 1];
      if (previous) expect(v.month).toBe(nextMonth(previous.month));
    });
  });

  it('dates every figure from its source, after its month and within the coverage', () => {
    for (const v of series.values) {
      expect(v.publishedOn === null).toBe(v.publishedUrl === null);
      if (v.publishedOn !== null) {
        expect(v.publishedOn.slice(0, 7) > v.month).toBe(true);
        expect(v.publishedOn <= series.coveredUntil).toBe(true);
      }
      if (v.publishedUrl !== null) expect(v.publishedUrl.startsWith(INE)).toBe(true);
      expect(v.flashPublishedOn === undefined).toBe(v.flashUrl === undefined);
      if (v.flashRate !== undefined) expect(v.flashPublishedOn).toBeDefined();
      if (v.flashPublishedOn !== undefined) {
        expect(v.flashPublishedOn.slice(0, 7)).toBe(v.month);
        expect(v.flashUrl?.startsWith(INE)).toBe(true);
      }
    }
  });
});

it('every CPI month records when its flash came out, so no flash window goes unnoticed', () => {
  expect(IPC.values.filter((v) => v.flashPublishedOn === undefined)).toEqual([]);
});

describe('reference month', () => {
  it('is in doubt on the day the INE publishes it', () => {
    expect(lookup(IRAV, '2026-09-15')).toMatchObject({
      kind: 'same_day',
      value: { month: '2026-08', rate: 2.47 },
      previous: { month: '2026-07', rate: 2.49 },
    });
  });

  it('is the last one published by the day of the update', () => {
    expect(lookup(IRAV, '2026-09-16')).toEqual({
      kind: 'ok',
      value: expect.objectContaining({ month: '2026-08', rate: 2.47 }),
    });
  });

  it('is not loaded after the table coverage or before the index existed', () => {
    expect(lookup(IRAV, '2026-10-08')).toEqual({ kind: 'not_loaded' });
    expect(lookup(IRAV, '2025-01-01')).toEqual({ kind: 'not_loaded' });
  });

  it('says when a CPI flash was out and its rate is not in the table', () => {
    const r = lookup(IPC, '2025-04-05');
    expect(r).toMatchObject({
      kind: 'flash_not_loaded',
      definitive: { month: '2025-02', publishedOn: '2025-03-14' },
      next: { month: '2025-03', flashPublishedOn: '2025-03-28' },
    });
    expect(lookup(IPC, '2025-04-20')).toMatchObject({ kind: 'ok', value: { month: '2025-03' } });
  });

  describe('on a series with flash rates and unknown dates', () => {
    const value = (month: string, publishedOn: string | null, flash?: string): IndexValue => ({
      month,
      rate: 2,
      publishedOn,
      publishedUrl: publishedOn === null ? null : `${INE}calendar`,
      ...(flash === undefined
        ? {}
        : { flashRate: 2.5, flashPublishedOn: flash, flashUrl: `${INE}calendar` }),
    });
    const series = (values: readonly IndexValue[]): IndexSeries => ({
      id: 'ipc',
      citation: 'synthetic',
      url: `${INE}series`,
      table: 1,
      series: 'X',
      coveredUntil: '2030-12-31',
      values,
    });

    it('weighs the flash of the next month against the last definitive one', () => {
      const s = series([
        value('2030-01', '2030-02-14'),
        value('2030-02', '2030-03-14', '2030-02-27'),
      ]);
      expect(lookup(s, '2030-02-27')).toMatchObject({
        kind: 'flash_window',
        definitive: { month: '2030-01' },
        flashNext: { month: '2030-02', flashRate: 2.5 },
      });
      expect(lookup(s, '2030-02-26')).toMatchObject({ kind: 'ok', value: { month: '2030-01' } });
      expect(lookup(s, '2030-03-15')).toMatchObject({ kind: 'ok', value: { month: '2030-02' } });
    });

    it('never guesses whether a month without a date was out', () => {
      const s = series([value('2030-01', '2030-02-14'), value('2030-02', null)]);
      expect(lookup(s, '2030-03-20')).toEqual({ kind: 'publication_unknown' });
      expect(lookup(s, '2030-02-20')).toMatchObject({ kind: 'ok', value: { month: '2030-01' } });
    });

    it('never takes a month as published within that same month', () => {
      const s = series([value('2030-01', '2030-01-31')]);
      expect(lookup(s, '2030-01-31')).toEqual({ kind: 'not_loaded' });
    });
  });
});

describe('legal interest', () => {
  it('covers every year from 2019 to 2026 once, each with its source', () => {
    const years = LEGAL_INTEREST.map((y) => y.year);
    for (let year = 2019; year <= 2026; year++)
      expect(years.filter((y) => y === year)).toHaveLength(1);
    for (const y of LEGAL_INTEREST) expect(y.url.startsWith(BDE)).toBe(true);
  });

  it('is 3 % until 2022 and 3,25 % from 2023', () => {
    const rate = (year: number) => LEGAL_INTEREST.find((y) => y.year === year)?.rate;
    expect(rate(2022)).toBe(3);
    expect(rate(2023)).toBe(3.25);
    expect(rate(2026)).toBe(3.25);
  });
});
