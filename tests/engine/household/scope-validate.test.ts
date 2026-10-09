import { describe, expect, it } from 'vitest';
import { parseDate } from '../../../src/engine/date';
import { scope } from '../../../src/engine/household/scope';
import { validate } from '../../../src/engine/household/validate';
import { desistimiento, household, TODAY } from './input';

const d = parseDate;

describe('scope', () => {
  it('reviews a relationship still running', () => {
    expect(scope(household())).toEqual({ inScope: true });
  });

  it('stops at the door for one that ended before RDL 16/2022 came into force', () => {
    const ended = (day: string) =>
      scope(household({ termination: desistimiento({ effectiveOn: d(day) }) }));
    expect(ended('2022-09-08')).toEqual({ inScope: false, reason: 'before_reform' });
    expect(ended('2022-09-09')).toEqual({ inScope: true });
  });
});

describe('validate', () => {
  const fields = (change: Parameters<typeof household>[0]) =>
    validate(household(change), TODAY).map((e) => `${e.field}:${e.code}`);

  it('accepts a complete input', () => {
    expect(validate(household({ termination: desistimiento() }), TODAY)).toEqual([]);
  });

  it('rejects dates that do not exist or lie too far ahead', () => {
    expect(fields({ startDate: { y: 2025, m: 2, d: 30 } })).toEqual(['startDate:invalid_date']);
    expect(fields({ startDate: d('2028-01-01') })).toEqual(['startDate:too_far_ahead']);
    expect(fields({ payYear: 1999 })).toEqual(['payYear:year_range']);
  });

  it('rejects impossible amounts, hours and counts', () => {
    expect(fields({ monthlyCash: 0 })).toEqual(['monthlyCash:amount_range']);
    expect(fields({ monthlyCash: -5 })).toEqual(['monthlyCash:amount_range']);
    expect(fields({ weeklyHours: 90 })).toEqual(['weeklyHours:hours_range']);
    expect(fields({ shortestRestHours: 30 })).toEqual(['shortestRestHours:hours_range']);
    expect(fields({ inKindMonthly: -1 })).toEqual(['inKindMonthly:amount_range']);
    expect(fields({ holidays: { days: 400, longestStretch: null, taken: null } })).toEqual([
      'holidays.days:count_range',
    ]);
    expect(
      fields({ extraPays: { count: 1.5, amount: 100, prorated: false, accrual: 'unknown' } }),
    ).toEqual(['extraPays.count:count_range']);
  });

  it('rejects an external worker who lives in', () => {
    expect(fields({ regime: 'hourly_external', hourlyRate: 9.55, liveIn: true })).toEqual([
      'hourlyRate:regime_mismatch',
    ]);
  });

  it('rejects a termination out of order or a time that is not a time', () => {
    const t = (change: Parameters<typeof desistimiento>[0]) =>
      fields({ termination: desistimiento(change) });
    expect(t({ effectiveOn: d('2023-01-01'), noticeGivenOn: null })).toEqual([
      'termination.effectiveOn:before_start',
    ]);
    expect(t({ noticeGivenOn: d('2026-09-30') })).toEqual(['termination.noticeGivenOn:after_end']);
    expect(t({ noticeTime: '25:00' })).toEqual(['termination.noticeTime:invalid_time']);
    expect(t({ noticeTime: '9:00' })).toEqual(['termination.noticeTime:invalid_time']);
    expect(t({ severanceOffered: -1 })).toEqual(['termination.severanceOffered:amount_range']);
  });
});
