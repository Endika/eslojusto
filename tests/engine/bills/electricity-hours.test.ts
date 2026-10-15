import { describe, expect, it } from 'vitest';
import { parseDate } from '../../../src/engine/date';
import { TOLL_HOLIDAYS } from '../../../src/engine/bills/data/holidays-20td';
import { energyPeriodAt } from '../../../src/engine/bills/electricity-hours';

const at = (day: string, hour: number) => energyPeriodAt(parseDate(day), hour, TOLL_HOLIDAYS);

describe('the 2.0TD period of an hour', () => {
  it('splits a working weekday into P1, P2 and P3 by the Circular 3/2020 hours', () => {
    // Tuesday 13 October 2026.
    expect([7, 8, 9, 10, 13, 14, 17, 18, 21, 22, 23].map((h) => at('2026-10-13', h))).toEqual([
      'p3',
      'p2',
      'p2',
      'p1',
      'p1',
      'p2',
      'p2',
      'p1',
      'p1',
      'p2',
      'p2',
    ]);
    expect(at('2026-10-13', 0)).toBe('p3');
  });

  it('makes every hour of a weekend P3', () => {
    expect(at('2026-10-17', 12)).toBe('p3');
    expect(at('2026-10-18', 19)).toBe('p3');
  });

  it('makes 6 January and the fixed, non-replaceable national holidays P3', () => {
    for (const day of ['2026-01-06', '2026-05-01', '2026-10-12', '2026-12-08', '2026-12-25'])
      expect(at(day, 12), day).toBe('p3');
  });

  it('leaves Good Friday, which has no fixed date, a working day', () => {
    expect(at('2026-04-03', 12)).toBe('p1');
  });

  it('says so for a year the calendar has not loaded', () => {
    expect(at('2027-01-05', 12)).toBe('missing');
  });
});
