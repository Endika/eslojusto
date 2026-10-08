import { describe, expect, it } from 'vitest';
import { parseDate as f } from '../../src/engine/date';
import { lateInterest } from '../../src/engine/late-interest';
import { exact } from '../../src/engine/money';
import { reviewFinalPay } from '../../src/engine/review';
import type { FinalPayInput, Item, ItemId } from '../../src/engine/types';

const item = (id: ItemId, min: number, max = min): Item => ({
  id,
  direction: 'credit',
  range: { min, max },
  calculation: [],
  dependsOnAgreement: false,
  basedOnYourAnswer: false,
  sources: [],
});

const items = [
  item('pending_salary', 1000, 1100),
  item('extra_pay', 500, 600),
  item('holiday_pay', 800),
  item('severance', 10000),
  item('employer_notice', 400),
];

describe('late-payment interest (art. 29.3 ET)', () => {
  it('is 10 % a year on the salary items’ minimum, over the days since the termination / 365', () => {
    // 1 January to 11 April 2026: 100 days.
    const l = lateInterest(items, f('2026-01-01'), f('2026-04-11'));
    expect(l.base).toBe(1500);
    expect(l.daysLate).toBe(100);
    expect(l.amount).toBe(41.1);
  });

  it('never runs on the severance, the notice or the untaken holidays', () => {
    const others = [
      item('severance', 10000),
      item('employer_notice', 400),
      item('holiday_pay', 800),
    ];
    const l = lateInterest(others, f('2026-01-01'), f('2026-04-11'));
    expect(l.base).toBe(0);
    expect(l.amount).toBe(0);
  });

  it('is nothing on the day of the termination, nor before it', () => {
    expect(lateInterest(items, f('2026-04-11'), f('2026-04-11')).amount).toBe(0);
    const ahead = lateInterest(items, f('2026-05-01'), f('2026-04-11'));
    expect(ahead.daysLate).toBe(0);
    expect(ahead.amount).toBe(0);
    expect(ahead.daysLeft).toBe(385);
  });
});

describe('the year to claim it (art. 59.1 and 59.2 ET)', () => {
  const end = f('2025-10-06');

  it('counts the days left to the same date a year later', () => {
    expect(lateInterest(items, end, f('2026-10-05')).daysLeft).toBe(1);
    const lastDay = lateInterest(items, end, f('2026-10-06'));
    expect(lastDay.daysLeft).toBe(0);
    expect(lastDay.daysLate).toBe(365);
    expect(lastDay.amount).toBe(150);
  });

  it('past the year counts no interest: it may have lapsed', () => {
    const lapsed = lateInterest(items, end, f('2026-10-07'));
    expect(lapsed.daysLeft).toBe(-1);
    expect(lapsed.daysLate).toBe(366);
    expect(lapsed.amount).toBe(0);
  });

  it('a termination on 29 February ends its year on 28 February', () => {
    expect(lateInterest(items, f('2024-02-29'), f('2025-02-28')).daysLeft).toBe(0);
    expect(lateInterest(items, f('2024-02-29'), f('2025-03-01')).daysLeft).toBe(-1);
  });
});

describe('the review asks for it only when the final pay is unpaid', () => {
  const input: FinalPayInput = {
    cause: 'unfair_dismissal',
    startDate: f('2020-01-01'),
    endDate: f('2026-08-31'),
    monthlySalary: 3000,
    extraPayProrated: true,
    extraPayCount: 2,
    extraPayAmount: 0,
    extraPayAccrual: 'unknown',
    holidayUnit: 'calendar',
    annualHolidayDays: 30,
    holidayDaysTaken: 0,
  };
  const interest = (o: Partial<FinalPayInput>) => {
    const r = reviewFinalPay({ ...input, ...o }, {}, f('2026-10-06'));
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    return r.review.lateInterest;
  };

  it('not answered or paid: none', () => {
    expect(interest({})).toBeNull();
    expect(interest({ paid: true })).toBeNull();
  });

  it('unpaid: on the month’s salary only, never on the severance', () => {
    const l = interest({ paid: false });
    // The whole of August, 3,000 €, and 36 days to 6 October.
    expect(l?.base).toBe(3000);
    expect(l?.daysLate).toBe(36);
    expect(l?.amount).toBe(29.59);
    expect(l?.sources.map((s) => s.id)).toEqual(['et29', 'et59']);
  });

  it('with extra pay apart, its accrued share counts too', () => {
    const l = interest({ paid: false, extraPayProrated: false, extraPayAmount: 3000 });
    const r = reviewFinalPay(
      { ...input, paid: false, extraPayProrated: false, extraPayAmount: 3000 },
      {},
      f('2026-10-06'),
    );
    if (!r.ok) throw new Error('invalid input');
    const min = (id: ItemId) => r.review.items.find((p) => p.item.id === id)?.item.range?.min ?? 0;
    expect(min('extra_pay')).toBeGreaterThan(0);
    expect(l?.base).toBe(exact(min('pending_salary') + min('extra_pay')).min);
  });
});
