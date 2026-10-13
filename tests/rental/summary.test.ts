import { describe, expect, it } from 'vitest';
import { parseDate } from '../../src/engine/date';
import { contract, repealedWindow, review, riseAboveIrav, unknownLargeLandlord } from './fixtures';
import {
  headline,
  roundToTens,
  shownOne,
  shownPair,
  summarise,
  totalLines,
  totalShare,
} from '../../src/rental/summary';

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
    // 9,20 a month from March 2025 to October 2026: 20 months = 184 €.
    expect(riseOf(riseAboveIrav)).toEqual({
      kind: 'single',
      verdict: { status: 'paid_over', amount: 184 },
    });
    expect(totalLines(review(riseAboveIrav))).toEqual([
      { kind: 'paidOver', total: { counted: 184, upTo: 184 } },
    ]);
    expect(headline(review(riseAboveIrav))).toBe('found');
  });

  it('«No lo sé» on a large landlord: both readings, only the lower counted', () => {
    const s = riseOf(unknownLargeLandlord);
    // Over the 2 % IGC, 30 a month from June 2023 to October 2026: 41 months = 1.230 €.
    expect(s).toMatchObject({
      kind: 'depends',
      reasons: ['large_landlord_unknown'],
      low: { status: 'not_checkable', amount: null },
      high: { status: 'paid_over', amount: 1230 },
      counted: 0,
      upTo: 1230,
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

  it('a point left to review is not «nothing over the law»', () => {
    // Community bills of 600 € and 618 € in 2025 against 600 € agreed: left to review.
    const charged = contract({
      signedOn: parseDate('2025-09-15'),
      startDate: parseDate('2025-09-20'),
      updateClause: 'irav',
      charges: [
        {
          kind: 'community',
          inContract: true,
          annualAgreed: 600,
          charged: [
            { year: 2025, amount: 600 },
            { year: 2025, amount: 618 },
          ],
        },
      ],
    });
    expect(headline(review(charged))).toBe('to_review');
  });
});

describe('approximate amounts', () => {
  it('round to tens alone, but never to «0 €»', () => {
    expect(shownOne(344)).toEqual({ amount: 340, cents: false });
    expect(shownOne(4.1)).toEqual({ amount: 4.1, cents: true });
    expect(shownOne(0)).toEqual({ amount: 0, cents: false });
  });

  it('round a pair to tens only while the figures stay apart', () => {
    expect(shownPair(0, 360)).toEqual([
      { amount: 0, cents: false },
      { amount: 360, cents: false },
    ]);
    expect(shownPair(1210, 1260)).toEqual([
      { amount: 1210, cents: false },
      { amount: 1260, cents: false },
    ]);
    expect(shownPair(17.27, 17.55)).toEqual([
      { amount: 17.27, cents: true },
      { amount: 17.55, cents: true },
    ]);
    // Tens would put «al menos» at 20 €, above the 17,55 € the most it can be.
    expect(shownPair(16, 17.55).every((s) => s.cents)).toBe(true);
    expect(shownPair(4, 50).every((s) => s.cents)).toBe(true);
  });

  it('never let the lower figure pass the higher one', () => {
    for (let low = 0; low < 200; low += 0.37)
      for (const high of [low, low + 0.5, low + 4, low + 9, low + 30]) {
        const [a, b] = shownPair(low, high);
        expect(a.amount).toBeLessThanOrEqual(high);
        expect(b.amount).toBeGreaterThanOrEqual(a.amount);
      }
  });
});
