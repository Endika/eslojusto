import { describe, expect, it } from 'vitest';
import { parseDate, toIso } from '../../../src/engine/date';
import {
  addBusinessDays,
  isBusinessDay,
  type HolidayCalendar,
} from '../../../src/engine/law/calendar';

// A made-up year: 2030 starts on a Tuesday; Friday 15 March is a holiday here.
const CALENDAR: HolidayCalendar = [
  {
    year: 2030,
    days: ['2030-01-01', '2030-03-15'],
    citation: 'Resolución de prueba',
    url: 'https://www.boe.es/diario_boe/txt.php?id=BOE-A-2029-1',
  },
];

const after = (day: string, n: number) => {
  const found = addBusinessDays(parseDate(day), n, CALENDAR);
  return found.kind === 'ok' ? toIso(found.date) : found;
};

describe('working days', () => {
  it.each([
    ['2030-03-11', true],
    ['2030-03-15', false],
    ['2030-03-16', false],
    ['2030-03-17', false],
    ['2030-01-01', false],
  ])('%s is a working day: %s', (day, expected) => {
    expect(isBusinessDay(parseDate(day), CALENDAR)).toBe(expected);
  });

  it('are unknown in a year the calendar has not loaded', () => {
    expect(isBusinessDay(parseDate('2031-03-11'), CALENDAR)).toBeNull();
  });
});

describe('adding working days', () => {
  it('counts from the next day', () => {
    expect(after('2030-03-11', 2)).toBe('2030-03-13');
    expect(after('2030-03-11', 0)).toBe('2030-03-11');
  });

  it('skips the weekend', () => {
    expect(after('2030-03-07', 2)).toBe('2030-03-11');
  });

  it('skips a holiday and the weekend after it', () => {
    expect(after('2030-03-14', 2)).toBe('2030-03-19');
  });

  it('stops at a year the calendar has not loaded', () => {
    expect(after('2030-12-30', 1)).toBe('2030-12-31');
    expect(after('2030-12-30', 2)).toEqual({ kind: 'missing', year: 2031 });
  });

  it('takes only whole, non-negative counts', () => {
    expect(() => addBusinessDays(parseDate('2030-03-11'), -1, CALENDAR)).toThrow(RangeError);
    expect(() => addBusinessDays(parseDate('2030-03-11'), 1.5, CALENDAR)).toThrow(RangeError);
  });
});
