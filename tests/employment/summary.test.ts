import { describe, expect, it } from 'vitest';
import { parseDate as f } from '../../src/engine/date';
import {
  amountOf,
  figureOf,
  headline,
  rangeOf,
  shortfallOf,
  shownOne,
  shownPair,
  sinceOf,
  stateOf,
} from '../../src/employment/summary';
import { phrase, type EmploymentCalculation } from '../../src/engine/employment/calculation';
import type { EmploymentReview } from '../../src/engine/employment/review';
import type { Assessed, Finding, FindingStatus } from '../../src/engine/employment/types';
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

const below = (calculation: EmploymentCalculation, change: Partial<Finding> = {}): Finding =>
  finding({ status: 'below_minimum', amount: { min: 1, max: 5 }, calculation, ...change });
const yearBelow = (year: number, difference: number) =>
  phrase('minimum_wage.year.below', { year: { integer: year }, difference: { euros: difference } });
const dayBelow = (year: number, difference: number) =>
  phrase('minimum_wage.temporary.below', {
    year: { integer: year },
    difference: { euros: difference },
  });
const single = (finding: Finding): Assessed => ({ kind: 'single', finding });
const readings = (...findings: Finding[]) =>
  ({
    kind: 'readings',
    question: 'complement_kind',
    readings: findings.map((finding) => ({ when: 'complement_fixed', finding })),
  }) as unknown as Assessed;

describe('a shortfall as the summary reads it', () => {
  it('has no euros in an amount of nothing', () => {
    expect(amountOf(finding({ status: 'below_minimum', amount: { min: 0, max: 0 } }))).toBeNull();
  });

  it.each([
    [
      'a finding that is not below the minimum',
      finding({ status: 'within_limit', calculation: [yearBelow(2025, 10)] }),
    ],
    [
      'a phrase that is not a shortfall',
      below([
        phrase('minimum_wage.year.within', { year: { integer: 2025 }, difference: { euros: 10 } }),
      ]),
    ],
    [
      'a shortfall with no year',
      below([phrase('minimum_wage.year.below', { difference: { euros: 10 } })]),
    ],
    [
      'a shortfall with no difference',
      below([phrase('minimum_wage.year.below', { year: { integer: 2025 } })]),
    ],
    ['no phrase at all', below([])],
  ])('reads none from %s', (_, f) => {
    expect(shortfallOf(f)).toBeNull();
  });

  it.each([
    ['a year', [yearBelow(2025, 10)], { per: 'year', year: 2025, amount: 10 }],
    ['a working day', [dayBelow(2026, 2.82)], { per: 'day', year: 2026, amount: 2.82 }],
    [
      'the last of two',
      [yearBelow(2024, 10), yearBelow(2025, 20)],
      { per: 'year', year: 2025, amount: 20 },
    ],
    [
      'the last one that has both a year and a difference',
      [yearBelow(2024, 10), phrase('minimum_wage.year.below', { year: { integer: 2025 } })],
      { per: 'year', year: 2024, amount: 10 },
    ],
  ])('reads %s', (_, calculation, expected) => {
    expect(shortfallOf(below(calculation))).toEqual(expected);
  });

  it.each([
    ['with a shortfall, by it', below([yearBelow(2025, 10)]), { per: 'year', amount: 10 }],
    [
      'with none, by the payslips',
      below([], { id: 'smi_monthly' }),
      { per: 'payslips', amount: 5 },
    ],
    ['with none, in total', below([], { id: 'smi_annual' }), { per: 'total', amount: 5 }],
    ['with no amount at all', below([], { amount: null }), null],
  ])('a figure %s', (_, f, expected) => {
    expect(figureOf(f)).toEqual(expected);
  });

  const day = below([dayBelow(2026, 2)]);
  const year = (n: number) => below([yearBelow(2026, n)]);
  it.each([
    ['two readings per year', readings(year(3), year(8)), { per: 'year', low: 3, high: 8 }],
    ['the same amount twice', readings(year(3), year(3)), { per: 'year', low: 3, high: 3 }],
    ['one per year and one per day', readings(year(3), day), null],
    ['one without a shortfall', readings(year(3), finding({ status: 'within_limit' })), null],
    ['none', readings(), null],
    ['a single finding', single(year(3)), null],
  ])('a range from %s', (_, assessed, expected) => {
    expect(rangeOf(assessed)).toEqual(expected);
  });

  const gap = phrase('minimum_wage.not_loaded', { from: { integer: 2023 } });
  it.each([
    ['a year to add up', below([yearBelow(2025, 10)]), { from: 2025, amount: 5 }],
    [
      'years from the first one named',
      below([phrase('minimum_wage.year.within', { year: { integer: 2024 } }), yearBelow(2025, 10)]),
      { from: 2024, amount: 5 },
    ],
    ['a year left out', below([gap, yearBelow(2025, 10)]), null],
    [
      'a shortfall per day',
      below([dayBelow(2026, 2), phrase('minimum_wage.year.within', { year: { integer: 2024 } })]),
      null,
    ],
    ['no amount', below([yearBelow(2025, 10)], { amount: null }), null],
    [
      'a first year with no number',
      below([phrase('minimum_wage.year.within'), yearBelow(2025, 10)]),
      null,
    ],
  ])('since when, with %s', (_, f, expected) => {
    expect(sinceOf(f)).toEqual(expected);
  });
});

describe('the summary’s headline and states', () => {
  const reviewOf = (...statuses: FindingStatus[]) =>
    ({
      offerPass: false,
      items: statuses.map((status) => single(finding({ status }))),
      clauses: [],
      informationDuty: null,
    }) as unknown as EmploymentReview;

  it.each([
    ['below_minimum', 'to_review'],
    ['over_legal_limit', 'to_review'],
    ['clause_void', 'to_review'],
    ['becomes_permanent', 'to_review'],
    ['missing_requirement', 'to_review'],
    ['review_it', 'to_review'],
    ['depends_on_agreement', 'to_review'],
    ['within_limit', 'nothing_found'],
    ['not_entered', 'nothing_entered'],
  ] as const)('a review with only %s reads %s', (status, expected) => {
    expect(headline(reviewOf(status))).toBe(expected);
  });

  it('reads nothing found when some points are not entered and none is wrong', () => {
    expect(headline(reviewOf('not_entered', 'within_limit'))).toBe('nothing_found');
  });

  it('reads found whenever the review offers the pass', () => {
    expect(headline({ ...reviewOf('within_limit'), offerPass: true })).toBe('found');
  });

  it('shows a card the status of its finding, or depends across readings', () => {
    expect(stateOf(single(finding({ status: 'within_limit' })))).toBe('within_limit');
    expect(stateOf(readings(finding(), finding()))).toBe('depends');
  });
});
