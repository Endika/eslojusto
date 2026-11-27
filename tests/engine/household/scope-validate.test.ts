import { describe, expect, it } from 'vitest';
import { parseDate } from '../../../src/engine/date';
import { scope } from '../../../src/engine/household/scope';
import { minutesOf, validate } from '../../../src/engine/household/validate';
import type { HouseholdInput, HouseholdTermination } from '../../../src/engine/household/types';
import { desistimiento, household, TODAY } from './input';

const d = parseDate;

describe('scope', () => {
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

describe('the limits of what can be typed', () => {
  const codes = (change: Partial<HouseholdInput>, termination?: Partial<HouseholdTermination>) =>
    validate(
      household({
        ...change,
        ...(termination === undefined ? {} : { termination: desistimiento(termination) }),
      }),
      TODAY,
    ).map((e) => `${e.field}:${e.code}`);

  // A review looks at most a year ahead of 2026-10-08.
  it.each<[string, Partial<HouseholdInput>, string[]]>([
    ['a start a year ahead', { startDate: d('2027-10-08') }, []],
    ['the first pay year', { payYear: 2000 }, []],
    ['the pay year after this one', { payYear: 2027 }, []],
    ['an hourly rate of 1.000 €', { hourlyRate: 1000 }, []],
    ['an hourly rate over it', { hourlyRate: 1000.01 }, ['hourlyRate:amount_range']],
    ['pay in kind of a million', { inKindMonthly: 1_000_000 }, []],
    ['pay in kind over it', { inKindMonthly: 1_000_001 }, ['inKindMonthly:amount_range']],
    ['a weekly rest over it', { weeklyRestHours: 169 }, ['weeklyRestHours:hours_range']],
    [
      'an extra payment of nothing',
      { extraPays: { count: 2, amount: 0, prorated: false, accrual: 'unknown' } },
      ['extraPays.amount:amount_range'],
    ],
    [
      'a negative number of holidays',
      { holidays: { days: -1, longestStretch: -1, taken: -1 } },
      [
        'holidays.days:count_range',
        'holidays.longestStretch:count_range',
        'holidays.taken:count_range',
      ],
    ],
  ])('%s', (_name, change, expected) => {
    expect(codes(change)).toEqual(expected);
  });

  it.each<[string, Partial<HouseholdTermination>, string[]]>([
    ['an end on the day of the start', { effectiveOn: d('2024-03-01'), noticeGivenOn: null }, []],
    ['an end a year ahead', { effectiveOn: d('2027-10-08') }, []],
    [
      'an end past a year ahead',
      { effectiveOn: d('2027-10-09') },
      ['termination.effectiveOn:too_far_ahead'],
    ],
    [
      'an end that is not a date',
      { effectiveOn: { y: 2026, m: 2, d: 30 } },
      ['termination.effectiveOn:invalid_date'],
    ],
    ['a notice on the day of the start', { noticeGivenOn: d('2024-03-01') }, []],
    [
      'a notice before the start',
      { noticeGivenOn: d('2024-02-29') },
      ['termination.noticeGivenOn:before_start'],
    ],
    ['a notice on the last day', { noticeGivenOn: d('2026-09-21') }, []],
    [
      'a notice that is not a date',
      { noticeGivenOn: { y: 2026, m: 13, d: 1 } },
      ['termination.noticeGivenOn:invalid_date'],
    ],
    [
      'a pay for the notice below nothing',
      { substitutePaid: -1 },
      ['termination.substitutePaid:amount_range'],
    ],
  ])('%s', (_name, termination, expected) => {
    expect(codes({}, termination)).toEqual(expected);
  });
});

describe('a time of day', () => {
  it.each([
    ['23:59', 1439],
    ['12:60', null],
    ['x12:00', null],
    ['12:00x', null],
  ])('%s is %s minutes', (time, minutes) => {
    expect(minutesOf(time)).toBe(minutes);
  });
});
