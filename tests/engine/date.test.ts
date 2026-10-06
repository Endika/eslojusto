import { describe, expect, it } from 'vitest';
import {
  calendarDays,
  anniversaryMonths,
  wholeMonthsAndRest,
  proratedMonths,
  parseDate as f,
  addMonthsClamped,
  toIso,
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
