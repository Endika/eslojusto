import { phrase } from './calculation';
import { findingsFor, single, type Verdict } from './finding';
import type { NormTable } from './norms';
import type { Assessed, HouseholdInput } from './types';

// Art. 9. These are warnings: they carry no amount and never add to what is owed.
const WEEKLY_HOURS = 40;
const REST_BETWEEN_SHIFTS = 12;
// A live-in worker may rest ten hours, the difference made up within four weeks.
const LIVE_IN_REST = 10;
const WEEKLY_REST = 36;
const HOLIDAY_DAYS = 30;
const HOLIDAY_STRETCH = 15;

// Hours of effective work a week, rest between shifts and weekly rest.
export function assessWorkingTime(input: HouseholdInput, norms: NormTable): readonly Assessed[] {
  const make = findingsFor('working_time');
  const one = (id: Parameters<typeof make>[0], verdict: Verdict) =>
    single(make(id, verdict, norms));
  const out: Assessed[] = [];

  if (input.weeklyHours === null) out.push(one('weekly_40', { status: 'not_entered' }));
  else
    out.push(
      one('weekly_40', {
        status: input.weeklyHours > WEEKLY_HOURS ? 'warning' : 'within_limit',
        calculation: [
          phrase('working_time.weekly_hours', { hours: input.weeklyHours, limit: WEEKLY_HOURS }),
          phrase('working_time.presence_apart'),
        ],
      }),
    );

  const rest = input.shortestRestHours;
  if (rest === null) out.push(one('rest_between_shifts', { status: 'not_entered' }));
  else if (rest >= REST_BETWEEN_SHIFTS)
    out.push(
      one('rest_between_shifts', {
        status: 'within_limit',
        calculation: [phrase('working_time.rest', { hours: rest, limit: REST_BETWEEN_SHIFTS })],
      }),
    );
  else if (input.liveIn && rest >= LIVE_IN_REST) {
    const madeUp = input.restMadeUpWithinFourWeeks;
    out.push(
      one('rest_between_shifts', {
        status: madeUp === true ? 'within_limit' : madeUp === false ? 'warning' : 'review_it',
        calculation: [
          phrase('working_time.rest_live_in', { hours: rest, limit: LIVE_IN_REST }),
          phrase(
            madeUp === true
              ? 'working_time.rest_made_up'
              : madeUp === false
                ? 'working_time.rest_not_made_up'
                : 'working_time.rest_made_up_unknown',
          ),
        ],
        basedOnYourAnswer: true,
      }),
    );
  } else
    out.push(
      one('rest_between_shifts', {
        status: 'warning',
        calculation: [
          phrase(input.liveIn ? 'working_time.rest_below_live_in' : 'working_time.rest_below', {
            hours: rest,
            limit: REST_BETWEEN_SHIFTS,
            liveInLimit: LIVE_IN_REST,
          }),
        ],
      }),
    );

  const weekly = input.weeklyRestHours;
  if (weekly === null) out.push(one('weekly_rest_36', { status: 'not_entered' }));
  else
    out.push(
      one('weekly_rest_36', {
        status: weekly >= WEEKLY_REST ? 'within_limit' : 'warning',
        calculation: [phrase('working_time.weekly_rest', { hours: weekly, limit: WEEKLY_REST })],
      }),
    );
  return out;
}

// Thirty calendar days of holidays a year, one stretch of at least fifteen days.
export function assessHolidays(input: HouseholdInput, norms: NormTable): readonly Assessed[] {
  const make = findingsFor('holidays');
  const one = (id: Parameters<typeof make>[0], verdict: Verdict) =>
    single(make(id, verdict, norms));
  const h = input.holidays;
  if (h === null)
    return [
      one('holidays_30', { status: 'not_entered' }),
      one('holidays_stretch_15', { status: 'not_entered' }),
    ];
  return [
    one('holidays_30', {
      status: h.days >= HOLIDAY_DAYS ? 'within_limit' : 'warning',
      calculation: [phrase('holidays.days', { days: h.days, limit: HOLIDAY_DAYS })],
    }),
    h.longestStretch === null
      ? one('holidays_stretch_15', { status: 'not_entered' })
      : one('holidays_stretch_15', {
          status: h.longestStretch >= HOLIDAY_STRETCH ? 'within_limit' : 'warning',
          calculation: [
            phrase('holidays.stretch', { days: h.longestStretch, limit: HOLIDAY_STRETCH }),
          ],
        }),
  ];
}
