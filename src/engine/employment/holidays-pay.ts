import { round2 } from '../money';
import { CALENDAR_MINIMUM, calendarDaysPer } from '../settlement';
import { phrase } from './calculation';
import { findingOf, single, type Verdict } from './finding';
import type { NormTable } from './norms';
import type { EmploymentRuleId } from './rules';
import { agreedDays, isFixedTerm } from './term';
import type { Assessed, EmploymentInput, Finding, Holidays } from './types';

// Art. 4.1 of each year's minimum wage decree: fixed-term contracts of up to 120 days may pay the
// holidays with the daily wage.
const SHORT_TEMPORARY_DAYS = 120;
// Art. 31 ET: two extraordinary payments a year.
const EXTRA_PAYS = 2;

const finding = (id: EmploymentRuleId, verdict: Verdict, norms: NormTable): Finding =>
  findingOf(id, 'holidays_pay', norms, verdict);

const isShortTemporary = (input: EmploymentInput): boolean => {
  const days = agreedDays(input);
  return isFixedTerm(input.modality) && days !== null && days <= SHORT_TEMPORARY_DAYS;
};

// Art. 38.1 ET counts thirty calendar days. Working days have no equivalence in the statute: the
// usual one is shown and the point is to review, unless they cover thirty calendar days anyway.
function holidayDays(input: EmploymentInput, holidays: Holidays, norms: NormTable): Finding {
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
  if (days < CALENDAR_MINIMUM)
    return finding('holidays_30', { status: 'below_minimum', calculation: [says] }, norms);
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
  if (isShortTemporary(input))
    return finding(
      'holidays_not_paid_out',
      {
        status: 'within_limit',
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
  if (pays.count < EXTRA_PAYS)
    return finding('extra_pays', { status: 'below_minimum', calculation: [count] }, norms);
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
