import { addDays, compareDates, max, ordinal, type CivilDate } from '../date';
import { creditPhrase, type CreditPhrase } from './calculation';
import { creditFinding, dayOf, single, type CreditItem } from './finding';
import type { NormTable } from './norms';
import type { CreditInput } from './types';

// Art. 28 LCC: fourteen calendar days, the first left out and holidays counted (Código Civil,
// art. 5.1), from the contract or, if later, from the day its terms and information arrive.
const WITHDRAWAL_DAYS = 14;

// Item 4: the last day to withdraw. Sending the notice in a durable medium that day is enough
// (art. 28.2.a). While the terms have not arrived the period has not started.
export function checkWithdrawal(
  input: CreditInput,
  today: CivilDate,
  norms: NormTable,
): CreditItem {
  const rules = ['withdrawal', 'period_count'] as const;
  if (input.infoReceived === false)
    return single(
      creditFinding(
        'withdrawal',
        'not_started',
        [creditPhrase('withdrawal.not_started'), creditPhrase('withdrawal.effects')],
        rules,
        norms,
      ),
    );
  const received = input.infoReceivedOn;
  const start = received === null ? input.agreedOn : max(input.agreedOn, received);
  const lastDay = addDays(start, WITHDRAWAL_DAYS);
  const open = compareDates(today, lastDay) <= 0;
  const calculation: CreditPhrase[] = [
    creditPhrase(
      compareDates(start, input.agreedOn) === 0 ? 'withdrawal.start' : 'withdrawal.start_on_terms',
      { day: dayOf(start) },
    ),
    open
      ? creditPhrase('withdrawal.days_left', {
          days: { days: ordinal(lastDay) - ordinal(today) },
          day: dayOf(lastDay),
        })
      : creditPhrase('withdrawal.ended', { day: dayOf(lastDay) }),
    // «No lo sé» on the terms: counted from the contract, the earlier end.
    ...(input.infoReceived === null && received === null
      ? [creditPhrase('withdrawal.receipt_unknown')]
      : []),
    creditPhrase('withdrawal.send_by'),
    creditPhrase('withdrawal.effects'),
  ];
  return single(
    creditFinding('withdrawal', open ? 'open' : 'ended', calculation, rules, norms, {
      deadline: { lastDay, today },
    }),
  );
}
