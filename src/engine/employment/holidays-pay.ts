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
// Under the prorated figure by one day or less may be rounding; more is a sure shortfall. The
// thirty days of a full year leave no room for rounding.
const ROUNDING_DAYS = 1;

const finding = findingsFor('holidays_pay');

// A contract of unknown modality may be such a fixed-term one.
const mayPayHolidaysInSalary = (input: EmploymentInput): boolean => {
  const days = agreedDays(input);
  return (
    (isFixedTerm(input.modality) || input.modality === 'unknown') &&
    days !== null &&
    days <= SHORT_TEMPORARY_DAYS
  );
};

// The span a temporary contract prorates over: its whole length when it lasts under a year. Null
// when the thirty days apply whole, as in any open-ended contract; undefined when a contract that
// is not open-ended has no end date.
function proratedSpan(input: EmploymentInput): number | null | undefined {
  if (isOpenEnded(input.modality)) return null;
  const whole = agreedDays(input);
  if (whole === null) return undefined;
  return whole < YEAR_DAYS ? whole : null;
}

// Fewer than thirty calendar days. A contract of a year or more, or open-ended, is entitled to the
// thirty. A shorter one to its prorated part, and a figure above it may be annual or for the
// contract: only the figure that matches the proration reads as covering it.
function belowThirty(
  input: EmploymentInput,
  { days, includedInSalary }: Holidays,
  norms: NormTable,
): Finding {
  const says = phrase('holidays.calendar_days', { days: { days } });
  const span = proratedSpan(input);
  if (span === undefined)
    return finding(
      'holidays_30',
      { status: 'review_it', calculation: [says, phrase('holidays.span_unknown')] },
      norms,
    );
  if (span === null)
    return finding('holidays_30', { status: 'below_minimum', calculation: [says] }, norms);
  const entitled = round2((CALENDAR_MINIMUM * span) / YEAR_DAYS);
  const prorated = phrase('holidays.prorated_entitlement', {
    span: { days: span },
    entitled: { days: entitled },
  });
  if (days < round2(entitled - ROUNDING_DAYS)) {
    // Art. 4.1 lets a short fixed-term contract pay its holidays with the wage instead.
    if (includedInSalary && mayPayHolidaysInSalary(input))
      return finding(
        'holidays_30',
        {
          status: 'review_it',
          calculation: [
            says,
            prorated,
            phrase('holidays.short_temporary_exception', {
              days: { days: SHORT_TEMPORARY_DAYS },
            }),
          ],
        },
        norms,
      );
    return finding(
      'holidays_30',
      { status: 'below_minimum', calculation: [says, prorated] },
      norms,
    );
  }
  const agreed = input.agreement.holidayDays;
  const agreedProrated = agreed === null ? null : round2((agreed * span) / YEAR_DAYS);
  if (
    agreed !== null &&
    agreedProrated !== null &&
    agreedProrated > days &&
    input.modality !== 'unknown'
  )
    return finding(
      'holidays_30',
      {
        status: 'depends_on_agreement',
        calculation: [
          says,
          prorated,
          phrase('holidays.under_your_agreement_prorated', {
            agreed: { days: agreed },
            entitled: { days: agreedProrated },
          }),
        ],
        basedOnYourAnswer: true,
      },
      norms,
    );
  if (days > Math.ceil(entitled))
    return finding(
      'holidays_30',
      {
        status: 'review_it',
        calculation: [says, prorated, phrase('holidays.may_be_annual')],
      },
      norms,
    );
  if (days < entitled)
    return finding('holidays_30', { status: 'review_it', calculation: [says, prorated] }, norms);
  // Only a temporary contract prorates: with the modality unknown it may owe the whole thirty.
  if (input.modality === 'unknown')
    return finding(
      'holidays_30',
      {
        status: 'review_it',
        calculation: [says, prorated, phrase('holidays.prorated_if_temporary')],
      },
      norms,
    );
  return finding('holidays_30', { status: 'within_limit', calculation: [says, prorated] }, norms);
}

// Art. 38.1 ET counts thirty calendar days. Working days have no equivalence in the statute: the
// usual one is shown and the point is to review, unless they cover thirty calendar days anyway.
function holidayDays(input: EmploymentInput, holidays: Holidays, norms: NormTable): Finding {
  const { days, unit, workDaysPerWeek } = holidays;
  // No holidays at all count as zero calendar days in any unit; on a span of a few days even zero
  // stays within rounding of the prorated figure, and is to review.
  if (days === 0) return belowThirty(input, holidays, norms);
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
  if (days < CALENDAR_MINIMUM) return belowThirty(input, holidays, norms);
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
  if (mayPayHolidaysInSalary(input))
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
  norms: NormTable,
): readonly Assessed[] {
  const { holidays } = input;
  const findings: Finding[] =
    holidays === null
      ? [finding('holidays_30', { status: 'not_entered' }, norms)]
      : [
          holidayDays(input, holidays, norms),
          ...(holidays.includedInSalary ? [paidInSalary(input, norms)] : []),
        ];
  return [...findings, extraPays(input, norms)].map(single);
}
