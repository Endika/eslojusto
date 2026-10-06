export interface CivilDate {
  readonly y: number;
  readonly m: number;
  readonly d: number;
}

export function daysInYear(y: number): 365 | 366 {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365;
}

export function daysInMonth(y: number, m: number): number {
  return (
    [31, daysInYear(y) === 366 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1] ?? NaN
  );
}

export function parseDate(iso: string): CivilDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) throw new RangeError(`Invalid date: ${iso}`);
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m))
    throw new RangeError(`Invalid date: ${iso}`);
  return { y, m, d };
}

export function toIso(f: CivilDate): string {
  return `${String(f.y).padStart(4, '0')}-${String(f.m).padStart(2, '0')}-${String(f.d).padStart(2, '0')}`;
}

// Howard Hinnant, days_from_civil.
export function ordinal({ y, m, d }: CivilDate): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

export function fromOrdinal(n: number): CivilDate {
  const z = n + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  );
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return { y: yoe + era * 400 + (m <= 2 ? 1 : 0), m, d };
}

export const compareDates = (a: CivilDate, b: CivilDate): number => ordinal(a) - ordinal(b);
export const addDays = (f: CivilDate, n: number): CivilDate => fromOrdinal(ordinal(f) + n);
export const max = (a: CivilDate, b: CivilDate): CivilDate => (compareDates(a, b) >= 0 ? a : b);
export const min = (a: CivilDate, b: CivilDate): CivilDate => (compareDates(a, b) <= 0 ? a : b);

export function addMonthsClamped(f: CivilDate, n: number): CivilDate {
  const total = f.y * 12 + (f.m - 1) + n;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return { y, m, d: Math.min(f.d, daysInMonth(y, m)) };
}

export function calendarDays(from: CivilDate, to: CivilDate): number {
  return ordinal(to) - ordinal(from) + 1;
}

export function wholeMonthsAndRest(
  from: CivilDate,
  to: CivilDate,
): { whole: number; rest: number } {
  let whole = (to.y - from.y) * 12 + (to.m - from.m) + 1;
  const endOfWhole = (k: number) => addDays(addMonthsClamped(from, k), -1);
  while (whole > 0 && compareDates(endOfWhole(whole), to) > 0) whole--;
  return { whole, rest: Math.max(0, ordinal(to) - ordinal(endOfWhole(whole))) };
}

// CGPJ guide §4.a, «prorrateándose por meses»: any fraction of a month counts as a whole month.
export function proratedMonths(from: CivilDate, to: CivilDate): number {
  const { whole, rest } = wholeMonthsAndRest(from, to);
  return rest > 0 ? whole + 1 : whole;
}

// Month-based accrual used by payroll software: each whole calendar month counts 1, a partial one days/30.
export function accrualMonths(from: CivilDate, to: CivilDate): number {
  let total = 0;
  let start = from;
  while (compareDates(start, to) <= 0) {
    const monthEnd: CivilDate = { y: start.y, m: start.m, d: daysInMonth(start.y, start.m) };
    const end = min(monthEnd, to);
    const isWholeMonth = start.d === 1 && end.d === monthEnd.d;
    total += isWholeMonth ? 1 : Math.min(1, calendarDays(start, end) / 30);
    start = addDays(monthEnd, 1);
  }
  return total;
}

// Month-based accrual counted from the start date: whole months by monthly anniversary, plus leftover days / 30.
export function anniversaryMonths(from: CivilDate, to: CivilDate): number {
  const { whole, rest } = wholeMonthsAndRest(from, to);
  return whole + rest / 30;
}
