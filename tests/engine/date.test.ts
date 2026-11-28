import { describe, expect, it } from 'vitest';
import {
  calendarDays,
  anniversaryMonths,
  wholeMonthsAndRest,
  proratedMonths,
  parseDate as f,
  addMonthsClamped,
  toIso,
  daysInYear,
  daysInMonth,
  isRealDate,
  daysBetween,
  fromOrdinal,
  ordinal,
  max,
  min,
} from '../../src/engine/date';

describe('calendarDays', () => {
  it.each([
    ['2010-03-01', '2026-09-15', 6043],
    ['2024-01-01', '2024-04-01', 92],
    ['2012-02-11', '2012-02-12', 2],
    ['2018-05-03', '2026-07-20', 3001],
    ['2024-02-29', '2025-02-28', 366],
    ['2026-10-06', '2026-10-06', 1],
  ])('%s → %s = %i days (both included)', (a, b, n) => {
    expect(calendarDays(f(a), f(b))).toBe(n);
  });
});

describe('proratedMonths (CGPJ guide §4.a)', () => {
  it.each([
    ['2025-01-01', '2025-02-02', 2], // the guide's own example
    ['2025-01-01', '2025-03-04', 3], // the guide's own example
    ['2016-01-01', '2016-04-01', 4], // the guide's own example
    ['2010-03-01', '2026-09-15', 199], // CGPJ
    ['1990-01-01', '2026-06-30', 438], // CGPJ
    ['2025-06-15', '2026-10-02', 16], // CGPJ
    ['2018-05-03', '2026-07-20', 99], // CGPJ
    ['2020-01-01', '2025-12-31', 72], // CGPJ
    ['2025-01-31', '2025-02-28', 2], // CGPJ, start on the 31st
    ['2025-01-31', '2025-03-01', 2], // CGPJ
    ['2025-01-31', '2025-04-30', 4], // CGPJ
    ['2024-02-29', '2025-02-28', 13], // CGPJ, start on a leap day
    ['2025-01-30', '2025-02-28', 2], // CGPJ
    ['2025-01-16', '2025-02-14', 1], // CGPJ
    ['2020-03-15', '2026-03-13', 72], // CGPJ
    ['1999-05-31', '2008-02-29', 106], // CGPJ, start on the 31st and end on a leap day
    ['2013-12-30', '2026-02-28', 147], // CGPJ
    ['1993-11-20', '2026-06-19', 391], // CGPJ
    ['2012-02-11', '2012-02-11', 1],
  ])('%s → %s = %i months', (a, b, n) => {
    expect(proratedMonths(f(a), f(b))).toBe(n);
  });

  it('falls below the CGPJ tool on an exact anniversary with a start day other than 1', () => {
    // The CGPJ tool gives 2, 73 and 169; its own guide gives 1, 72 and 168.
    expect(proratedMonths(f('2025-01-16'), f('2025-02-15'))).toBe(1);
    expect(proratedMonths(f('2020-03-15'), f('2026-03-14'))).toBe(72);
    expect(proratedMonths(f('2012-10-10'), f('2026-10-09'))).toBe(168);
  });
});

describe('dates', () => {
  it('clamps to the last day of the month', () => {
    expect(toIso(addMonthsClamped(f('2025-01-31'), 1))).toBe('2025-02-28');
    expect(toIso(addMonthsClamped(f('2024-01-31'), 1))).toBe('2024-02-29');
  });
  it('rejects dates that do not exist', () => {
    expect(() => f('2025-02-29')).toThrow(RangeError);
    expect(() => f('2025-13-01')).toThrow(RangeError);
    expect(() => f('1-1-2025')).toThrow(RangeError);
  });
});

describe('wholeMonthsAndRest', () => {
  it.each([
    ['2014-02-15', '2015-07-16', 17, 2],
    ['2014-02-15', '2015-07-14', 17, 0],
    ['2025-01-31', '2025-02-28', 1, 1],
  ])('%s → %s = %i months and %i days', (a, b, whole, rest) => {
    expect(wholeMonthsAndRest(f(a), f(b))).toEqual({ whole, rest });
  });
});

describe('anniversaryMonths', () => {
  it.each([
    ['2026-03-15', '2026-10-14', 7],
    ['2026-03-15', '2026-06-30', 3 + 16 / 30],
    ['2026-03-15', '2026-03-15', 1 / 30],
  ])('%s → %s = %f months', (a, b, months) => {
    expect(anniversaryMonths(f(a), f(b))).toBeCloseTo(months, 10);
  });
});

describe('the calendar', () => {
  it.each([
    [1900, 365],
    [2000, 366],
    [2023, 365],
    [2024, 366],
  ])('%i has %i days', (year, days) => {
    expect(daysInYear(year)).toBe(days);
  });

  it('knows the length of every month, February by leap year', () => {
    expect(daysInMonth(2023, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2024, 4)).toBe(30);
    expect(daysInMonth(2024, 12)).toBe(31);
    expect(daysInMonth(2024, 13)).toBeNaN();
  });

  it.each([
    [{ y: 2024, m: 2, d: 29 }, true],
    [{ y: 2023, m: 2, d: 29 }, false],
    [{ y: 2024, m: 1, d: 1 }, true],
    [{ y: 2024, m: 12, d: 31 }, true],
    [{ y: 2024, m: 0, d: 1 }, false],
    [{ y: 2024, m: 13, d: 1 }, false],
    [{ y: 2024, m: 1, d: 0 }, false],
    [{ y: 2024.5, m: 1, d: 1 }, false],
    [{ y: 2024, m: 1.5, d: 1 }, false],
    [{ y: 2024, m: 1, d: 1.5 }, false],
    [{ y: NaN, m: 1, d: 1 }, false],
  ])('%j is a real date: %s', (date, real) => {
    expect(isRealDate(date)).toBe(real);
  });

  it('counts the days from one date to another, signed', () => {
    expect(daysBetween(f('2024-02-28'), f('2024-03-01'))).toBe(2);
    expect(daysBetween(f('2024-03-01'), f('2024-02-28'))).toBe(-2);
    expect(daysBetween(f('2024-03-01'), f('2024-03-01'))).toBe(0);
  });

  it.each(['1900-03-01', '1904-02-29', '2000-02-29', '2000-03-01', '2000-12-31', '2026-10-06'])(
    'turns %s into its ordinal and back',
    (iso) => {
      expect(toIso(fromOrdinal(ordinal(f(iso))))).toBe(iso);
    },
  );

  it('pads the year, month and day to the ISO width', () => {
    expect(toIso({ y: 5, m: 1, d: 2 })).toBe('0005-01-02');
  });

  it('parses only the exact ISO form', () => {
    expect(() => f('x2025-01-01')).toThrow(RangeError);
    expect(() => f('2025-01-01x')).toThrow(RangeError);
  });

  it('picks the later and the earlier of two dates', () => {
    expect(max(f('2025-01-01'), f('2025-01-02'))).toEqual(f('2025-01-02'));
    expect(max(f('2025-01-02'), f('2025-01-01'))).toEqual(f('2025-01-02'));
    expect(min(f('2025-01-01'), f('2025-01-02'))).toEqual(f('2025-01-01'));
    expect(min(f('2025-01-02'), f('2025-01-01'))).toEqual(f('2025-01-01'));
  });

  it('has no whole months when the end is before the start', () => {
    expect(wholeMonthsAndRest(f('2025-03-10'), f('2025-03-01'))).toEqual({ whole: 0, rest: 0 });
  });
});
