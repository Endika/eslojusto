import { describe, expect, it } from 'vitest';
import { parseDate } from '../../../src/engine/date';
import { BE1904 } from '../../../src/engine/credit/data/be1904';
import { CREDIT_NORMS } from '../../../src/engine/credit/data/norms';
import { CREDIT_SOURCES } from '../../../src/engine/credit/data/sources';
import { findingsOf } from '../../../src/engine/credit/finding';
import {
  reviewCredit,
  termMonths,
  UNCHECKED,
  type CreditDeps,
  type CreditReview,
} from '../../../src/engine/credit/review';
import type { CreditInput } from '../../../src/engine/credit/types';
import { loan, repayment, TODAY } from './input';

const DEPS: CreditDeps = { norms: CREDIT_NORMS, sources: CREDIT_SOURCES, rates: BE1904 };

const review = (change: Partial<CreditInput> = {}, deps: CreditDeps = DEPS): CreditReview => {
  const result = reviewCredit(loan(change), TODAY, deps);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.review;
};

const statuses = (r: CreditReview) =>
  r.items.map((item) => findingsOf(item).map((f) => `${f.id}:${f.status}`));

describe('reviewCredit', () => {
  it('reviews the loan of STS 366/2026 end to end', () => {
    const r = review();
    expect(r.scope).toEqual({ inScope: true, indicatorOnly: false });
    expect(statuses(r)).toEqual([
      ['apr:contract_lower'],
      ['early_repayment:not_entered'],
      ['withdrawal:ended'],
    ]);
    expect(r.indicator).toMatchObject({ status: 'distance_only', apr: 12, aprOrigin: 'declared' });
    expect(r.totals).toEqual({ overCharged: { counted: 0, upTo: 0 } });
    expect(r.offerPass).toBe(true);
    expect(r.unchecked).toEqual(UNCHECKED);
  });

  it('compares the APR worked out once the person takes it: 8,51 points', () => {
    const r = review({ confirmedApr: true });
    expect(r.indicator).toMatchObject({ apr: 16.61, aprOrigin: 'recalculated', points: 8.51 });
  });

  it('stops errors before anything is worked out', () => {
    const result = reviewCredit(loan({ principal: 0 }), TODAY, DEPS);
    expect(result.ok).toBe(false);
  });

  it('works nothing out for a credit out of scope', () => {
    const r = review({ secured: 'mortgage' });
    expect(r).toMatchObject({
      scope: { inScope: false, reason: 'mortgage' },
      items: [],
      indicator: null,
      information: [],
      offerPass: false,
    });
  });

  it('gives a revolving card concluded before the law only the indicator', () => {
    const r = review({
      product: 'revolving',
      agreedOn: parseDate('2008-05-10'),
      drawnOn: parseDate('2008-05-10'),
      instalments: null,
      netDisbursed: null,
      charges: [],
      declaredApr: 26.82,
      card: { limit: 3_000, nominalRate: 24, annualFee: 0, minimumPayment: 90, balance: 3_000 },
    });
    expect(r.scope).toEqual({ inScope: true, indicatorOnly: true });
    expect(r.items).toEqual([]);
    expect(r.indicator).toMatchObject({
      status: 'above',
      reference: { kind: 'ruling_2010', value: 19.32 },
      points: 7.5,
    });
    expect(r.information.map((b) => b.id)).toEqual(['card_payoff']);
    expect(r.offerPass).toBe(false);
  });

  it('counts compensation charged over the cap and offers the pass for it', () => {
    const r = review({
      declaredApr: 16.6,
      earlyRepayment: repayment({ on: parseDate('2022-02-15'), interestSettled: null }),
    });
    expect(statuses(r)[0]).toEqual(['apr:matches']);
    expect(r.totals.overCharged).toEqual({ counted: 25, upTo: 25 });
    expect(r.offerPass).toBe(true);
  });

  it('counts the lowest reading when the base of the cap is in doubt', () => {
    const r = review({
      declaredApr: 16.6,
      earlyRepayment: repayment({ interestSettled: 40, compensationCharged: 60 }),
    });
    expect(r.totals.overCharged).toEqual({ counted: 9.6, upTo: 10 });
  });

  it('offers no pass when the APR matches and nothing is charged over a cap', () => {
    expect(review({ declaredApr: 16.6 }).offerPass).toBe(false);
    expect(review({ declaredApr: 18 }).offerPass).toBe(false);
  });

  it('offers no pass for a lower APR that holds in only one reading of the insurance', () => {
    // Without the insurance the figures give 16,61 %; with it, more.
    const r = review({
      declaredApr: 16.6,
      insurance: { premium: 400, single: true, financed: false, required: null },
    });
    expect(statuses(r)[0]).toEqual(['apr:contract_lower', 'apr:matches']);
    expect(r.offerPass).toBe(false);
  });

  it('never lets the indicator open the pass nor reach a total', () => {
    const r = review({ declaredApr: 16.6, confirmedApr: true });
    expect(r.indicator?.points).toBe(8.51);
    const above = review(
      { declaredApr: 16.6, confirmedApr: true },
      {
        ...DEPS,
        sources: {
          ...CREDIT_SOURCES,
          sts366_2026: { ...CREDIT_SOURCES.sts366_2026, verified: true },
        },
      },
    );
    expect(above.indicator?.status).toBe('above');
    expect(above.offerPass).toBe(false);
    expect(above.totals.overCharged.counted).toBe(0);
  });

  it('adds the dealer discount to review when it was taken back', () => {
    const r = review({
      product: 'car_loan',
      earlyRepayment: repayment({ discountLost: true }),
    });
    expect(statuses(r).map((s) => s[0])).toContain('dealer_discount:review_it');
  });

  it('reads the term of a loan in whole months from the drawdown', () => {
    expect(termMonths(loan(), 'balloon_month_after')).toBe(48);
    expect(
      termMonths(
        loan({
          instalments: {
            kind: 'regular',
            count: 60,
            amount: 100,
            frequency: 'monthly',
            firstDueOn: parseDate('2019-04-01'),
          },
        }),
        'balloon_month_after',
      ),
    ).toBe(60);
    const balloon = { amount: 3_000, dueOn: null };
    expect(termMonths(loan({ balloon }), 'balloon_month_after')).toBe(49);
    expect(termMonths(loan({ balloon }), 'balloon_with_last')).toBe(48);
    const dated = { amount: 3_000, dueOn: parseDate('2023-02-15') };
    expect(termMonths(loan({ balloon: dated }), 'balloon_with_last')).toBe(48);
  });

  it('opens the pass on an undated balloon only when both of its days give a lower APR', () => {
    // 20.000 €, 36 × 300 € and 12.000 € at the end: 5,80 % in month 37, 5,91 % in month 36.
    const balloonLoan = (declaredApr: number, dueOn: string | null) =>
      review({
        agreedOn: parseDate('2024-03-01'),
        drawnOn: parseDate('2024-03-01'),
        principal: 20_000,
        netDisbursed: null,
        nominalRate: 7.99,
        declaredApr,
        declaredTotalPayable: null,
        instalments: {
          kind: 'regular',
          count: 36,
          amount: 300,
          frequency: 'monthly',
          firstDueOn: parseDate('2024-04-01'),
        },
        balloon: { amount: 12_000, dueOn: dueOn === null ? null : parseDate(dueOn) },
        charges: [],
      });
    const undated = balloonLoan(5.8, null);
    const [apr] = undated.items;
    expect(apr?.kind).toBe('readings');
    if (apr?.kind !== 'readings') return;
    expect(apr.question).toBe('balloon_due');
    expect(apr.readings.map((r) => [r.when, r.finding.status, r.finding.detail?.apr])).toEqual([
      ['balloon_with_last', 'contract_lower', 5.91],
      ['balloon_month_after', 'matches', 5.8],
    ]);
    expect(undated.offerPass).toBe(false);
    // With its day in the contract, there is one reading.
    expect(statuses(balloonLoan(5.8, '2027-03-01'))[0]).toEqual(['apr:contract_lower']);
    expect(balloonLoan(5.8, '2027-03-01').offerPass).toBe(true);
    expect(balloonLoan(5.8, '2027-04-01').offerPass).toBe(false);
    // Lower in both readings, the pass opens.
    expect(balloonLoan(5.6, null).offerPass).toBe(true);
  });

  it('works out an unknown insurance and an undated balloon in all four worlds', () => {
    const r = review({
      balloon: { amount: 3_000, dueOn: null },
      insurance: { premium: 400, single: true, financed: false, required: null },
    });
    const [apr] = r.items;
    if (apr?.kind !== 'readings') throw new Error('expected readings');
    expect(apr.question).toBe('insurance_required_and_balloon_due');
    expect(apr.readings.map((reading) => reading.when)).toEqual([
      'insurance_counted.balloon_with_last',
      'insurance_counted.balloon_month_after',
      'insurance_left_out.balloon_with_last',
      'insurance_left_out.balloon_month_after',
    ]);
  });

  it('leaves the term unknown when the balloon day decides the series', () => {
    // 12 monthly instalments from a month after the drawdown: 12 months with the last one, 13 a
    // month after it, across the one-year line.
    const r = review({
      instalments: {
        kind: 'regular',
        count: 12,
        amount: 800,
        frequency: 'monthly',
        firstDueOn: parseDate('2019-03-15'),
      },
      balloon: { amount: 1_000, dueOn: null },
    });
    expect(r.indicator?.calculation[0]?.key).toBe('indicator.term_unknown');
  });
});
