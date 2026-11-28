import { describe, expect, it } from 'vitest';
import { BILLS_NORMS } from '../../../src/engine/bills/data/norms';
import {
  acrossOfficial,
  billFinding,
  compare,
  countedAmount,
  single,
  totalsOf,
  type BillFinding,
  type BillsItemId,
  type BillsStatus,
} from '../../../src/engine/bills/finding';
import type { BillsNormId } from '../../../src/engine/bills/norms';
import type { OfficialFigure } from '../../../src/engine/bills/period';

const finding = (
  status: BillsStatus,
  amount: number | null,
  direction: 'over' | 'under' | null,
  change: Partial<BillFinding> & { id?: BillsItemId } = {},
): BillFinding => ({
  ...billFinding(change.id ?? 'meter', status, [], [], BILLS_NORMS, { amount, direction }),
  ...change,
});

const pending: readonly BillsNormId[] = ['rdl7_2026'];

describe('comparing a billed amount with the figures that may hold', () => {
  it('goes to the first of two equally near, and rounds the difference to the cent', () => {
    expect(compare(5, [4, 6], 0.01).difference).toBe(1);
    expect(compare(5, [6, 4], 0.01).difference).toBe(-1);
    expect(compare(5.004, [4.001], 0.01).difference).toBe(1);
  });
});

describe('what an item counts', () => {
  it.each([
    [
      'a figure resting on a norm not settled',
      finding('paid_over', 2, 'over', { pendingOn: pending }),
      0,
    ],
  ])('%s', (_, f, counted) => {
    expect(countedAmount(single(f))).toBe(counted);
    expect(totalsOf([single(f)]).counted).toBe(counted);
    expect(totalsOf([single(f)]).upTo).toBe(counted);
  });

  it.each([
    [
      'under, on a norm not settled',
      finding('differs_from_official', 2, 'under', { pendingOn: pending }),
      0,
    ],
  ])('what is charged %s counts %s as charged short', (_, f, under) => {
    expect(totalsOf([single(f)]).under).toBe(under);
  });
});

describe('a figure across the values the norms leave open', () => {
  const official = (
    lows: readonly [number, number],
    highs: readonly [number, number],
  ): OfficialFigure => ({
    kind: 'ok',
    byBase: [
      { low: lows[0], high: highs[0] },
      { low: lows[1], high: highs[1] },
    ],
    rows: [],
    deciding: [],
  });
  const assess = (expected: readonly number[]) =>
    finding('paid_over', Math.max(...expected), 'over');

  it.each([])('gives %s as %s', (_, figure, kind) => {
    expect(acrossOfficial(figure, assess).kind).toBe(kind);
  });

  it('names the question and the lower and higher reading', () => {
    expect(acrossOfficial(official([1, 1], [2, 2]), assess)).toMatchObject({
      question: 'official_value',
      readings: [
        { when: 'lower_value', finding: { amount: 1 } },
        { when: 'higher_value', finding: { amount: 2 } },
      ],
    });
  });
});
