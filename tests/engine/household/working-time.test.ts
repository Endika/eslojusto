import { describe, expect, it } from 'vitest';
import { assessHolidays, assessWorkingTime } from '../../../src/engine/household/working-time';
import type { HouseholdInput } from '../../../src/engine/household/types';
import { household, single, singles, statusOf } from './input';
import { NORMS } from './norms-table';

const time = (change: Partial<HouseholdInput> = {}) => assessWorkingTime(household(change), NORMS);
const holidays = (change: Partial<HouseholdInput> = {}) => assessHolidays(household(change), NORMS);

describe('art. 9 limits', () => {
  it('limits the effective week to 40 hours', () => {
    expect(statusOf(time({ weeklyHours: 40 }), 'weekly_40')).toBe('within_limit');
    expect(statusOf(time({ weeklyHours: 40.5 }), 'weekly_40')).toBe('over_legal_limit');
    expect(statusOf(time({ weeklyHours: null }), 'weekly_40')).toBe('not_entered');
  });

  it('wants 12 hours between shifts', () => {
    expect(statusOf(time({ shortestRestHours: 12 }), 'rest_between_shifts')).toBe('within_limit');
    expect(statusOf(time({ shortestRestHours: 11.5 }), 'rest_between_shifts')).toBe(
      'below_minimum',
    );
    expect(statusOf(time({ shortestRestHours: null }), 'rest_between_shifts')).toBe('not_entered');
  });

  it('lets a live-in worker rest 10 hours if the rest is made up within four weeks', () => {
    const live = (rest: number, madeUp: boolean | null) =>
      statusOf(
        time({ liveIn: true, shortestRestHours: rest, restMadeUpWithinFourWeeks: madeUp }),
        'rest_between_shifts',
      );
    expect(live(10, true)).toBe('within_limit');
    expect(live(10, false)).toBe('below_minimum');
    expect(live(10, null)).toBe('review_it');
    expect(live(9.9, true)).toBe('below_minimum');
    expect(live(12, null)).toBe('within_limit');
  });

  it('wants 36 hours of weekly rest', () => {
    expect(statusOf(time({ weeklyRestHours: 36 }), 'weekly_rest_36')).toBe('within_limit');
    expect(statusOf(time({ weeklyRestHours: 35 }), 'weekly_rest_36')).toBe('below_minimum');
    expect(statusOf(time({ weeklyRestHours: null }), 'weekly_rest_36')).toBe('not_entered');
  });

  it('wants 30 calendar days of holidays, one stretch of at least 15', () => {
    expect(statusOf(holidays(), 'holidays_30')).toBe('within_limit');
    expect(statusOf(holidays(), 'holidays_stretch_15')).toBe('within_limit');
    expect(
      statusOf(
        holidays({ holidays: { days: 29, longestStretch: 14, taken: null } }),
        'holidays_30',
      ),
    ).toBe('below_minimum');
    expect(
      statusOf(
        holidays({ holidays: { days: 30, longestStretch: 14, taken: null } }),
        'holidays_stretch_15',
      ),
    ).toBe('below_minimum');
    expect(
      statusOf(
        holidays({ holidays: { days: 30, longestStretch: null, taken: null } }),
        'holidays_stretch_15',
      ),
    ).toBe('not_entered');
    expect(statusOf(holidays({ holidays: null }), 'holidays_30')).toBe('not_entered');
  });

  it('never carries an amount: they fall short of the norm with no money to add', () => {
    const bad = household({
      weeklyHours: 60,
      shortestRestHours: 6,
      weeklyRestHours: 10,
      holidays: { days: 10, longestStretch: 5, taken: null },
    });
    const findings = [
      ...singles(assessWorkingTime(bad, NORMS)),
      ...singles(assessHolidays(bad, NORMS)),
    ];
    expect(findings.length).toBe(5);
    expect(findings.every((f) => f.amount === null && f.status !== 'within_limit')).toBe(true);
    expect(single(assessWorkingTime(bad, NORMS), 'weekly_40').sources[0]?.citation).toContain(
      'art. 9',
    );
  });
});

describe('what the working time findings show', () => {
  const phrases = (items: ReturnType<typeof time>) =>
    singles(items).map((f) => [f.id, f.status, f.basedOnYourAnswer, f.calculation]);
  const hoursOf = (key: string, hours: number, limit: number, more = {}) => ({
    key,
    vars: { hours, limit, ...more },
  });

  it('files its findings under working time and holidays', () => {
    expect(new Set(singles(time()).map((f) => f.item))).toEqual(new Set(['working_time']));
    expect(new Set(singles(holidays()).map((f) => f.item))).toEqual(new Set(['holidays']));
  });

  it('shows the figures against the limits', () => {
    expect(phrases(time({ weeklyHours: 50, weeklyRestHours: 30 }))).toEqual([
      [
        'weekly_40',
        'over_legal_limit',
        false,
        [hoursOf('working_time.weekly_hours', 50, 40), { key: 'working_time.presence_apart' }],
      ],
      ['rest_between_shifts', 'within_limit', false, [hoursOf('working_time.rest', 12, 12)]],
      ['weekly_rest_36', 'below_minimum', false, [hoursOf('working_time.weekly_rest', 30, 36)]],
    ]);
  });

  it.each([
    ['a rest made up', true, 'within_limit', 'working_time.rest_made_up'],
    ['a rest not made up', false, 'below_minimum', 'working_time.rest_not_made_up'],
    ['a rest that may be made up', null, 'review_it', 'working_time.rest_made_up_unknown'],
  ])('shows a live-in worker with %s', (_name, madeUp, status, key) => {
    const f = single(
      time({ liveIn: true, shortestRestHours: 10, restMadeUpWithinFourWeeks: madeUp }),
      'rest_between_shifts',
    );
    expect(f.status).toBe(status);
    expect(f.basedOnYourAnswer).toBe(true);
    expect(f.calculation).toEqual([hoursOf('working_time.rest_live_in', 10, 10), { key }]);
  });

  it.each([
    ['lives out', false, 'working_time.rest_below'],
    ['lives in', true, 'working_time.rest_below_live_in'],
  ])('shows a rest below the limit of a worker who %s', (_name, liveIn, key) => {
    const f = single(time({ liveIn, shortestRestHours: 8 }), 'rest_between_shifts');
    expect(f.basedOnYourAnswer).toBe(false);
    expect(f.calculation).toEqual([hoursOf(key, 8, 12, { liveInLimit: 10 })]);
  });

  it('shows the days of holidays against the limits', () => {
    expect(phrases(holidays({ holidays: { days: 20, longestStretch: 10, taken: null } }))).toEqual([
      [
        'holidays_30',
        'below_minimum',
        false,
        [{ key: 'holidays.days', vars: { days: 20, limit: 30 } }],
      ],
      [
        'holidays_stretch_15',
        'below_minimum',
        false,
        [{ key: 'holidays.stretch', vars: { days: 10, limit: 15 } }],
      ],
    ]);
  });
});
