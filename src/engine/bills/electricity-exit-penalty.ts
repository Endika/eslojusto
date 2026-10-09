import { toIso } from '../date';
import { round2 } from '../money';
import { billsPhrase, type BillsPhraseKey } from './calculation';
import { billFinding, single, type BillItem } from './finding';
import type { NormTable } from './norms';
import { RULES as BILLS_RULES, type BillsRuleId } from './rules';
import type { ElectricityBillInput } from './types';

const RULES: readonly BillsRuleId[] = ['exit_penalty'];

// Art. 28.3 RD 88/2026: a natural person on the 2.0TD tariff pays for leaving only on a fixed price
// and before the first renewal, up to 5 % of the energy estimated to be left. Any other penalty is
// not allowed. On a fixed price in its first term the 5 % cannot be checked: the order that sets
// how the energy left is estimated has not been published.
export function checkExitPenalty(input: ElectricityBillInput, norms: NormTable): BillItem | null {
  const penalty = input.exitPenalty;
  if (penalty === null || penalty.amount <= 0) return null;
  const unchecked = (key: BillsPhraseKey) =>
    single(billFinding('exit_penalty', 'not_checkable', [billsPhrase(key)], RULES, norms));
  if (toIso(input.issuedOn) < BILLS_RULES.exit_penalty.from) return unchecked('exit.before_rules');
  if (input.holder !== 'person') return unchecked('exit.not_person');
  if (penalty.priceType === null || penalty.firstRenewalPassed === null)
    return unchecked('exit.terms_unknown');
  const notAllowed = (key: BillsPhraseKey) =>
    single(
      billFinding('exit_penalty', 'not_allowed', [billsPhrase(key)], RULES, norms, {
        amount: round2(penalty.amount),
        direction: 'over',
      }),
    );
  if (penalty.priceType !== 'fixed') return notAllowed('exit.not_fixed');
  if (penalty.firstRenewalPassed) return notAllowed('exit.renewed');
  return unchecked('exit.fixed_first_term');
}
