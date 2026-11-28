import { describe, expect, it } from 'vitest';
import {
  wholeMonthsAndRest,
  parseDate as f,
  toIso,
  fromOrdinal,
  ordinal,
} from '../../src/engine/date';

describe('dates', () => {
  it('rejects dates that do not exist', () => {
    expect(() => f('2025-02-29')).toThrow(RangeError);
    expect(() => f('2025-13-01')).toThrow(RangeError);
    expect(() => f('1-1-2025')).toThrow(RangeError);
  });
});

describe('the calendar', () => {
  it.each(['2000-02-29'])('turns %s into its ordinal and back', (iso) => {
    expect(toIso(fromOrdinal(ordinal(f(iso))))).toBe(iso);
  });

  it('has no whole months when the end is before the start', () => {
    expect(wholeMonthsAndRest(f('2025-03-10'), f('2025-03-01'))).toEqual({ whole: 0, rest: 0 });
  });
});
