import { round2 } from '../money';
import { billsPhrase } from './calculation';
import { billFinding, single, type BillItem } from './finding';
import type { NormTable } from './norms';
import type { BillsRuleId } from './rules';
import type { ElectricityBillInput, Service } from './types';

const UNREQUESTED: readonly BillsRuleId[] = ['additional_services', 'unsolicited_services'];

// Excess power on the 2.0TD tariff: without a maximeter the supply is cut, nothing is charged.
// The circular that says so is not among the norms loaded, so the line is sent to review with its
// figure and never counted.
export function checkExcessPower(input: ElectricityBillInput, norms: NormTable): BillItem | null {
  const excess = input.excessPower;
  if (excess === null || excess.amount <= 0) return null;
  if (excess.maximeter === false)
    return single(
      billFinding('excess_power', 'review_it', [billsPhrase('excess.no_maximeter')], [], norms, {
        amount: round2(excess.amount),
        direction: 'over',
      }),
    );
  return single(
    billFinding(
      'excess_power',
      'not_checkable',
      [billsPhrase(excess.maximeter ? 'excess.maximeter' : 'excess.maximeter_unknown')],
      [],
      norms,
    ),
  );
}

function service(input: ElectricityBillInput, s: Service, line: number, norms: NormTable) {
  const parts = { line, amount: round2(s.amount), direction: 'over' as const, recurring: true };
  if (input.market === 'pvpc')
    return billFinding(
      'service',
      'not_allowed_in_pvpc',
      [billsPhrase('service.pvpc')],
      ['services_pvpc'],
      norms,
      parts,
    );
  if (s.requested === 'yes')
    return billFinding(
      'service',
      'information',
      [billsPhrase('service.requested')],
      ['additional_services'],
      norms,
      { line, amount: round2(s.amount) },
    );
  if (s.requested === 'no')
    return billFinding(
      'service',
      'paid_over',
      [billsPhrase('service.not_requested')],
      UNREQUESTED,
      norms,
      parts,
    );
  return billFinding(
    'service',
    'review_it',
    [billsPhrase('service.requested_unknown')],
    UNREQUESTED,
    norms,
    parts,
  );
}

// Anything besides the supply: never on a PVPC bill; in the free market, counted only when the
// person says they did not ask for it, and sent to review when they do not know.
export function checkServices(input: ElectricityBillInput, norms: NormTable): readonly BillItem[] {
  return input.services.flatMap((s, i) =>
    s.amount > 0 ? [single(service(input, s, i, norms))] : [],
  );
}
