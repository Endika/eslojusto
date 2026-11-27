import { describe, expect, it } from 'vitest';
import { parseDate } from '../../../src/engine/date';
import { CREDIT_NORMS } from '../../../src/engine/credit/data/norms';
import type { CreditFinding, CreditItem } from '../../../src/engine/credit/finding';
import { checkApr, oneDecimal, roundTo } from '../../../src/engine/credit/tae-check';
import type { CreditInput } from '../../../src/engine/credit/types';
import { loan } from './input';

const only = (item: CreditItem): CreditFinding => {
  if (item.kind !== 'single') throw new Error('expected a single reading');
  return item.finding;
};

const check = (change: Partial<CreditInput> = {}) => only(checkApr(loan(change), CREDIT_NORMS));

const keys = (f: CreditFinding) => f.calculation.map((p) => p.key);
const articles = (f: CreditFinding) => f.sources.map((s) => s.url.split('#')[1]);

describe('rounding of annex I, observation d', () => {
  it.each([
    [16.6125, 16.6],
    [12.05, 12.1],
    [12.04999, 12],
    [11.9993, 12],
  ])('%s %% is %s %% to one decimal', (value, expected) => {
    expect(oneDecimal(value)).toBe(expected);
  });

  it('shows two decimals', () => {
    expect(roundTo(16.6125, 2)).toBe(16.61);
    expect(roundTo(10.155416, 2)).toBe(10.16);
  });
});

describe('item 1: the APR against the one the contract states', () => {
  it('finds the stated 12 % lower than the 16,61 % the figures give, with art. 21.4 and no amount', () => {
    const f = check();
    expect(f).toMatchObject({ id: 'apr', status: 'contract_lower', amount: null });
    expect(f.detail).toMatchObject({
      apr: 16.61,
      declared: 12,
      basis: 'normalised_months',
      received: 9_738.75,
      totalPayable: 13_120.8,
      totalCost: 3_382.05,
    });
    expect(f.calculation).toStrictEqual([
      { key: 'apr.recomputed', vars: { apr: { percent: 16.61 } } },
      {
        key: 'apr.contract_lower',
        vars: { apr: { percent: 16.61 }, declared: { percent: 12 } },
      },
      { key: 'apr.one_decimal' },
      { key: 'apr.total_payable', vars: { euros: { euros: 13_120.8 } } },
      { key: 'apr.total_cost', vars: { euros: { euros: 3_382.05 } } },
      { key: 'apr.declared_total', vars: { euros: { euros: 13_120.8 } } },
      { key: 'apr.contribution.opening', vars: { points: { points: 4.61 } } },
    ]);
    expect(articles(f)).toEqual(['a32', 'a21']);
    expect(f.sources.map((s) => s.citation)).toContainEqual(expect.stringContaining('art. 21.4'));
  });

  it('says the opening charge adds 4,6 points', () => {
    const f = check();
    expect(f.detail?.contributions).toEqual([{ cost: { kind: 'charge', index: 0 }, points: 4.61 }]);
    expect(oneDecimal(f.detail?.contributions[0]?.points ?? 0)).toBe(4.6);
    expect(f.calculation).toContainEqual({
      key: 'apr.contribution.opening',
      vars: { points: { points: 4.61 } },
    });
  });

  it('matches when both read the same to one decimal', () => {
    expect(check({ declaredApr: 16.6 }).status).toBe('matches');
    expect(check({ declaredApr: 16.64 }).status).toBe('matches');
    expect(check({ declaredApr: 16.65 }).status).toBe('contract_higher');
    expect(check({ declaredApr: 16.54 }).status).toBe('contract_lower');
  });

  it('leaves a higher stated APR to review: a figure is likely missing on our side', () => {
    const f = check({ declaredApr: 18 });
    expect(f.status).toBe('contract_higher');
    expect(articles(f)).toEqual(['a32']);
  });

  it('points to art. 21.2 when the contract states no APR, with no figure owed', () => {
    const f = check({ declaredApr: null });
    expect(f).toMatchObject({ status: 'contract_missing', amount: null });
    expect(articles(f)).toEqual(['a32', 'a21']);
    expect(check({ declaredApr: null, declaredTotalPayable: null }).calculation).toStrictEqual([
      { key: 'apr.recomputed', vars: { apr: { percent: 16.61 } } },
      { key: 'apr.contract_missing' },
      { key: 'apr.one_decimal' },
      { key: 'apr.total_payable', vars: { euros: { euros: 13_120.8 } } },
      { key: 'apr.total_cost', vars: { euros: { euros: 3_382.05 } } },
      { key: 'apr.contribution.opening', vars: { points: { points: 4.61 } } },
    ]);
  });

  it('says it was not entered without instalments', () => {
    const f = check({ instalments: null });
    expect(f).toMatchObject({ status: 'not_entered', detail: null });
    expect(f.calculation).toStrictEqual([{ key: 'item.not_entered' }]);
    expect(articles(f)).toEqual(['a32']);
  });

  it('gives no figure when the equation has no single root', () => {
    const f = check({ netDisbursed: 0 });
    expect(f).toMatchObject({ status: 'unsolvable', detail: null });
    expect(f.calculation).toStrictEqual([{ key: 'apr.unsolvable' }]);
  });

  it('works out both readings when the person does not know if the insurance was required', () => {
    const item = checkApr(
      loan({ insurance: { premium: 400, single: true, financed: false, required: null } }),
      CREDIT_NORMS,
    );
    expect(item.kind).toBe('readings');
    if (item.kind !== 'readings') return;
    expect(item.question).toBe('insurance_required');
    const [counted, left] = item.readings;
    expect(counted?.when).toBe('insurance_counted');
    expect(left?.when).toBe('insurance_left_out');
    expect(left?.finding.detail?.apr).toBe(16.61);
    expect(counted?.finding.detail?.apr).toBeGreaterThan(16.61);
    expect(counted?.finding.detail?.contributions).toContainEqual(
      expect.objectContaining({ cost: { kind: 'insurance' } }),
    );
  });

  it('counts an insurance only one way when the answer is known', () => {
    const insured = (required: boolean) =>
      checkApr(
        loan({ insurance: { premium: 400, single: true, financed: false, required } }),
        CREDIT_NORMS,
      );
    expect(only(insured(false)).detail?.apr).toBe(16.61);
    expect(only(insured(true)).detail?.apr).toBeGreaterThan(16.61);
    expect(keys(only(insured(false)))).toContain('apr.insurance_left_out');
    expect(keys(only(insured(true)))).toContain('apr.insurance_counted');
    expect(keys(check())).not.toContain('apr.insurance_counted');
  });

  it('tells where an undated balloon falls, and nothing for a dated one or none', () => {
    const item = checkApr(loan({ balloon: { amount: 3_000, dueOn: null } }), CREDIT_NORMS);
    if (item.kind !== 'readings') throw new Error('expected readings');
    expect(
      item.readings.map((r) => keys(r.finding).filter((k) => k.startsWith('apr.balloon'))),
    ).toEqual([['apr.balloon_with_last'], ['apr.balloon_month_after']]);
    const dated = { amount: 3_000, dueOn: parseDate('2023-02-15') };
    expect(keys(check({ balloon: dated })).filter((k) => k.startsWith('apr.balloon'))).toEqual([]);
    expect(keys(check()).filter((k) => k.startsWith('apr.balloon'))).toEqual([]);
  });

  it('works out an unknown insurance in two readings whatever the dated balloon', () => {
    const item = checkApr(
      loan({
        balloon: { amount: 3_000, dueOn: parseDate('2023-02-15') },
        insurance: { premium: 400, single: true, financed: false, required: null },
      }),
      CREDIT_NORMS,
    );
    expect(item).toMatchObject({ kind: 'readings', question: 'insurance_required' });
  });

  it('works out a revolving card on the assumptions in force since 09-02-2013', () => {
    const card = (agreedOn: string) =>
      only(
        checkApr(
          loan({
            product: 'revolving',
            agreedOn: parseDate(agreedOn),
            drawnOn: parseDate(agreedOn),
            instalments: null,
            netDisbursed: null,
            charges: [],
            principal: 1_500,
            declaredApr: 24.29,
            card: {
              limit: 1_500,
              nominalRate: 21.94,
              annualFee: 0,
              minimumPayment: 30,
              balance: 0,
            },
          }),
          CREDIT_NORMS,
        ),
      );
    const f = card('2013-02-09');
    expect(f).toMatchObject({ status: 'matches', detail: { apr: 24.29 } });
    expect(f.calculation[0]).toStrictEqual({
      key: 'apr.revolving_assumption',
      vars: { limit: { euros: 1_500 } },
    });
    expect(f.sources.map((src) => src.id)).toEqual(['tae_formula', 'tae_assumptions']);
    // The earlier wording of part II has not been read: no figure.
    const early = card('2013-02-08');
    expect(early).toMatchObject({ id: 'apr', status: 'review_it', detail: null });
    expect(early.calculation).toStrictEqual([{ key: 'apr.revolving_before_2013' }]);
    expect(early.sources.map((src) => src.id)).toEqual(['tae_formula', 'tae_assumptions']);
  });
});
