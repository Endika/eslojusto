import { calendarDays, compareDates, max, min, type CivilDate } from '../date';
import { round2 } from '../money';
import { CALENDAR_MINIMUM, calendarDaysPer } from '../settlement';
import { phrase } from './calculation';
import { findingsFor, single } from './finding';
import type { NormTable } from './norms';
import { agreedDays, isFixedTerm, isOpenEnded } from './term';
import type { Assessed, EmploymentInput, Finding, Holidays } from './types';

// Art. 4.1 of each year's minimum wage decree: fixed-term contracts of up to 120 days may pay the
// holidays with the daily wage.
const SHORT_TEMPORARY_DAYS = 120;
// Art. 31 ET: two extraordinary payments a year; the agreement may prorate them, so one payment
// alone may come with the other prorated.
const EXTRA_PAYS = 2;
// Holidays accrue over the year: a shorter span is entitled to 30 × days / 365.
const YEAR_DAYS = 365;
// Under the prorated figure by one day or less may be rounding; more is a sure shortfall.
const ROUNDING_DAYS = 1;

const finding = findingsFor('holidays_pay');

const isShortTemporary = (input: EmploymentInput): boolean => {
  const days = agreedDays(input);
  return isFixedTerm(input.modality) && days !== null && days <= SHORT_TEMPORARY_DAYS;
};

// The days the stated holidays may cover: the whole contract when it lasts under a year, otherwise
// its part of the calendar year under review (the current one, or the first or last if the
// contract has not started or has ended). Null when a fixed-term contract has no end date.
function coveredDays(input: EmploymentInput, today: CivilDate): number | null {
  const whole = agreedDays(input);
  if (whole !== null && whole < YEAR_DAYS) return whole;
  if (input.endDate === null && !isOpenEnded(input.modality)) return null;
  const end = input.endDate;
  const year =
    compareDates(input.startDate, today) > 0
      ? input.startDate.y
      : end !== null && compareDates(end, today) < 0
        ? end.y
        : today.y;
  const from = max(input.startDate, { y: year, m: 1, d: 1 });
  const lastOfYear = { y: year, m: 12, d: 31 };
  const to = end === null ? lastOfYear : min(end, lastOfYear);
  return Math.min(YEAR_DAYS, calendarDays(from, to));
}

// Fewer than thirty calendar days, against what the span they cover is entitled to.
function belowThirty(
  input: EmploymentInput,
  days: number,
  today: CivilDate,
  norms: NormTable,
): Finding {
  const says = phrase('holidays.calendar_days', { days: { days } });
  const span = coveredDays(input, today);
  if (span === null)
    return finding(
      'holidays_30',
      { status: 'review_it', calculation: [says, phrase('holidays.span_unknown')] },
      norms,
    );
  const entitled = round2((CALENDAR_MINIMUM * span) / YEAR_DAYS);
  const calculation = [
    says,
    ...(span < YEAR_DAYS
      ? [
          phrase('holidays.prorated_entitlement', {
            span: { days: span },
            entitled: { days: entitled },
          }),
        ]
      : []),
  ];
  const status =
    days >= entitled
      ? 'within_limit'
      : days < entitled - ROUNDING_DAYS
        ? 'below_minimum'
        : 'review_it';
  return finding('holidays_30', { status, calculation }, norms);
}

// Art. 38.1 ET counts thirty calendar days. Working days have no equivalence in the statute: the
// usual one is shown and the point is to review, unless they cover thirty calendar days anyway.
function holidayDays(
  input: EmploymentInput,
  holidays: Holidays,
  today: CivilDate,
  norms: NormTable,
): Finding {
  const { days, unit, workDaysPerWeek } = holidays;
  if (unit === 'working') {
    if (days >= CALENDAR_MINIMUM)
      return finding(
        'holidays_30',
        {
          status: 'within_limit',
          calculation: [phrase('holidays.working_days', { days: { days } })],
        },
        norms,
      );
    return finding(
      'holidays_30',
      {
        status: 'review_it',
        calculation: [
          workDaysPerWeek === null
            ? phrase('holidays.working_days', { days: { days } })
            : phrase('holidays.working_days_equivalent', {
                days: { days },
                week: { integer: workDaysPerWeek },
                calendar: { days: round2(days * calendarDaysPer('working', workDaysPerWeek)) },
              }),
          phrase('holidays.counted_in_calendar_days', { minimum: { days: CALENDAR_MINIMUM } }),
        ],
      },
      norms,
    );
  }
  const says = phrase('holidays.calendar_days', { days: { days } });
  if (days < CALENDAR_MINIMUM) return belowThirty(input, days, today, norms);
  const agreed = input.agreement.holidayDays;
  if (agreed !== null && agreed > days)
    return finding(
      'holidays_30',
      {
        status: 'depends_on_agreement',
        calculation: [says, phrase('holidays.under_your_agreement', { agreed: { days: agreed } })],
        basedOnYourAnswer: true,
      },
      norms,
    );
  return finding('holidays_30', { status: 'within_limit', calculation: [says] }, norms);
}

// Art. 38.1 ET: holidays are «no sustituible por compensación económica» while the contract runs.
function paidInSalary(input: EmploymentInput, norms: NormTable): Finding {
  // Art. 4.1 of the decree allows it only when the holidays do not fall within the contract.
  if (isShortTemporary(input))
    return finding(
      'holidays_not_paid_out',
      {
        status: 'review_it',
        calculation: [
          phrase('holidays.short_temporary_exception', { days: { days: SHORT_TEMPORARY_DAYS } }),
        ],
        alsoCites: ['smi_temporary_120'],
      },
      norms,
    );
  return finding(
    'holidays_not_paid_out',
    {
      status: 'clause_void',
      calculation: [phrase('holidays.included_in_salary')],
    },
    norms,
  );
}

// Art. 31 ET: the amount of each payment and their proration are for the collective agreement.
function extraPays(input: EmploymentInput, norms: NormTable): Finding {
  const pays = input.extraPays;
  if (pays === null) return finding('extra_pays', { status: 'not_entered' }, norms);
  if (pays.prorated)
    return finding(
      'extra_pays',
      {
        status: 'depends_on_agreement',
        calculation: [phrase('extra_pays.prorated_by_agreement')],
      },
      norms,
    );
  const count = phrase('extra_pays.count', { count: { integer: pays.count } });
  if (pays.count === 0)
    return finding('extra_pays', { status: 'below_minimum', calculation: [count] }, norms);
  if (pays.count < EXTRA_PAYS)
    return finding(
      'extra_pays',
      { status: 'review_it', calculation: [count, phrase('extra_pays.one_may_be_prorated')] },
      norms,
    );
  return finding(
    'extra_pays',
    {
      status: 'within_limit',
      calculation: [count, phrase('extra_pays.amount_by_agreement')],
    },
    norms,
  );
}

export function assessHolidaysAndPay(
  input: EmploymentInput,
  today: CivilDate,
  norms: NormTable,
): readonly Assessed[] {
  const { holidays } = input;
  const findings: Finding[] =
    holidays === null
      ? [finding('holidays_30', { status: 'not_entered' }, norms)]
      : [
          holidayDays(input, holidays, today, norms),
          ...(holidays.includedInSalary ? [paidInSalary(input, norms)] : []),
        ];
  return [...findings, extraPays(input, norms)].map(single);
}
