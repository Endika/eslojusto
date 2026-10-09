import { addDays, compareDates, max, type CivilDate } from '../date';
import { insurancePhrase, type InsurancePhrase } from './calculation';
import { day, deadlineState, finding } from './deadline';
import type { NormTable } from './norms';
import { ruleApplies } from './rules';
import type { Finding, InsuranceInput } from './types';

// Art. 10.1 Ley 22/2007: fourteen calendar days, the first day left out (Código Civil, art. 5.1).
const WITHDRAWAL_DAYS = 14;

// The withdrawal period of a home policy, or of a motor policy's voluntary covers, concluded at a
// distance. It runs from the conclusion or, if later, from the day the contract terms and the
// information of art. 7.1 arrive (art. 10.1), which the policy brings.
function withdrawalWindow(
  input: InsuranceInput,
  concludedOn: CivilDate,
  today: CivilDate,
  norms: NormTable,
): Finding {
  if (input.policyReceived === false)
    return finding(
      'distance_withdrawal',
      'not_started',
      [insurancePhrase('withdrawal.not_started')],
      ['distance_withdrawal'],
      norms,
    );
  // The later of the conclusion and the receipt of the terms; without a day of receipt, the
  // conclusion, which gives the earlier end.
  const received = input.policyReceivedOn;
  const start = received === null ? concludedOn : max(concludedOn, received);
  const lastDay = addDays(start, WITHDRAWAL_DAYS);
  const state = deadlineState(lastDay, today, {
    open: 'withdrawal.days_left',
    ended: 'withdrawal.ended',
  });
  const startPhrase: InsurancePhrase =
    compareDates(start, concludedOn) === 0
      ? insurancePhrase('withdrawal.start', { day: day(start) })
      : insurancePhrase('withdrawal.start_on_terms', { day: day(start) });
  return finding(
    'distance_withdrawal',
    state.status,
    [
      startPhrase,
      ...state.calculation,
      ...(received === null ? [insurancePhrase('withdrawal.receipt_unknown')] : []),
    ],
    ['distance_withdrawal'],
    norms,
    { lastDay, today },
  );
}

// Withdrawal from a policy contracted online or by phone. The compulsory motor liability cover is
// excluded by law; whether the voluntary covers of the same policy can be withdrawn from on their
// own has not been settled from a primary source, so they are left to review, with no date.
export function distanceWithdrawal(
  input: InsuranceInput,
  today: CivilDate,
  norms: NormTable,
): readonly Finding[] {
  const id = 'distance_withdrawal';
  if (input.distance === false)
    return [
      finding(
        id,
        'not_applicable',
        [insurancePhrase('withdrawal.not_distance')],
        ['distance_withdrawal'],
        norms,
      ),
    ];
  if (input.distance === null)
    return [
      finding(
        id,
        'review_it',
        [insurancePhrase('withdrawal.channel_unknown')],
        ['distance_withdrawal'],
        norms,
      ),
    ];
  const concludedOn = input.concludedOn;
  if (concludedOn === null)
    return [
      finding(
        id,
        'not_entered',
        [insurancePhrase('item.not_entered')],
        ['distance_withdrawal'],
        norms,
      ),
    ];
  if (!ruleApplies('distance_withdrawal', concludedOn, norms))
    return [
      finding(
        id,
        'not_applicable',
        [insurancePhrase('withdrawal.before_law')],
        ['distance_withdrawal'],
        norms,
      ),
    ];
  // UNVERIFIED: a mortgage requires insuring the home against damage (art. 8 Ley 2/1981, not yet
  // read), so such a policy may meet a duty to insure and be excluded (art. 10.2.b.4.º). Until that
  // article is read it is left to review, with no date.
  if (input.line === 'home' && input.mortgageRequired !== false)
    return [
      finding(
        id,
        'review_it',
        [insurancePhrase('withdrawal.mortgage_unverified')],
        ['distance_withdrawal', 'distance_withdrawal_excluded'],
        norms,
      ),
    ];
  if (input.line !== 'car') return [withdrawalWindow(input, concludedOn, today, norms)];

  const compulsory = finding(
    'distance_withdrawal_compulsory',
    'not_applicable',
    [insurancePhrase('withdrawal.compulsory_excluded')],
    ['distance_withdrawal_excluded'],
    norms,
  );
  if (input.carCover === 'compulsory_only') return [compulsory];
  return [
    compulsory,
    finding(
      'distance_withdrawal_voluntary',
      'review_it',
      [insurancePhrase('withdrawal.voluntary_unverified')],
      ['distance_withdrawal', 'distance_withdrawal_excluded'],
      norms,
    ),
  ];
}
