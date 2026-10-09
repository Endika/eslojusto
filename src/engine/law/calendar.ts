import { addDays, ordinal, toIso, type CivilDate } from '../date';

// The national holidays of one year, as the yearly resolution in the BOE lists them.
export interface HolidayYear {
  readonly year: number;
  // ISO days.
  readonly days: readonly string[];
  readonly citation: string;
  readonly url: string;
}

export type HolidayCalendar = readonly HolidayYear[];

export type BusinessDay =
  | { readonly kind: 'ok'; readonly date: CivilDate }
  // A year the calendar has not loaded: no working day is counted across it.
  | { readonly kind: 'missing'; readonly year: number };

// 1970-01-01, ordinal 0, was a Thursday.
const isWeekend = (date: CivilDate): boolean => {
  const weekday = (((ordinal(date) + 4) % 7) + 7) % 7;
  return weekday === 0 || weekday === 6;
};

// Whether `date` is a working day: not a Saturday, a Sunday or a national holiday. Null when its
// year is not loaded.
export function isBusinessDay(date: CivilDate, calendar: HolidayCalendar): boolean | null {
  const year = calendar.find((y) => y.year === date.y);
  if (year === undefined) return null;
  return !isWeekend(date) && !year.days.includes(toIso(date));
}

// The `n`th working day after `date`, `date` itself excluded. Saturdays never count, which gives
// the later end where a norm leaves them in doubt; regional and local holidays are not known here.
export function addBusinessDays(
  date: CivilDate,
  n: number,
  calendar: HolidayCalendar,
): BusinessDay {
  if (!Number.isInteger(n) || n < 0) throw new RangeError(`Invalid number of days: ${n}`);
  let day = date;
  let left = n;
  while (left > 0) {
    day = addDays(day, 1);
    const working = isBusinessDay(day, calendar);
    if (working === null) return { kind: 'missing', year: day.y };
    if (working) left--;
  }
  return { kind: 'ok', date: day };
}
