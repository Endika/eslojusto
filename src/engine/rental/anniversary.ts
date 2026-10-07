import { compareDates, daysInMonth, type CivilDate } from '../date';

// The contract's anniversary in a year; a 29 February start falls on 28 February otherwise.
export function anniversaryIn(start: CivilDate, y: number): CivilDate {
  return { y, m: start.m, d: Math.min(start.d, daysInMonth(y, start.m)) };
}

export const isAnniversary = (start: CivilDate, day: CivilDate): boolean =>
  day.y > start.y && compareDates(anniversaryIn(start, day.y), day) === 0;
