import { describe, expect, it } from 'vitest';
import type { RentalReview } from '../../src/engine/rental/review';
import { contract, review, riseAboveIrav, unknownLargeLandlord } from './fixtures';
import {
  headline,
  shownBounds,
  shownOne,
  shownUpTo,
  summarise,
  totalLines,
  totalShare,
  type ItemSummary,
} from '../../src/rental/summary';

const riseOf = (input: Parameters<typeof review>[0]) => {
  const item = review(input).items.find((i) => i.kind === 'rent_update');
  if (!item) throw new Error('no rise');
  return summarise(item);
};

describe('the free summary', () => {
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

  it('says when nothing was entered and when nothing came out', () => {
    expect(headline(review(contract({ deposit: null })))).toBe('nothing_entered');
    expect(headline(review(contract({ advanceMonths: 1 })))).toBe('nothing_found');
  });
});

describe('how a doubtful item stands against the totals', () => {
  const depends = (counted: number, upTo: number): ItemSummary => ({
    kind: 'depends',
    reasons: [],
    low: { status: 'within_limit', amount: null },
    high: { status: 'owed', amount: null },
    counted,
    upTo,
  });

  it.each([['all its readings', depends(50, 50), 'in']] as const)('%s', (_, summary, share) => {
    expect(totalShare(summary)).toBe(share);
  });

  it('a single reading is always in, whatever else it carries', () => {
    const odd = {
      kind: 'single',
      verdict: { status: 'owed', amount: 5 },
      counted: 5,
      upTo: 50,
    } as unknown as ItemSummary;
    expect(totalShare(odd)).toBe('in');
  });

  it('a doubtful item with nothing to count is still read by its readings', () => {
    const review = {
      totals: {
        paidOver: { counted: 0, upTo: 0 },
        owed: { counted: 0, upTo: 0 },
        overCap: { counted: 0, upTo: 0 },
      },
      items: [
        {
          kind: 'rent_update',
          outcome: {
            kind: 'depends',
            reasons: [],
            low: { status: 'review_it' },
            high: { status: 'not_entered' },
            readings: [],
          },
        },
      ],
    } as unknown as RentalReview;
    expect(headline(review)).toBe('to_review');
  });
});

describe('approximate amounts', () => {
  it('round to tens alone, but never to «0 €»', () => {
    expect(shownOne(344)).toEqual({ amount: 340, cents: false });
    expect(shownOne(4.1)).toEqual({ amount: 4.1, cents: true });
    expect(shownOne(0)).toEqual({ amount: 0, cents: false });
  });

  it('round a maximum up, never below its true value', () => {
    expect(shownUpTo(64.8)).toEqual({ amount: 70, cents: false });
    expect(shownUpTo(60)).toEqual({ amount: 60, cents: false });
    expect(shownUpTo(10)).toEqual({ amount: 10, cents: false });
    expect(shownUpTo(4.1)).toEqual({ amount: 4.1, cents: true });
    expect(shownUpTo(0)).toEqual({ amount: 0, cents: false });
    expect(shownBounds(12, 64.8)).toEqual([
      { amount: 10, cents: false },
      { amount: 70, cents: false },
    ]);
    expect(shownBounds(17.27, 17.55)).toEqual([
      { amount: 17.27, cents: true },
      { amount: 17.55, cents: true },
    ]);
    for (let high = 10; high < 300; high += 0.37)
      expect(shownUpTo(high).amount).toBeGreaterThanOrEqual(high);
  });
});
