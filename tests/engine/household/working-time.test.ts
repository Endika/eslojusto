import { describe, expect, it } from 'vitest';
import { assessHolidays, assessWorkingTime } from '../../../src/engine/household/working-time';
import type { HouseholdInput } from '../../../src/engine/household/types';
import { household, single, singles, statusOf } from './input';
import { NORMS } from './norms-table';

const time = (change: Partial<HouseholdInput> = {}) => assessWorkingTime(household(change), NORMS);
const holidays = (change: Partial<HouseholdInput> = {}) => assessHolidays(household(change), NORMS);

describe('art. 9 warnings', () => {
  it('limits the effective week to 40 hours', () => {
    expect(statusOf(time({ weeklyHours: 40 }), 'weekly_40')).toBe('within_limit');
    expect(statusOf(time({ weeklyHours: 40.5 }), 'weekly_40')).toBe('warning');
    expect(statusOf(time({ weeklyHours: null }), 'weekly_40')).toBe('not_entered');
  });

  it('wants 12 hours between shifts', () => {
    expect(statusOf(time({ shortestRestHours: 12 }), 'rest_between_shifts')).toBe('within_limit');
    expect(statusOf(time({ shortestRestHours: 11.5 }), 'rest_between_shifts')).toBe('warning');
    expect(statusOf(time({ shortestRestHours: null }), 'rest_between_shifts')).toBe('not_entered');
  });

  it('lets a live-in worker rest 10 hours if the rest is made up within four weeks', () => {
    const live = (rest: number, madeUp: boolean | null) =>
      statusOf(
        time({ liveIn: true, shortestRestHours: rest, restMadeUpWithinFourWeeks: madeUp }),
        'rest_between_shifts',
      );
    expect(live(10, true)).toBe('within_limit');
    expect(live(10, false)).toBe('warning');
    expect(live(10, null)).toBe('review_it');
    expect(live(9.9, true)).toBe('warning');
    expect(live(12, null)).toBe('within_limit');
  });

  it('does not let a worker who lives out rest 10 hours', () => {
    expect(
      statusOf(
        time({ liveIn: false, shortestRestHours: 10, restMadeUpWithinFourWeeks: true }),
        'rest_between_shifts',
      ),
    ).toBe('warning');
  });

  it('wants 36 hours of weekly rest', () => {
    expect(statusOf(time({ weeklyRestHours: 36 }), 'weekly_rest_36')).toBe('within_limit');
    expect(statusOf(time({ weeklyRestHours: 35 }), 'weekly_rest_36')).toBe('warning');
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
    ).toBe('warning');
    expect(
      statusOf(
        holidays({ holidays: { days: 30, longestStretch: 14, taken: null } }),
        'holidays_stretch_15',
      ),
    ).toBe('warning');
    expect(
      statusOf(
        holidays({ holidays: { days: 30, longestStretch: null, taken: null } }),
        'holidays_stretch_15',
      ),
    ).toBe('not_entered');
    expect(statusOf(holidays({ holidays: null }), 'holidays_30')).toBe('not_entered');
  });

  it('never carries an amount: they are warnings, not money', () => {
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
