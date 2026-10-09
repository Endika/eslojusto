import { round2 } from '../money';
import { billsPhrase, type BillsPhrase } from './calculation';
import { accessPower, periodOf } from './electricity-tolls';
import {
  acrossOfficial,
  billFinding,
  compare,
  directionOf,
  LINE_TOLERANCE,
  pendingOfficial,
  single,
  type BillFinding,
  type BillItem,
  type BillsItemId,
} from './finding';
import type { NormTable } from './norms';
import { addOfficial, proratedOver, type OfficialFigure } from './period';
import type { BillsRuleId } from './rules';
import type { BillsTables } from './tables';
import type { ElectricityBillInput, PowerPeriod } from './types';

export interface PvpcDeps {
  readonly norms: NormTable;
  readonly tables: Pick<BillsTables, 'tolls' | 'charges' | 'pvpcMargin' | 'socialBonusFunding'>;
}

// Art. 5.3 RD 216/2014, in its wording in force from 15-06-2023: the PVPC takes up to 10 kW in
// each period.
export const PVPC_MAX_KW = 10;

const FUNDING_RULES: readonly BillsRuleId[] = [
  'social_bonus_funding_until_june',
  'social_bonus_funding',
];

const billedPower = (input: ElectricityBillInput, period: PowerPeriod): number | null => {
  const lines = input.power.filter((l) => l.period === period);
  return lines.length === 0 ? null : lines.reduce((s, l) => s + l.amount, 0);
};

const billedPhrase = (billed: number): BillsPhrase =>
  billsPhrase('arithmetic.billed', { euros: { euros: billed } });

// Whether the bill may be on the PVPC at all: power, holder and retailer.
export function checkPvpcEligibility(input: ElectricityBillInput, norms: NormTable): BillItem {
  const finding = (status: BillFinding['status'], phrase: BillsPhrase) =>
    single(billFinding('pvpc_eligibility', status, [phrase], ['pvpc_eligibility'], norms));
  const { p1, p2 } = input.contractedPower;
  if (p1 > PVPC_MAX_KW || p2 > PVPC_MAX_KW)
    return finding(
      'tariff_not_allowed',
      billsPhrase('pvpc.power_over_10kw', { p1: { kw: p1 }, p2: { kw: p2 } }),
    );
  if (input.holder === 'other')
    return finding('tariff_not_allowed', billsPhrase('pvpc.holder_not_allowed'));
  if (input.retailer === 'other')
    return finding('review_it', billsPhrase('pvpc.not_reference_retailer'));
  if (input.retailer === 'unknown')
    return finding('not_checkable', billsPhrase('pvpc.retailer_unknown'));
  if (input.holder === null) return finding('not_checkable', billsPhrase('pvpc.holder_unknown'));
  return finding('matches', billsPhrase('pvpc.eligible'));
}

// P1 carries the fixed retail margin, a 2016 figure no 2026 norm confirms: a bill that matches it
// matches, one that does not is sent to review with no figure.
function powerP1(input: ElectricityBillInput, deps: PvpcDeps): BillItem | null {
  const billed = billedPower(input, 'p1');
  if (billed === null) return null;
  const { norms, tables } = deps;
  const rules: readonly BillsRuleId[] = ['tolls', 'charges', 'pvpc_margin'];
  const official = addOfficial(
    accessPower(input, ['p1'], deps),
    proratedOver(tables.pvpcMargin, periodOf(input), norms, (m) => input.contractedPower.p1 * m),
  );
  if (official.kind === 'missing')
    return pendingOfficial('pvpc_power_p1', official.day, rules, norms);
  return acrossOfficial(official, (expected) => {
    const phrases = [
      billsPhrase('pvpc.power_p1', {
        kw: { kw: input.contractedPower.p1 },
        euros: { euros: round2(expected[0] ?? 0) },
      }),
      billedPhrase(billed),
      billsPhrase('pvpc.margin_not_updated'),
    ];
    return compare(billed, expected, LINE_TOLERANCE).matches
      ? billFinding('pvpc_power_p1', 'matches', phrases, rules, norms)
      : billFinding(
          'pvpc_power_p1',
          'review_it',
          [...phrases, billsPhrase('pvpc.margin_differs')],
          rules,
          norms,
        );
  });
}

// A regulated term against its table: charged over is above the regulated price and comes back
// every bill; charged short is shown and never counted.
function regulated(
  id: BillsItemId,
  billed: number,
  official: OfficialFigure,
  phrases: (expected: number) => readonly BillsPhrase[],
  rules: readonly BillsRuleId[],
  norms: NormTable,
): BillItem {
  return acrossOfficial(official, (expected) => {
    const calculation = [...phrases(expected[0] ?? 0), billedPhrase(billed)];
    const { matches, difference } = compare(billed, expected, LINE_TOLERANCE);
    if (matches) return billFinding(id, 'matches', calculation, rules, norms);
    const parts = { amount: Math.abs(difference), direction: directionOf(difference) };
    return difference > 0
      ? billFinding(id, 'above_regulated_price', calculation, rules, norms, {
          ...parts,
          recurring: true,
        })
      : billFinding(id, 'differs_from_official', calculation, rules, norms, parts);
  });
}

// P2 is tolls and charges alone.
function powerP2(input: ElectricityBillInput, deps: PvpcDeps): BillItem | null {
  const billed = billedPower(input, 'p2');
  if (billed === null) return null;
  const rules: readonly BillsRuleId[] = ['tolls', 'charges'];
  const official = accessPower(input, ['p2'], deps);
  if (official.kind === 'missing')
    return pendingOfficial('pvpc_power_p2', official.day, rules, deps.norms);
  return regulated(
    'pvpc_power_p2',
    billed,
    official,
    (expected) => [
      billsPhrase('pvpc.power_p2', {
        kw: { kw: input.contractedPower.p2 },
        euros: { euros: round2(expected) },
      }),
    ],
    rules,
    deps.norms,
  );
}

// In the free market the funding may not come apart; one above the order is sent to review with no
// figure, for no norm read says it must be charged at cost.
function freeMarketFunding(billed: number, official: OfficialFigure, norms: NormTable): BillItem {
  return acrossOfficial(official, (expected) => {
    const calculation = [
      billsPhrase('funding.days', { euros: { euros: round2(expected[0] ?? 0) } }),
      billedPhrase(billed),
    ];
    const above = Math.min(...expected.map((e) => billed - e)) > LINE_TOLERANCE + 1e-9;
    return above
      ? billFinding(
          'social_bonus_funding',
          'review_it',
          [...calculation, billsPhrase('funding.free_market_above')],
          FUNDING_RULES,
          norms,
        )
      : billFinding('social_bonus_funding', 'matches', calculation, FUNDING_RULES, norms);
  });
}

// The funding of the social bonus by day, with each order's figure on its own days. On the PVPC it
// is regulated.
export function checkSocialBonusFunding(
  input: ElectricityBillInput,
  { norms, tables }: PvpcDeps,
): BillItem | null {
  const billed = input.socialBonusFunding;
  if (billed === null && input.market === 'free') return null;
  const official = proratedOver(tables.socialBonusFunding, periodOf(input), norms, (v) => v);
  if (official.kind === 'missing')
    return pendingOfficial('social_bonus_funding', official.day, FUNDING_RULES, norms);
  if (input.market === 'free') return freeMarketFunding(billed ?? 0, official, norms);
  if (billed === null)
    return single(
      billFinding(
        'social_bonus_funding',
        'not_on_bill',
        [billsPhrase('funding.not_on_bill')],
        FUNDING_RULES,
        norms,
        { rows: official.rows },
      ),
    );
  return regulated(
    'social_bonus_funding',
    billed,
    official,
    (expected) => [billsPhrase('funding.days', { euros: { euros: round2(expected) } })],
    FUNDING_RULES,
    norms,
  );
}

// The regulated terms of a PVPC bill: who may take it, its power prices and the social bonus
// funding. A free-market bill gets only its funding, when it comes apart.
export function checkPvpc(input: ElectricityBillInput, deps: PvpcDeps): readonly BillItem[] {
  const funding = checkSocialBonusFunding(input, deps);
  if (input.market === 'free') return funding === null ? [] : [funding];
  return [
    checkPvpcEligibility(input, deps.norms),
    ...[powerP1(input, deps), powerP2(input, deps), funding].filter(
      (item): item is BillItem => item !== null,
    ),
  ];
}
