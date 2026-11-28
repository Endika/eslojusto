import { describe, expect, it } from 'vitest';
import { parseDate as f } from '../../src/engine/date';
import { phrase } from '../../src/engine/calculation';
import { lateInterest } from '../../src/engine/late-interest';
import type { Item, ItemId } from '../../src/engine/types';

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
    expect(l.calculation).toEqual([
      phrase('late_interest', {
        base: { euros: 1500 },
        dias: { integer: 100 },
        importe: { euros: 41.1 },
      }),
      phrase('late_interest.scope'),
    ]);
  });

  it('counts only the salary credits that have a range', () => {
    const l = lateInterest(
      [
        item('pending_salary', 1000),
        { ...item('extra_pay', 500), direction: 'deduction' },
        { ...item('extra_pay', 700), range: null },
      ],
      f('2026-01-01'),
      f('2026-04-11'),
    );
    expect(l.base).toBe(1000);
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
