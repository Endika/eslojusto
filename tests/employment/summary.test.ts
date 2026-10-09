import { describe, expect, it } from 'vitest';
import { parseDate as f } from '../../src/engine/date';
import {
  amountOf,
  figureOf,
  headline,
  shortfallOf,
  shownOne,
  shownPair,
  sinceOf,
} from '../../src/employment/summary';
import { finding } from '../engine/employment/input';
import { belowMinimum, contract, review, shortDayRate, workOrService } from './fixtures';

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

  it('heads the summary as the engine opens the pass: missing information is only to review', () => {
    const r = review(
      contract({
        startDate: f('2026-01-01'),
        signedOn: null,
        schedule: null,
        info: Object.fromEntries(
          'abcdefghijklmnopq'.split('').map((e) => [e, e === 'o' ? 'absent' : 'present']),
        ) as never,
      }),
    );
    expect(r.offerPass).toBe(false);
    expect(headline(r)).toBe('to_review');
  });

  it('adds up the years compared from the first one, and not when a year is left out', () => {
    const smi = (input: Parameters<typeof review>[0]) => {
      const a = review(input).items[0];
      if (a?.kind !== 'single') throw new Error('expected a single finding');
      return a.finding;
    };
    expect(sinceOf(smi(belowMinimum))).toEqual({ from: 2026, amount: 765.24 });
    // 2021 and 2022 are before the table: the total would not cover them.
    expect(sinceOf(smi({ ...belowMinimum, startDate: f('2021-06-01') }))).toBeNull();
    // Signed in 2023 at 1.000 € × 14: only 2023 is added up, the later years are to check.
    const signed2023 = smi({
      ...belowMinimum,
      startDate: f('2023-03-01'),
      signedOn: f('2023-03-01'),
      salary: { ...belowMinimum.salary, amount: 1000 },
    });
    expect(signed2023.calculation.map((p) => p.key)).toContain(
      'minimum_wage.year.salary_may_have_risen',
    );
    expect(sinceOf(signed2023)).toBeNull();
  });

  it('reads a short day-rate shortfall per working day', () => {
    const r = review(shortDayRate);
    const smi = r.items[0];
    if (smi?.kind !== 'single') throw new Error('expected a single finding');
    expect(figureOf(smi.finding)).toEqual({ per: 'day', amount: 7.82 });
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
