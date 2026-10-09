import { addMonthsClamped, compareDates, ordinal, type CivilDate } from '../date';
import { assessAcross } from '../law/readings';
import { exact, round2 } from '../money';
import { phrase, type HouseholdPhrase } from './calculation';
import { findingsFor, single, type Verdict } from './finding';
import type { NormTable } from './norms';
import { dailyPay } from './salary';
import type { Assessed, Finding, HouseholdInput, ReadingCode } from './types';

// Art. 11.2: twenty days of notice after more than a year of service, seven otherwise.
const LONG_NOTICE = 20;
const SHORT_NOTICE = 7;
// A full-time worker has six paid hours a week to look for work during the notice.
const LEAVE_HOURS = 6;
const FULL_TIME_HOURS = 40;

// More than a year of service on a day: past the day the first year ends (the day before the
// anniversary), the way the final-pay engine counts whole months.
export const overOneYear = (start: CivilDate, on: CivilDate): boolean =>
  compareDates(on, addMonthsClamped(start, 12)) >= 0;

export const requiredNoticeDays = (start: CivilDate, on: CivilDate): number =>
  overOneYear(start, on) ? LONG_NOTICE : SHORT_NOTICE;

// Calendar days of notice given. The count starts the day after the notice and rest days count
// (Código Civil 5.1 and 5.2), so a notice on the 1st with the last day on the 21st gives 20.
export const noticeDaysGiven = (noticeOn: CivilDate, lastDay: CivilDate): number =>
  ordinal(lastDay) - ordinal(noticeOn);

const euros = (n: number) => ({ euros: round2(n) });

// What the notice owes in one reading of the date the service is measured on.
function verdictOf(required: number, given: number, input: HouseholdInput): Verdict {
  const missing = Math.max(0, required - given);
  const calculation: HouseholdPhrase[] = [phrase('notice.days', { required, given, missing })];
  const t = input.termination;
  if (missing === 0)
    return { status: 'within_limit', calculation, alsoCites: ['notice_calendar_days'] };
  const daily = dailyPay(input);
  if (daily === null)
    return {
      status: 'missing_requirement',
      calculation: [...calculation, phrase('notice.salary_unknown')],
      alsoCites: ['notice_calendar_days'],
    };
  const worth = missing * daily;
  const paid = t?.substitutePaid ?? 0;
  const owed = round2(worth - paid);
  calculation.push(
    phrase('notice.substitute', { missing, daily: euros(daily), amount: euros(worth) }),
  );
  if (owed <= 0)
    return {
      status: 'within_limit',
      calculation: [...calculation, phrase('notice.substitute_paid', { paid: euros(paid) })],
      alsoCites: ['notice_calendar_days'],
      basedOnYourAnswer: true,
    };
  return {
    status: 'missing_requirement',
    amount: exact(owed),
    calculation:
      paid > 0
        ? [
            ...calculation,
            phrase('notice.substitute_short', { paid: euros(paid), difference: euros(owed) }),
          ]
        : calculation,
    alsoCites: ['notice_calendar_days'],
    basedOnYourAnswer: true,
  };
}

// The days of notice in the shortest reading, for the checks that need a yes or no.
export function noticeShort(input: HouseholdInput): boolean {
  const t = input.termination;
  if (t === null || t.route !== 'desistimiento' || t.noticeGivenOn === null) return false;
  const given = noticeDaysGiven(t.noticeGivenOn, t.effectiveOn);
  return requiredNoticeDays(input.startDate, t.noticeGivenOn) > given;
}

// Art. 11.2: the notice of a desistimiento, in days from the day after it is given. Whether the
// year is counted at the notice or at the end is not settled, so both are shown when they differ.
export function assessNotice(input: HouseholdInput, norms: NormTable): readonly Assessed[] {
  const t = input.termination;
  if (t === null || t.route !== 'desistimiento') return [];
  const make = findingsFor('notice');
  if (t.noticeGivenOn === null)
    return [single(make('desistimiento_notice', { status: 'not_entered' }, norms))];
  const given = noticeDaysGiven(t.noticeGivenOn, t.effectiveOn);
  const noticeOn = t.noticeGivenOn;
  const finding = (world: ReadingCode<'notice_service_date'>): Finding =>
    make(
      'desistimiento_notice',
      verdictOf(
        requiredNoticeDays(
          input.startDate,
          world === 'measured_at_notice' ? noticeOn : t.effectiveOn,
        ),
        given,
        input,
      ),
      norms,
    );
  const notice = assessAcross(
    'notice_service_date',
    ['measured_at_notice', 'measured_at_termination'],
    finding,
  );
  const leave =
    input.weeklyHours !== null && input.weeklyHours >= FULL_TIME_HOURS && given > 0
      ? [
          single(
            make(
              'desistimiento_leave',
              {
                status: 'information',
                calculation: [phrase('notice.leave', { hours: LEAVE_HOURS })],
              },
              norms,
            ),
          ),
        ]
      : [];
  return [notice, ...leave];
}
