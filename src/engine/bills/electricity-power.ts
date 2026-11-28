import { round2 } from '../money';
import { billsPhrase } from './calculation';
import { perKwYear } from './electricity-official';
import { billFinding, single, type BillItem } from './finding';
import type { NormTable } from './norms';
import type { ElectricityBillInput } from './types';

// The contracted power beside the highest power used in the last 12 months and what a kW of P1
// costs a year: figures with no verdict, and the rule that the power changes once every 12 months.
export function powerUsed(input: ElectricityBillInput, norms: NormTable): BillItem {
  const { p1, p2 } = input.contractedPower;
  const used = input.maxPowerUsed;
  const cost = perKwYear(input, 'p1');
  return single(
    billFinding(
      'power_used',
      'information',
      [
        billsPhrase('power.contracted', { p1: { kw: p1 }, p2: { kw: p2 } }),
        used.p1 === null && used.p2 === null
          ? billsPhrase('power.max_used_unknown')
          : billsPhrase('power.max_used', {
              ...(used.p1 === null ? {} : { p1: { kw: used.p1 } }),
              ...(used.p2 === null ? {} : { p2: { kw: used.p2 } }),
            }),
        ...(cost === null
          ? []
          : [billsPhrase('power.p1_cost_year', { euros: { euros: round2(cost) } })]),
        billsPhrase('power.change_once_a_year'),
      ],
      ['power_change'],
      norms,
    ),
  );
}
