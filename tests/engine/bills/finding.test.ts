import { describe, expect, it } from 'vitest';
import { BILLS_NORMS } from '../../../src/engine/bills/data/norms';
import { only } from './input';
import {
  acrossOfficial,
  billFinding,
  compare,
  countedAmount,
  findingsOf,
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

  it('goes to the nearest of the figures, wherever it stands', () => {
    expect(compare(5, [9, 5.5], 0.01).difference).toBe(-0.5);
    expect(compare(5, [5.5, 9], 0.01).difference).toBe(-0.5);
  });

  it('matches within the tolerance and no further', () => {
    expect(compare(5.01, [5], 0.01).matches).toBe(true);
    expect(compare(5.02, [5], 0.01).matches).toBe(false);
    expect(compare(4.99, [5], 0.01).matches).toBe(true);
  });
});

describe('what an item counts', () => {
  it.each([
    ['a status that is counted, over', finding('paid_over', 2, 'over'), 2],
    ['a status that is not counted', finding('differs_from_official', 2, 'over'), 0],
    ['an amount charged under', finding('paid_over', 2, 'under'), 0],
    ['no direction', finding('paid_over', 2, null), 0],
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
    ['over', finding('paid_over', 2, 'over'), 0],
    ['under', finding('differs_from_official', 2, 'under'), 2],
    [
      'under, in the total, which repeats its lines',
      finding('differs_from_official', 2, 'under', { id: 'total' }),
      0,
    ],
    [
      'under, in tolls and charges, which are a breakdown',
      finding('differs_from_official', 2, 'under', { id: 'tolls_and_charges_power' }),
      0,
    ],
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

  it.each([
    ['one value', official([1, 1], [1, 1]), 'single'],
    ['the same values by two bases', official([1, 2], [1, 2]), 'single'],
    ['a low and a high that differ', official([1, 1], [2, 2]), 'readings'],
    ['a low with two values and a high with one', official([1, 2], [3, 3]), 'readings'],
    ['two values that differ at the second', official([1, 2], [1, 3]), 'readings'],
  ])('gives %s as %s', (_, figure, kind) => {
    expect(acrossOfficial(figure, assess).kind).toBe(kind);
  });

  it('adds nothing when no norm is pending', () => {
    const item = acrossOfficial(official([1, 1], [1, 1]), assess);
    expect(only(item).pendingOn).toEqual([]);
    expect(only(item).calculation).toEqual([]);
  });

  it('counts the lowest of the readings, shows up to the highest and charges short the lowest', () => {
    const readings = (a: BillFinding, b: BillFinding) => ({
      kind: 'readings' as const,
      question: 'official_value' as const,
      readings: [
        { when: 'lower_value' as const, finding: a },
        { when: 'higher_value' as const, finding: b },
      ],
    });
    const over = readings(finding('paid_over', 1, 'over'), finding('paid_over', 3, 'over'));
    expect(countedAmount(over)).toBe(1);
    expect(totalsOf([over])).toMatchObject({ counted: 1, upTo: 3 });
    const under = readings(
      finding('differs_from_official', 2, 'under'),
      finding('differs_from_official', 5, 'under'),
    );
    expect(totalsOf([under]).under).toBe(2);
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

  it('marks every reading pending when a norm is not settled', () => {
    const item = acrossOfficial({ ...official([1, 1], [2, 2]), deciding: pending }, assess);
    expect(findingsOf(item).map((f) => f.pendingOn)).toEqual([pending, pending]);
    expect(
      findingsOf(item).every((f) => f.calculation.some((p) => p.key === 'official.pending')),
    ).toBe(true);
  });
});
