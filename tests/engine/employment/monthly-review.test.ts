import { describe, expect, it } from 'vitest';
import { parseDate, type CivilDate } from '../../../src/engine/date';
import { MINIMUM_WAGE } from '../../../src/engine/employment/data/minimum-wage';
import { EMPLOYMENT_NORMS, NORM_REVIEW } from '../../../src/engine/employment/data/norms';
import { ARTICLE_WATCH } from '../../../src/engine/employment/data/watch';
import type { MinimumWageRow, MinimumWageTable } from '../../../src/engine/employment/minimum-wage';
import {
  blocksReview,
  monthlyChecklist,
  type ChecklistItem,
  type MonthlyReviewDeps,
} from '../../../src/engine/employment/monthly-review';
import type { NormReview } from '../../../src/engine/employment/norms';

// Run by hand with `EMPLOYMENT_REVIEW=1 npm run employment:review`; with
// `EMPLOYMENT_REVIEW_FETCH=1` as well it asks the BOE open data API for each watched article.
// CI runs only the checks on an injected day.
const LIVE = process.env['EMPLOYMENT_REVIEW'] === '1';
const FETCH = LIVE && process.env['EMPLOYMENT_REVIEW_FETCH'] === '1';

const row2026 = MINIMUM_WAGE.find((r) => r.year === 2026) as MinimumWageRow;
const deps: MonthlyReviewDeps = {
  norms: EMPLOYMENT_NORMS,
  review: NORM_REVIEW,
  watch: ARTICLE_WATCH,
  minimumWage: MINIMUM_WAGE,
};
const reviewedAll = (day: string): NormReview =>
  Object.fromEntries(Object.keys(NORM_REVIEW).map((id) => [id, day])) as NormReview;
const kinds = (items: readonly ChecklistItem[]) => items.map((i) => i.kind);

const describeItem = (item: ChecklistItem): string => {
  switch (item.kind) {
    case 'norm_review_due':
      return `REVIEW ${item.norm}: last read ${item.reviewedOn} — ${item.url}`;
    case 'minimum_wage_missing':
      return `MISSING the ${item.year} minimum wage is not published yet: check the BOE`;
    case 'article':
      return `ARTICLE ${item.norm} ${item.block}: wording in force since ${item.versionInForceSince} (${item.lastAmendedBy}) — ${item.apiUrl}`;
    case 'matter':
      return `WATCH ${item.id} — ${item.url}`;
  }
};

const realToday = (): CivilDate => {
  const now = new Date();
  return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
};

const latestVersion = (xml: string): string | null => {
  const days = [...xml.matchAll(/fecha_vigencia="(\d{4})(\d{2})(\d{2})"/g)].map(
    ([, y, m, d]) => `${y}-${m}-${d}`,
  );
  return days.sort().at(-1) ?? null;
};

describe('monthlyChecklist', () => {
  it('lists every watched article and matter', () => {
    const items = monthlyChecklist(parseDate('2026-10-07'), deps);
    expect(items.filter((i) => i.kind === 'article')).toHaveLength(ARTICLE_WATCH.articles.length);
    expect(
      items.filter((i) => i.kind === 'matter').map((i) => i.kind === 'matter' && i.id),
    ).toEqual([
      'working_week_reduction',
      'digital_time_record',
      'next_minimum_wage',
      'sepe_information_model',
    ]);
    expect(items.some(blocksReview)).toBe(false);
  });

  it('flags the 2027 minimum wage as not published in January 2027', () => {
    const items = monthlyChecklist(parseDate('2027-01-10'), {
      ...deps,
      review: reviewedAll('2027-01-05'),
    });
    expect(items.filter(blocksReview)).toEqual([{ kind: 'minimum_wage_missing', year: 2027 }]);
  });

  it('stops flagging the year once its decree is in the table', () => {
    const with2027: MinimumWageTable = [
      ...MINIMUM_WAGE,
      { ...row2026, year: 2027, effectsFrom: '2027-01-01', effectsUntil: '2027-12-31' },
    ];
    const items = monthlyChecklist(parseDate('2027-01-10'), {
      ...deps,
      review: reviewedAll('2027-01-05'),
      minimumWage: with2027,
    });
    expect(kinds(items)).not.toContain('minimum_wage_missing');
  });

  it('keeps norms read on 07-10-2026 current on 01-11-2026', () => {
    const items = monthlyChecklist(parseDate('2026-11-01'), {
      ...deps,
      review: reviewedAll('2026-10-07'),
    });
    expect(kinds(items)).not.toContain('norm_review_due');
  });

  it('asks to read again a norm last read more than 35 days ago', () => {
    const items = monthlyChecklist(parseDate('2026-11-12'), {
      ...deps,
      review: { ...reviewedAll('2026-11-01'), rd723_2026: '2026-10-07' },
    });
    expect(items.filter(blocksReview)).toEqual([
      {
        kind: 'norm_review_due',
        norm: 'rd723_2026',
        reviewedOn: '2026-10-07',
        url: EMPLOYMENT_NORMS.rd723_2026.url,
      },
    ]);
  });
});

describe.runIf(LIVE)('monthly review of employment norms (by hand)', () => {
  it('has every norm read lately and this year’s minimum wage loaded', () => {
    const items = monthlyChecklist(realToday(), deps);
    console.log(items.map(describeItem).join('\n'));
    expect(items.filter(blocksReview).map(describeItem)).toEqual([]);
  });

  it.runIf(FETCH)(
    'finds each watched article in the wording the rules rest on',
    async () => {
      const changed: string[] = [];
      for (const article of ARTICLE_WATCH.articles) {
        const response = await fetch(article.apiUrl, { headers: { Accept: 'application/xml' } });
        const latest = latestVersion(await response.text());
        if (latest !== article.versionInForceSince)
          changed.push(
            `${article.norm} ${article.block}: ${latest} ≠ ${article.versionInForceSince}`,
          );
      }
      expect(changed).toEqual([]);
    },
    120_000,
  );
});
