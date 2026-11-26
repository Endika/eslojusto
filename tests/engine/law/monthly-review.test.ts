import { describe, expect, it } from 'vitest';
import { parseDate } from '../../../src/engine/date';
import type { MinimumWageRow } from '../../../src/engine/law/minimum-wage';
import {
  blocksReview,
  monthlyChecklist,
  type MonthlyReviewDeps,
} from '../../../src/engine/law/monthly-review';
import { norm } from './fixtures';

const wage = (year: number): MinimumWageRow<'x'> => ({
  year,
  norm: 'x',
  url: 'https://www.boe.es/x',
  publishedOn: `${year}-02-01`,
  effectsFrom: `${year}-01-01`,
  effectsUntil: `${year}-12-31`,
  retroactiveVerified: true,
  monthly: 1000,
  daily: 30,
  annual: 14_000,
  temporaryPerDay: 40,
  householdPerHour: 8,
});

const article = {
  norm: 'x',
  block: 'a3',
  apiUrl: 'https://boe.es/api/a3',
  versionInForceSince: '2030-01-01',
  lastAmendedBy: 'BOE-A-2030-9',
} as const;
const matter = { id: 'm1', url: 'https://example.org/m1' } as const;

const deps = (
  reviewedOn: string,
  minimumWage: readonly MinimumWageRow<'x'>[],
): MonthlyReviewDeps<'x', 'm1'> => ({
  norms: { x: norm() },
  review: { x: reviewedOn },
  watch: { articles: [article], matters: [matter] },
  minimumWage,
});

const TODAY = parseDate('2030-06-10');

describe('monthlyChecklist', () => {
  it.each([
    ['2030-05-06', false],
    ['2030-05-05', true],
  ])('a norm read on %s is due: %s', (reviewedOn, due) => {
    const kinds = monthlyChecklist(TODAY, deps(reviewedOn, [wage(2030)])).map((i) => i.kind);
    expect(kinds.includes('norm_review_due')).toBe(due);
  });

  it.each([
    ['published', [wage(2030)], []],
    ['not published yet', [wage(2029)], [{ kind: 'minimum_wage_missing', year: 2030 }]],
    ['not loaded', [wage(2031)], [{ kind: 'minimum_wage_missing', year: 2030 }]],
  ])('the minimum wage of the year is %s', (_, table, missing) => {
    expect(monthlyChecklist(TODAY, deps('2030-06-01', table))).toEqual([
      ...missing,
      { kind: 'article', ...article },
      { kind: 'matter', ...matter },
    ]);
  });

  it('lists what is due first, then the missing decree, the articles and the matters', () => {
    expect(monthlyChecklist(TODAY, deps('2030-01-01', []))).toEqual([
      { kind: 'norm_review_due', norm: 'x', reviewedOn: '2030-01-01', url: norm().url },
      { kind: 'minimum_wage_missing', year: 2030 },
      { kind: 'article', ...article },
      { kind: 'matter', ...matter },
    ]);
  });
});

describe('blocksReview', () => {
  it.each([
    ['norm_review_due', true],
    ['minimum_wage_missing', true],
    ['article', false],
    ['matter', false],
  ])('%s blocks the review: %s', (kind, blocks) => {
    expect(blocksReview({ kind })).toBe(blocks);
  });
});
