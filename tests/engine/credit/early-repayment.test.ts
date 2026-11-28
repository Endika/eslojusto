import { describe, expect, it } from 'vitest';
import { parseDate } from '../../../src/engine/date';
import { CREDIT_NORMS } from '../../../src/engine/credit/data/norms';
import {
  checkDealerDiscount,
  checkEarlyRepayment,
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

describe('item 3: compensation for an early repayment', () => {
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

  it('shows the working of a charge within the cap', () => {
    const f = only(check());
    expect(f.calculation).toStrictEqual([
      ...workings,
      { key: 'early_repayment.within_cap', vars: { charged: { euros: 50 } } },
    ]);
    expect(anchors(f)).toEqual(['early_repayment_cap', 'period_count']);
  });

  it('does not call the interest cap in when the interest left equals the general cap', () => {
    const f = only(check({ remainingInterest: 50 }));
    expect(anchors(f)).toEqual(['early_repayment_cap', 'period_count']);
    expect(f.calculation.map((p) => p.key)).not.toContain('early_repayment.interest_cap');
  });

  it.each([
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
    ['no insurance', { insurance: null, earlyRepayment: repayment() }],

    [
      'a term of no days',
      { insurance: single, earlyRepayment: repayment({ agreedEndOn: parseDate('2019-02-15') }) },
    ],
  ])('has nothing to share for %s', (_, change) => {
    expect(unusedPremiumGuide(loan(change))).toBeNull();
  });
});
