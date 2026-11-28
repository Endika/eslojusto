import { describe, expect, it } from 'vitest';
import { parseDate } from '../../../src/engine/date';
import { lastsAtMostMonths, lastsLessThanMonths } from '../../../src/engine/employment/term';
import { contract } from './input';

describe('the agreed term against a number of months', () => {
  const ending = (endDate: string | null) =>
    contract({
      startDate: parseDate('2024-03-01'),
      endDate: endDate === null ? null : parseDate(endDate),
    });

  it('has no answer without an end date', () => {
    expect(lastsAtMostMonths(ending(null), 6)).toBeNull();
    expect(lastsLessThanMonths(ending(null), 6)).toBeNull();
  });

  it.each([
    ['2024-08-30', true, true],
    ['2024-08-31', true, false],
    ['2024-09-01', false, false],
  ])('a term ending %s: at most 6 months %s, under 6 months %s', (end, atMost, lessThan) => {
    expect(lastsAtMostMonths(ending(end), 6)).toBe(atMost);
    expect(lastsLessThanMonths(ending(end), 6)).toBe(lessThan);
  });
});
