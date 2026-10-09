import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BILLS_NORMS } from '../../../src/engine/bills/data/norms';
import { BILLS_TABLES } from '../../../src/engine/bills/data/tables';
import { checkArithmetic } from '../../../src/engine/bills/electricity-arithmetic';
import { checkMeter } from '../../../src/engine/bills/electricity-meter';
import { checkPvpc } from '../../../src/engine/bills/electricity-pvpc';
import { checkTollsAndCharges } from '../../../src/engine/bills/electricity-tolls';
import { countedAmount, findingsOf, type BillItem } from '../../../src/engine/bills/finding';
import { activeRules, RULES, ruleSource } from '../../../src/engine/bills/rules';
import type { ElectricityBillInput } from '../../../src/engine/bills/types';
import { parseDate } from '../../../src/engine/date';
import { freeBill, juneBill } from './input';

const deps = { norms: BILLS_NORMS, tables: BILLS_TABLES };

// Block ids of the consolidated texts as the BOE open data index gives them, only the cited ones.
interface BoeIndex {
  readonly norms: Readonly<
    Record<string, { readonly whole: boolean; readonly blocks: Readonly<Record<string, string>> }>
  >;
}
const BOE_INDEX = JSON.parse(
  readFileSync(new URL('./fixtures/boe-index.json', import.meta.url), 'utf8'),
) as BoeIndex;

// Anchors taken over from the table rows before the index was read for this section.
const UNREAD_ANCHORS = ['BOE-A-2016-12274#ai-2', 'BOE-A-2013-8561#dt'];

const everyCheck = (input: ElectricityBillInput): readonly BillItem[] => [
  ...checkArithmetic(input, BILLS_NORMS),
  ...checkTollsAndCharges(input, deps),
  ...checkPvpc(input, deps),
  ...[checkMeter(input, deps)].filter((item): item is BillItem => item !== null),
];

describe('the bills rules', () => {
  it.each(Object.values(RULES).map((r) => [r.id, r] as const))(
    '%s links into its own norm',
    (_, rule) => {
      expect(rule.url.startsWith(BILLS_NORMS[rule.norm].url)).toBe(true);
      expect(rule.from >= BILLS_NORMS[rule.norm].inForceSince).toBe(true);
    },
  );

  const anchored = Object.values(RULES).filter(
    (r) => r.url.includes('/buscar/act.php') && r.url.includes('#'),
  );
  const blockOf = (url: string) => url.split('id=')[1] ?? '';

  it('take over only the row anchors not yet read in the index', () => {
    expect(
      anchored.map((r) => blockOf(r.url)).filter((block) => UNREAD_ANCHORS.includes(block)),
    ).toEqual(UNREAD_ANCHORS);
  });

  it.each(
    anchored.filter((r) => !UNREAD_ANCHORS.includes(blockOf(r.url))).map((r) => [r.id, r] as const),
  )('%s links to the block of the BOE index headed by its article', (_, rule) => {
    const [boeId = '', anchor = ''] = blockOf(rule.url).split('#');
    const number = /art\. (\d+)/.exec(rule.article)?.[1];
    expect(BOE_INDEX.norms[boeId]?.blocks[anchor], `${boeId}#${anchor}`).toBe(`Artículo ${number}`);
  });

  it('only the billing rules open on a whole consolidated text, whose block is not read', () => {
    expect(
      Object.values(RULES)
        .filter((r) => r.url.includes('/buscar/act.php') && !r.url.includes('#'))
        .map((r) => r.id),
    ).toEqual(['billing']);
  });

  it('give a source with the norm status', () => {
    expect(ruleSource('pvpc_eligibility', BILLS_NORMS)).toMatchObject({
      id: 'pvpc_eligibility',
      citation: `Real Decreto 216/2014, art. 5.3 (${BILLS_NORMS.rd216_2014.citation})`,
      status: 'in_force',
    });
  });

  it('switch the social bonus funding order on 26-06-2026', () => {
    const funding = (day: string) =>
      activeRules(parseDate(day), BILLS_NORMS)
        .map((a) => a.rule.id)
        .filter((id) => id.startsWith('social_bonus_funding'));
    expect(funding('2026-06-25')).toEqual(['social_bonus_funding_until_june']);
    expect(funding('2026-06-26')).toEqual(['social_bonus_funding']);
  });

  it('leave the 2016 margin as information, never an amount', () => {
    expect(RULES.pvpc_margin.output).toBe('info');
  });
});

describe('a bill that matches', () => {
  it.each([
    ['PVPC', juneBill()],
    ['free market', freeBill({ total: 60.77 - 11.92 + 15.18 })],
  ])('%s gives no difference on any line', (_, input) => {
    const findings = everyCheck(input).flatMap(findingsOf);
    expect(findings.filter((f) => f.status !== 'matches').map((f) => f.id)).toEqual([]);
    expect(findings.every((f) => f.amount === null)).toBe(true);
    expect(everyCheck(input).map(countedAmount)).toEqual(everyCheck(input).map(() => 0));
  });
});
