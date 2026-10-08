import { describe, expect, it } from 'vitest';
import { parseDate as f } from '../../src/engine/date';
import { amountOf, headline, shortfallOf, shownOne, shownPair } from '../../src/employment/summary';
import { finding } from '../engine/employment/input';
import { belowMinimum, contract, review, workOrService } from './fixtures';

describe('the free summary', () => {
  it('rounds one amount to tens, never down to «0 €»', () => {
    expect(shownOne(994)).toEqual({ amount: 990, cents: false });
    expect(shownOne(4.56)).toEqual({ amount: 4.56, cents: true });
  });

  it('keeps two readings apart: a range never reads as one figure', () => {
    expect(shownPair(120, 480)).toEqual([
      { amount: 120, cents: false },
      { amount: 480, cents: false },
    ]);
    expect(shownPair(121, 124)).toEqual([
      { amount: 121, cents: true },
      { amount: 124, cents: true },
    ]);
  });

  it('gives euros only to a shortfall against the minimum wage', () => {
    expect(amountOf(finding({ status: 'below_minimum', amount: { min: 10, max: 12 } }))).toBe(12);
    expect(amountOf(finding({ status: 'over_legal_limit', amount: { min: 10, max: 12 } }))).toBe(
      null,
    );
    expect(amountOf(finding({ status: 'below_minimum', amount: null }))).toBe(null);
  });

  it('takes the yearly shortfall of the last year below the minimum', () => {
    const r = review(belowMinimum);
    const smi = r.items[0];
    expect(smi?.kind).toBe('single');
    if (smi?.kind !== 'single') return;
    expect(shortfallOf(smi.finding)).toEqual({ per: 'year', year: 2026, amount: 994 });
  });

  it('heads the summary by what it found', () => {
    expect(headline(review(belowMinimum))).toBe('found');
    expect(headline(review(workOrService))).toBe('found');
    expect(
      headline(
        review(
          contract({
            startDate: f('2026-01-01'),
            signedOn: null,
            schedule: null,
            trial: { amount: 3, unit: 'months' },
            technical: false,
            smallCompany: null,
          }),
        ),
      ),
    ).toBe('to_review');
    expect(
      headline(
        review(
          contract({
            startDate: f('2026-01-01'),
            signedOn: null,
            schedule: null,
            info: Object.fromEntries(
              'abcdefghijklmnopq'.split('').map((e) => [e, 'present']),
            ) as never,
          }),
        ),
      ),
    ).toBe('nothing_found');
  });
});
