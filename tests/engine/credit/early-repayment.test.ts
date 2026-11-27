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
const check = (change: Partial<EarlyRepayment> = {}, input: Partial<CreditInput> = {}) => {
  const item = checkEarlyRepayment(
    loan({ earlyRepayment: repayment({ interestSettled: null, ...change }), ...input }),
    CREDIT_NORMS,
  );
  if (item === null) throw new Error('expected an early repayment item');
  return item;
};

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

  const workings = [
    {
      key: 'early_repayment.over_a_year',
      vars: { end: { date: '2023-02-15' }, on: { date: '2021-02-15' } },
    },
    {
      key: 'early_repayment.base_principal',
      vars: { base: { euros: 5000 }, rate: { percent: 1 }, cap: { euros: 50 } },
    },
  ];

  it('shows the working and says the lender may charge more only by proving its loss', () => {
    const f = only(check({ compensationCharged: 80 }));
    expect(f.calculation).toStrictEqual([
      ...workings,
      {
        key: 'early_repayment.above_general_cap',
        vars: { charged: { euros: 80 }, over: { euros: 30 } },
      },
      { key: 'early_repayment.losses' },
    ]);
    expect(anchors(f)).toEqual(['early_repayment_cap', 'period_count', 'early_repayment_losses']);
  });

  it('shows the working of a charge within the cap', () => {
    const f = only(check());
    expect(f.calculation).toStrictEqual([
      ...workings,
      { key: 'early_repayment.within_cap', vars: { charged: { euros: 50 } } },
    ]);
    expect(anchors(f)).toEqual(['early_repayment_cap', 'period_count']);
  });

  it('reads a single reading on the capital when no interest was settled', () => {
    for (const interestSettled of [null, 0]) {
      const item = check({ interestSettled });
      expect(item.kind).toBe('single');
      expect(only(item).calculation[1]?.key).toBe('early_repayment.base_principal');
    }
  });

  it('does not call the interest cap in when the interest left equals the general cap', () => {
    const f = only(check({ remainingInterest: 50 }));
    expect(anchors(f)).toEqual(['early_repayment_cap', 'period_count']);
    expect(f.calculation.map((p) => p.key)).not.toContain('early_repayment.interest_cap');
  });

  it('never caps above the interest the schedule had left', () => {
    // 1 % of 5.000 € is 50 €, but only 30 € of interest was left.
    const f = only(check({ remainingInterest: 30, compensationCharged: 50 }));
    expect(f).toMatchObject({ status: 'above_general_cap', amount: 20 });
    expect(anchors(f)).toContain('early_repayment_interest_cap');
  });

  it.each([
    ['a variable rate', 'early_repayment.variable_rate', {}, { rateType: 'variable' as const }],
    [
      'a repayment an insurance pays',
      'early_repayment.paid_by_insurance',
      { paidByInsurance: true },
      {},
    ],
  ])('allows nothing for %s: whatever was charged is over', (_, key, change, input) => {
    const f = only(check(change, input));
    expect(f).toMatchObject({ status: 'charged_without_basis', amount: 50 });
    expect(f.calculation).toStrictEqual([
      { key },
      { key: 'early_repayment.charged_without_basis', vars: { charged: { euros: 50 } } },
    ]);
    expect(anchors(f)).toEqual(['early_repayment_none']);
    const none = only(check({ ...change, compensationCharged: 0 }, input));
    expect(none).toMatchObject({ status: 'nothing_charged', amount: null });
    expect(none.calculation).toStrictEqual([{ key }, { key: 'early_repayment.nothing_charged' }]);
    expect(anchors(none)).toEqual(['early_repayment_none']);
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
    expect(checkEarlyRepayment(loan(), CREDIT_NORMS)).toBeNull();
  });
});

describe("the car dealer's discount", () => {
  it('is left to review with no figure', () => {
    const item = checkDealerDiscount(
      loan({ product: 'car_loan', earlyRepayment: repayment({ discountLost: true }) }),
      CREDIT_NORMS,
    );
    const finding = item && only(item);
    expect(finding).toMatchObject({ id: 'dealer_discount', status: 'review_it', amount: null });
    expect(finding?.calculation).toStrictEqual([{ key: 'dealer_discount.review_it' }]);
    expect(finding && anchors(finding)).toEqual(['contract_mentions', 'early_repayment_cap']);
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

  const single = { premium: 480, single: true, financed: true, required: true };

  it.each([
    [
      'a periodic premium',
      { insurance: { ...single, single: false }, earlyRepayment: repayment() },
    ],
    ['no insurance', { insurance: null, earlyRepayment: repayment() }],
    ['no early repayment', { insurance: single, earlyRepayment: null }],
    [
      'a term of no days',
      { insurance: single, earlyRepayment: repayment({ agreedEndOn: parseDate('2019-02-15') }) },
    ],
    [
      'an end before the loan was drawn',
      { insurance: single, earlyRepayment: repayment({ agreedEndOn: parseDate('2019-02-14') }) },
    ],
  ])('has nothing to share for %s', (_, change) => {
    expect(unusedPremiumGuide(loan(change))).toBeNull();
  });
});
