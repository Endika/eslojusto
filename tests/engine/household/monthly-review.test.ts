import { describe, expect, it } from 'vitest';
import { parseDate } from '../../../src/engine/date';
import { MINIMUM_WAGE } from '../../../src/engine/employment/data/minimum-wage';
import { HOUSEHOLD_NORMS, NORM_REVIEW } from '../../../src/engine/household/data/norms';
import { ARTICLE_WATCH } from '../../../src/engine/household/data/watch';
import {
  blocksReview,
  monthlyChecklist,
  type MonthlyReviewDeps,
} from '../../../src/engine/household/monthly-review';
import type { NormReview } from '../../../src/engine/household/norms';

const deps: MonthlyReviewDeps = {
  norms: HOUSEHOLD_NORMS,
  review: NORM_REVIEW,
  watch: ARTICLE_WATCH,
  minimumWage: MINIMUM_WAGE,
};
const reviewedAll = (day: string): NormReview =>
  Object.fromEntries(Object.keys(NORM_REVIEW).map((id) => [id, day])) as NormReview;

describe('household monthlyChecklist', () => {
  it('lists the three watched articles and the next minimum wage', () => {
    const items = monthlyChecklist(parseDate('2026-10-09'), deps);
    expect(
      items.filter((i) => i.kind === 'article').map((i) => i.kind === 'article' && i.block),
    ).toEqual(['a8', 'a9', 'a11']);
    expect(
      items.filter((i) => i.kind === 'matter').map((i) => i.kind === 'matter' && i.id),
    ).toEqual(['next_minimum_wage']);
    expect(items.some(blocksReview)).toBe(false);
  });

  it('flags the 2027 minimum wage as not published in January 2027', () => {
    const items = monthlyChecklist(parseDate('2027-01-10'), {
      ...deps,
      review: reviewedAll('2027-01-05'),
    });
    expect(items.filter(blocksReview)).toEqual([{ kind: 'minimum_wage_missing', year: 2027 }]);
  });

  it('asks to read again a norm last read more than 35 days ago', () => {
    const items = monthlyChecklist(parseDate('2026-11-14'), {
      ...deps,
      review: { ...reviewedAll('2026-11-10'), rdl16_2022: '2026-10-09' },
    });
    expect(items.filter(blocksReview)).toEqual([
      {
        kind: 'norm_review_due',
        norm: 'rdl16_2022',
        reviewedOn: '2026-10-09',
        url: HOUSEHOLD_NORMS.rdl16_2022.url,
      },
    ]);
  });
});
