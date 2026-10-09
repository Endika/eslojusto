import { round2 } from '../money';
import { billsPhrase, type BillsPhrase } from './calculation';
import { sum } from './electricity-arithmetic';
import { periodOf } from './electricity-tolls';
import {
  billFinding,
  LINE_TOLERANCE,
  pendingOfficial,
  single,
  type BillFinding,
  type BillItem,
} from './finding';
import type { NormTable } from './norms';
import { prorated, rowsCited, spanOf } from './period';
import type { BillsRuleId } from './rules';
import type { BillsTables } from './tables';
import { kwhBilled } from './tax';
import type { ElectricityBillInput, EnergyLine } from './types';

export interface SocialBonusDeps {
  readonly norms: NormTable;
  readonly tables: Pick<BillsTables, 'socialBonusDiscount' | 'socialBonusCaps'>;
}

const RULES: readonly BillsRuleId[] = ['social_bonus_discount', 'social_bonus_cap'];

// The value of the cheapest `kwh` of the bill: the least the capped energy can be worth.
function cheapestValue(lines: readonly EnergyLine[], kwh: number): number {
  let left = kwh;
  let value = 0;
  for (const line of [...lines].sort((a, b) => a.price - b.price)) {
    const taken = Math.min(left, line.kwh);
    value += taken * line.price;
    left -= taken;
  }
  return value;
}

// The social bonus on the PVPC of a reference retailer: its discount over power and energy, with
// the energy up to the kWh of annex I shared out by day and never past what is left of the year.
// Only what every reading gives is checked: the smallest cap of annex I (the household is not
// known), the year of 366 days, the cheapest kWh, and the funding left out of what is discounted.
// A discount under that is short; anything over it matches.
export function checkSocialBonus(
  input: ElectricityBillInput,
  { norms, tables }: SocialBonusDeps,
): BillItem | null {
  const bonus = input.socialBonus;
  if (bonus === null) return null;
  const finding = (
    status: BillFinding['status'],
    calculation: readonly BillsPhrase[],
    parts: Parameters<typeof billFinding>[5] = {},
  ) => single(billFinding('social_bonus', status, calculation, RULES, norms, parts));
  if (input.market === 'free' || input.retailer !== 'reference')
    return finding('review_it', [billsPhrase('bonus.free_market')]);
  const category = bonus.category;
  if (category === null) return finding('not_checkable', [billsPhrase('bonus.category_unknown')]);
  if (bonus.kwhSoFar === null)
    return finding('not_checkable', [billsPhrase('bonus.kwh_so_far_unknown')]);

  const period = periodOf(input);
  const discounts = spanOf(tables.socialBonusDiscount, period, norms);
  if (discounts.kind === 'missing')
    return pendingOfficial('social_bonus', discounts.day, RULES, norms);
  const caps = spanOf(tables.socialBonusCaps, period, norms);
  if (caps.kind === 'missing') return pendingOfficial('social_bonus', caps.day, RULES, norms);
  const rows = [...rowsCited(discounts.stretches, norms), ...rowsCited(caps.stretches, norms)];
  if (discounts.deciding.length + caps.deciding.length > 0)
    return finding('not_checkable', [billsPhrase('official.pending')], { rows });

  const percent = Math.min(
    ...discounts.stretches.flatMap((s) => s.rows.map((r) => r.value[category])),
  );
  const smallest = (row: readonly number[]) => Math.min(...row);
  const yearCap = Math.min(...caps.stretches.flatMap((s) => s.rows.map((r) => smallest(r.value))));
  const periodCap = Math.min(
    prorated(caps.stretches, smallest, 365).low,
    prorated(caps.stretches, smallest, 'actual').low,
  );
  const kwh = kwhBilled(input);
  const capped = Math.max(0, Math.min(kwh, periodCap, yearCap - bonus.kwhSoFar));
  const power = sum(input.power.map((l) => l.amount));
  const lowest = round2((percent / 100) * (power + cheapestValue(input.energy, capped)));

  const calculation = [
    billsPhrase('bonus.cap', { kwh: { kwh: round2(capped) } }),
    ...(bonus.discountedKwh === null
      ? []
      : [billsPhrase('bonus.discounted_kwh', { kwh: { kwh: bonus.discountedKwh } })]),
    billsPhrase('bonus.lowest', { percent: { percent }, euros: { euros: lowest } }),
    billsPhrase('arithmetic.billed', { euros: { euros: bonus.amount } }),
    billsPhrase('tolerance.line'),
  ];
  const short = round2(lowest - bonus.amount);
  if (short <= LINE_TOLERANCE + 1e-9) return finding('matches', calculation, { rows });
  return finding('discount_lower', calculation, {
    rows,
    amount: short,
    direction: 'over',
    recurring: true,
  });
}
