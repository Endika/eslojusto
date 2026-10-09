import { compareDates, type CivilDate } from '../date';
import { round2 } from '../money';
import { insurancePhrase } from './calculation';
import { daysBetween, deadlineState, day, finding, monthsBefore } from './deadline';
import type { NormTable } from './norms';
import type { Finding, InsuranceInput } from './types';

// Art. 22.2 LCS: one month's notice from the policyholder; 22.3: two months' notice of any change
// from the insurer.
const NON_RENEWAL_MONTHS = 1;
const CHANGE_NOTICE_MONTHS = 2;
const PERCENT = 100;

// The last day to give notice of not renewing. The notice must reach the insurer by then: whether
// sending it is enough is not settled, so the phrase asks for it to arrive.
export function nonRenewal(input: InsuranceInput, today: CivilDate, norms: NormTable): Finding {
  if (input.renews === false)
    return finding(
      'non_renewal',
      'not_applicable',
      [insurancePhrase('non_renewal.no_extension')],
      ['non_renewal'],
      norms,
    );
  const { day: lastDay, monthEnd } = monthsBefore(input.expiresOn, NON_RENEWAL_MONTHS);
  const state = deadlineState(lastDay, today, {
    open: 'non_renewal.days_left',
    ended: 'non_renewal.ended',
  });
  return finding(
    'non_renewal',
    state.status,
    [
      insurancePhrase('non_renewal.last_day', { day: day(lastDay), expiry: day(input.expiresOn) }),
      ...state.calculation,
      insurancePhrase('non_renewal.arrive_by', { day: day(lastDay) }),
      // A period ending at 00:00 h of the expiry day concludes the day before; the date asked is
      // the one the policy prints, so the earlier reading is left to the person.
      insurancePhrase('non_renewal.midnight'),
      ...(monthEnd ? [insurancePhrase('non_renewal.month_end')] : []),
      ...(input.renews === null ? [insurancePhrase('non_renewal.extension_assumed')] : []),
    ],
    ['non_renewal'],
    norms,
    { lastDay, today },
  );
}

// How far ahead of the end of the period the notice of changes arrived, against art. 22.3, as a
// fact. What a late notice leads to is not said, and neither is whether a premium rise alone is a
// change of the contract: no official source for either has been read.
export function changeNotice(input: InsuranceInput, today: CivilDate, norms: NormTable): Finding {
  const { notice } = input;
  if (notice === null)
    return finding(
      'change_notice',
      'not_entered',
      [insurancePhrase('item.not_entered')],
      ['change_notice'],
      norms,
    );
  const deadline = monthsBefore(input.expiresOn, CHANGE_NOTICE_MONTHS);
  const days = { days: daysBetween(notice.receivedOn, input.expiresOn) };
  const status = compareDates(notice.receivedOn, deadline.day) <= 0 ? 'on_time' : 'late';
  return finding(
    'change_notice',
    status,
    [
      insurancePhrase('change_notice.deadline', { day: day(deadline.day) }),
      insurancePhrase(`change_notice.${status}`, {
        days,
        received: day(notice.receivedOn),
      }),
      ...(deadline.monthEnd ? [insurancePhrase('change_notice.month_end')] : []),
      insurancePhrase('change_notice.any_change'),
      ...(notice.changes === true ? [] : [insurancePhrase('change_notice.premium_only')]),
    ],
    ['change_notice'],
    norms,
    { lastDay: deadline.day, today },
  );
}

// The change in premium, as a fact: no verdict on whether it is high or low.
export function premiumChange(input: InsuranceInput, norms: NormTable): Finding {
  const notice = input.notice;
  if (notice === null || notice.previousPremium === null || notice.newPremium === null)
    return finding('premium', 'not_entered', [insurancePhrase('item.not_entered')], [], norms);
  const difference = round2(notice.newPremium - notice.previousPremium);
  const percent = round2((difference / notice.previousPremium) * PERCENT);
  const vars = {
    previous: { euros: notice.previousPremium },
    next: { euros: notice.newPremium },
    difference: { euros: Math.abs(difference) },
    percent: { percent: Math.abs(percent) },
  };
  if (difference > 0)
    return finding('premium', 'up', [insurancePhrase('premium.up', vars)], [], norms);
  if (difference < 0)
    return finding('premium', 'down', [insurancePhrase('premium.down', vars)], [], norms);
  return finding('premium', 'same', [insurancePhrase('premium.same', vars)], [], norms);
}
