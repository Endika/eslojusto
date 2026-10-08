import { describe, expect, it } from 'vitest';
import { contract, repealedWindow, review, riseAboveIrav, unknownLargeLandlord } from './fixtures';
import { headline, roundToTens, summarise, totalLines, totalShare } from '../../src/rental/summary';

const riseOf = (input: Parameters<typeof review>[0]) => {
  const item = review(input).items.find((i) => i.kind === 'rent_update');
  if (!item) throw new Error('no rise');
  return summarise(item);
};

describe('the free summary', () => {
  it('rounds to tens', () => {
    expect(roundToTens(110.4)).toBe(110);
    expect(roundToTens(345)).toBe(350);
    expect(roundToTens(4.2)).toBe(0);
  });

  it('a rise paid over carries the months it was paid over, added up', () => {
    expect(riseOf(riseAboveIrav)).toEqual({
      kind: 'single',
      verdict: { status: 'paid_over', amount: 110.4 },
    });
    expect(totalLines(review(riseAboveIrav))).toEqual([
      { kind: 'paidOver', total: { counted: 110.4, upTo: 110.4 } },
    ]);
    expect(headline(review(riseAboveIrav))).toBe('found');
  });

  it('«No lo sé» on a large landlord: both readings, only the lower counted', () => {
    const s = riseOf(unknownLargeLandlord);
    expect(s).toMatchObject({
      kind: 'depends',
      reasons: ['large_landlord_unknown'],
      low: { status: 'not_checkable', amount: null },
      high: { status: 'paid_over', amount: 360 },
      counted: 0,
      upTo: 360,
    });
    expect(totalShare(s)).toBe('out');
    expect(headline(review(unknownLargeLandlord))).toBe('only_doubtful');
  });

  it('a repealed window is never counted', () => {
    const s = riseOf(repealedWindow);
    expect(s).toMatchObject({ kind: 'depends', reasons: ['repealed_window'], counted: 0 });
    expect(totalShare(s)).toBe('out');
    expect(review(repealedWindow).totals.paidOver.counted).toBe(0);
  });

  it('says when nothing was entered and when nothing came out', () => {
    expect(headline(review(contract({ deposit: null })))).toBe('nothing_entered');
    expect(headline(review(contract({ advanceMonths: 1 })))).toBe('nothing_found');
  });
});
