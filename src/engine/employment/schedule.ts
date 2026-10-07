import type { ScheduleDay, TimeSlot, Weekday } from './types';

const DAY = 24 * 60;
export const WEEK = 7 * DAY;
// Art. 36.1 ET: night work is the one done between ten at night and six in the morning.
const NIGHT_FROM = 22 * 60;
const NIGHT_TO = 30 * 60;
// Art. 34.4 ET: the break in a continuous day lasts at least fifteen minutes; a shorter gap
// between two slots does not interrupt the stretch.
const BREAK = 15;

// One working day of the weekly schedule, in minutes from Monday 00:00. A slot whose end is not
// after its start runs past midnight and belongs to the day it starts on.
export interface WorkDay {
  readonly day: Weekday;
  readonly start: number;
  readonly end: number;
  readonly minutes: number;
  readonly nightMinutes: number;
  // The longest stretch worked without a break of fifteen minutes.
  readonly longestStretch: number;
}

export interface WorkWeek {
  readonly days: readonly WorkDay[];
  readonly minutes: number;
  // Rest from the end of each working day to the start of the next one, the week repeating.
  readonly rests: readonly number[];
}

const minutesOf = (time: string): number => {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

interface Interval {
  readonly from: number;
  readonly to: number;
}

const intervalOf = (offset: number, slot: TimeSlot): Interval => {
  const from = minutesOf(slot.from);
  const to = minutesOf(slot.to);
  return { from: offset + from, to: offset + (to > from ? to : to + DAY) };
};

const overlap = (a: Interval, b: Interval): number =>
  Math.max(0, Math.min(a.to, b.to) - Math.max(a.from, b.from));

// Night windows touching a day that starts at `offset`: the end of the previous night, its own
// night and the start of the next one.
const nightMinutes = (offset: number, intervals: readonly Interval[]): number =>
  [-1, 0, 1]
    .map((k) => ({ from: offset + k * DAY + NIGHT_FROM, to: offset + k * DAY + NIGHT_TO }))
    .reduce((sum, night) => sum + intervals.reduce((s, i) => s + overlap(i, night), 0), 0);

function longestStretch(intervals: readonly Interval[]): number {
  let longest = 0;
  let current: Interval | null = null;
  for (const i of intervals) {
    current =
      current !== null && i.from - current.to < BREAK
        ? { from: current.from, to: Math.max(current.to, i.to) }
        : i;
    longest = Math.max(longest, current.to - current.from);
  }
  return longest;
}

function workDay(day: Weekday, slots: readonly TimeSlot[]): WorkDay | null {
  const offset = (day - 1) * DAY;
  const intervals = slots.map((s) => intervalOf(offset, s)).sort((a, b) => a.from - b.from);
  const [first] = intervals;
  if (first === undefined) return null;
  return {
    day,
    start: first.from,
    end: Math.max(...intervals.map((i) => i.to)),
    minutes: intervals.reduce((sum, i) => sum + (i.to - i.from), 0),
    nightMinutes: nightMinutes(offset, intervals),
    longestStretch: longestStretch(intervals),
  };
}

export function workWeek(schedule: readonly ScheduleDay[]): WorkWeek {
  const slotsByDay = new Map<Weekday, TimeSlot[]>();
  for (const { day, slots } of schedule)
    slotsByDay.set(day, [...(slotsByDay.get(day) ?? []), ...slots]);
  const days = [...slotsByDay.entries()]
    .map(([day, slots]) => workDay(day, slots))
    .filter((d): d is WorkDay => d !== null)
    .sort((a, b) => a.start - b.start);
  const rests = days.map((d, i) => {
    const next = days[(i + 1) % days.length];
    const nextStart =
      next === undefined ? d.start : next.start + (i + 1 === days.length ? WEEK : 0);
    return Math.max(0, nextStart - d.end);
  });
  return { days, minutes: days.reduce((sum, d) => sum + d.minutes, 0), rests };
}
