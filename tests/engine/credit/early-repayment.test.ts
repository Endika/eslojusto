import { describe, expect, it } from 'vitest';
import { parseDate } from '../../../src/engine/date';
import { CREDIT_NORMS } from '../../../src/engine/credit/data/norms';
import {
  checkDealerDiscount,
  checkEarlyRepayment,
  overAYearLeft,
  unusedPremiumGuide,
} from '../../../src/engine/credit/early-repayment';
import type { CreditFinding, CreditItem } from '../../../src/engine/credit/finding';
import type { CreditInput, EarlyRepayment } from '../../../src/engine/credit/types';
import { loan, repayment } from './input';

const only = (item: CreditItem): CreditFinding => {
  if (item.kind !== 'single') throw new Error('expected a single reading');
  return item.finding;
};

// No interest settled that day, so a single reading on the capital.
const check = (change: Partial<EarlyRepayment> = {}, input: Partial<CreditInput> = {}) =>
  checkEarlyRepayment(
    loan({ earlyRepayment: repayment({ interestSettled: null, ...change }), ...input }),
    CREDIT_NORMS,
  );

const anchors = (f: CreditFinding) => f.sources.map((s) => s.id);

describe('a year left, date to date', () => {
  it.each([
    ['2022-02-15', false],
    ['2022-02-16', true],
  ])('from 15-02-2021 to %s is over a year: %s', (end, over) => {
    expect(overAYearLeft({ on: parseDate('2021-02-15'), agreedEndOn: parseDate(end) })).toBe(over);
  });

  it('runs a repayment on 29-02 to the 28-02 of the next year', () => {
    const on = parseDate('2024-02-29');
    expect(overAYearLeft({ on, agreedEndOn: parseDate('2025-02-28') })).toBe(false);
    expect(overAYearLeft({ on, agreedEndOn: parseDate('2025-03-01') })).toBe(true);
  });
});

describe('item 3: compensation for an early repayment', () => {
  it('caps it at 0,5 % with exactly 12 months left', () => {
    // 5.000 € repaid on 15-02-2022, end on 15-02-2023: 25 €; 50 € charged is 25 € over.
    const f = only(check({ on: parseDate('2022-02-15') }));
    expect(f).toMatchObject({ status: 'above_general_cap', amount: 25 });
    expect(f.calculation[0]?.key).toBe('early_repayment.up_to_a_year');
  });

  it('caps it at 1 % with 12 months and a day left', () => {
    const f = only(check({ on: parseDate('2022-02-14') }));
    expect(f).toMatchObject({ status: 'within_cap', amount: null });
    expect(f.calculation[0]?.key).toBe('early_repayment.over_a_year');
    expect(only(check({ on: parseDate('2022-02-14'), compensationCharged: 50.01 }))).toMatchObject({
      status: 'above_general_cap',
      amount: 0.01,
    });
  });

  it('says the lender may charge more only by proving its loss', () => {
    const f = only(check({ compensationCharged: 80 }));
    expect(f.calculation.map((p) => p.key)).toContain('early_repayment.losses');
    expect(anchors(f)).toEqual(['early_repayment_cap', 'period_count', 'early_repayment_losses']);
  });

  it('never caps above the interest the schedule had left', () => {
    // 1 % of 5.000 € is 50 €, but only 30 € of interest was left.
    const f = only(check({ remainingInterest: 30, compensationCharged: 50 }));
    expect(f).toMatchObject({ status: 'above_general_cap', amount: 20 });
    expect(anchors(f)).toContain('early_repayment_interest_cap');
  });

  it.each([
    ['a variable rate', {}, { rateType: 'variable' as const }],
    ['a repayment an insurance pays', { paidByInsurance: true }, {}],
  ])('allows nothing for %s: whatever was charged is over', (_, change, input) => {
    const f = only(check(change, input));
    expect(f).toMatchObject({ status: 'charged_without_basis', amount: 50 });
    expect(anchors(f)).toEqual(['early_repayment_none']);
    expect(only(check({ ...change, compensationCharged: 0 }, input))).toMatchObject({
      status: 'nothing_charged',
      amount: null,
    });
  });

  it('works out the cap on the capital and on capital and interest when the base is in doubt', () => {
    // 1 % of 5.000 € is 50 €, of 5.040 € is 50,40 €: 60 € charged is 9,60 € or 10 € over.
    const item = check({ interestSettled: 40, compensationCharged: 60 });
    expect(item.kind).toBe('readings');
    if (item.kind !== 'readings') return;
    expect(item.question).toBe('repayment_base');
    expect(item.readings.map((r) => [r.when, r.finding.amount])).toEqual([
      ['principal_and_interest', 9.6],
      ['principal_only', 10],
    ]);
  });

  it('says it was not entered without a repayment', () => {
    expect(only(checkEarlyRepayment(loan(), CREDIT_NORMS)).status).toBe('not_entered');
  });
});

describe("the car dealer's discount", () => {
  it('is left to review with no figure', () => {
    const item = checkDealerDiscount(
      loan({ product: 'car_loan', earlyRepayment: repayment({ discountLost: true }) }),
      CREDIT_NORMS,
    );
    expect(item && only(item)).toMatchObject({
      id: 'dealer_discount',
      status: 'review_it',
      amount: null,
    });
    expect(checkDealerDiscount(loan({ earlyRepayment: repayment() }), CREDIT_NORMS)).toBeNull();
  });
});

describe('the unused premium of a linked insurance', () => {
  it('is a straight-line share of the term left, as a guide', () => {
    // 480 € for 15-02-2019 to 15-02-2023 (1.461 days), repaid on 15-02-2021 with 730 days left.
    const input = loan({
      insurance: { premium: 480, single: true, financed: true, required: true },
      earlyRepayment: repayment(),
    });
    expect(unusedPremiumGuide(input)).toBe(239.84);
  });

  it('has nothing to share for a periodic premium', () => {
    const input = loan({
      insurance: { premium: 10, single: false, financed: false, required: true },
      earlyRepayment: repayment(),
    });
    expect(unusedPremiumGuide(input)).toBeNull();
  });
});
