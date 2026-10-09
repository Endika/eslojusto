import { describe, expect, it } from 'vitest';
import { parseDate } from '../../../src/engine/date';
import { BE1904 } from '../../../src/engine/credit/data/be1904';
import { CREDIT_SOURCES } from '../../../src/engine/credit/data/sources';
import {
  averageRateIndicator,
  band,
  cardPayoff,
  comparedApr,
  loanSeries,
  type ComparedApr,
  type IndicatorDeps,
} from '../../../src/engine/credit/indicator';
import type { SourceTable } from '../../../src/engine/credit/norms';
import type { CreditProduct } from '../../../src/engine/credit/types';

const DEPS: IndicatorDeps = { sources: CREDIT_SOURCES, rates: BE1904 };

const declared = (value: number): ComparedApr => ({ value, origin: 'declared' });

const indicate = (
  product: CreditProduct,
  agreedOn: string,
  apr: ComparedApr | null,
  term: number | null = 48,
  deps: IndicatorDeps = DEPS,
  rateType: 'fixed' | 'variable' = 'fixed',
) => averageRateIndicator({ product, agreedOn: parseDate(agreedOn), rateType }, term, apr, deps);

const keys = (i: ReturnType<typeof indicate>) => i.calculation.map((p) => p.key);

// The loan criterion as it will stand once read in its text.
const loanCriterionRead: SourceTable = {
  ...CREDIT_SOURCES,
  sts366_2026: { ...CREDIT_SOURCES.sts366_2026, verified: true },
};

describe('the indicator against the Bank of Spain average rate', () => {
  it('puts the STS 366/2026 loan 8,51 points above the average of February 2019, distance only', () => {
    // 16,61 % against 8,0989 %, consumer loans from one to five years.
    const i = indicate('personal_loan', '2019-02-15', declared(16.61));
    expect(i).toMatchObject({
      status: 'distance_only',
      apr: 16.61,
      aprOrigin: 'declared',
      reference: { kind: 'series', series: 'BE_19_4.10', month: '2019-02', value: 8.0989 },
      points: 8.51,
    });
    expect(keys(i)).toContain('indicator.loan_criterion_unread');
    expect(keys(i)).not.toContain('indicator.above');
    expect(i.sources.map((s) => s.id)).toEqual(['sts366_2026', 'bde_be1904']);
  });

  it('gives a loan its band once the loan criterion is read in its text', () => {
    const deps = { ...DEPS, sources: loanCriterionRead };
    expect(indicate('personal_loan', '2019-02-15', declared(16.61), 48, deps).status).toBe('above');
  });

  it.each([
    [24.29, 'edge', 6.03],
    [24.6, 'above', 6.34],
    [23.9, 'below', 5.64],
  ] as const)(
    'a revolving card of August 2026 at %s %% is %s (%s points)',
    (apr, status, points) => {
      // Revolving average of August 2026: 18,2578 %.
      const i = indicate('revolving', '2026-08-20', declared(apr), null);
      expect(i).toMatchObject({
        status,
        points,
        reference: { series: 'BE_19_4.7', month: '2026-08', value: 18.2578 },
      });
      expect(keys(i)).toContain(`indicator.${status}`);
      expect(keys(i)).toContain('indicator.revolving_criterion');
      expect(i.sources.map((s) => s.id)).toEqual(['sts258_2023', 'bde_be1904']);
    },
  );

  it('explains the edge band: the average carries no charges', () => {
    expect(keys(indicate('revolving', '2026-08-20', declared(24.29), null))).toContain(
      'indicator.edge_reason',
    );
  });

  it.each([
    [6.31, 'above'],
    [6.3, 'edge'],
    [6.01, 'edge'],
    [6, 'below'],
    [-2, 'below'],
  ] as const)('%s points is %s', (points, expected) => {
    expect(band(points)).toBe(expected);
  });

  it('takes the 19,32 % of STS 258/2023 for a card concluded before June 2010', () => {
    const i = indicate('revolving', '2008-05-10', declared(26), null);
    expect(i).toMatchObject({
      status: 'above',
      reference: { kind: 'ruling_2010', value: 19.32 },
      points: 6.68,
    });
    expect(i.sources.map((s) => s.id)).toEqual(['sts258_2023']);
    expect(indicate('revolving', '2010-06-01', declared(26), null).reference).toMatchObject({
      kind: 'series',
      value: 19.1504,
    });
  });

  it('reads the series of the month, never the month before', () => {
    const i = indicate('revolving', '2026-09-03', declared(24.29), null);
    expect(i).toMatchObject({ status: 'not_published', reference: null, points: null });
    expect(i.calculation[0]).toEqual({
      key: 'indicator.not_published',
      vars: { month: { month: '2026-09' } },
    });
  });

  it('picks a fixed-rate loan series by its term, which is how long the rate is fixed', () => {
    expect(loanSeries(12, 'fixed')).toBe('BE_19_4.9');
    expect(loanSeries(13, 'fixed')).toBe('BE_19_4.10');
    expect(loanSeries(60, 'fixed')).toBe('BE_19_4.10');
    expect(loanSeries(61, 'fixed')).toBe('BE_19_4.11');
    expect(indicate('car_loan', '2019-02-15', declared(10), 84).reference).toMatchObject({
      series: 'BE_19_4.11',
    });
  });

  it('puts a variable-rate loan in the series up to one year, whatever its term', () => {
    expect(loanSeries(84, 'variable')).toBe('BE_19_4.9');
    const i = indicate('car_loan', '2019-02-15', declared(10), 84, DEPS, 'variable');
    expect(i.reference).toMatchObject({ series: 'BE_19_4.9' });
    expect(keys(i)).toContain('indicator.variable_rate_series');
    expect(
      i.calculation.find((p) => p.key === 'indicator.reference_loan')?.vars,
    ).not.toHaveProperty('term');
    expect(indicate('car_loan', '2019-02-15', declared(10), null, DEPS, 'variable').status).toBe(
      'distance_only',
    );
  });

  it('says nothing was entered without an APR, or without a loan term', () => {
    expect(indicate('personal_loan', '2019-02-15', null).status).toBe('not_entered');
    expect(indicate('personal_loan', '2019-02-15', declared(10), null).status).toBe('not_entered');
  });

  it('always closes with the judge and the official channels, and carries no amount', () => {
    for (const i of [
      indicate('personal_loan', '2019-02-15', declared(16.61)),
      indicate('revolving', '2026-08-20', declared(30), null),
      indicate('revolving', '2026-09-03', declared(30), null),
      indicate('personal_loan', '2019-02-15', null),
    ]) {
      expect(keys(i).slice(-2)).toEqual(['indicator.judge', 'indicator.channels']);
      expect(Object.keys(i)).not.toContain('amount');
    }
  });
});

describe('the APR compared', () => {
  it('is the one worked out when the person takes it, otherwise the stated one', () => {
    expect(comparedApr({ confirmedApr: true, declaredApr: 12 }, 16.61)).toEqual({
      value: 16.61,
      origin: 'recalculated',
    });
    expect(comparedApr({ confirmedApr: false, declaredApr: 12 }, 16.61)).toEqual(declared(12));
    expect(comparedApr({ confirmedApr: true, declaredApr: 12 }, null)).toEqual(declared(12));
    expect(comparedApr({ confirmedApr: false, declaredApr: null }, 16.61)).toBeNull();
  });
});

describe('revolving statement arithmetic', () => {
  it('works out the months and the interest to clear a balance with no new purchases', () => {
    // 1.200 € at 0 % with 100 € a month: 12 months, no interest.
    expect(cardPayoff(1_200, 0, 100)).toEqual({
      kind: 'pays_off',
      months: 12,
      interest: 0,
      totalPaid: 1_200,
    });
    // 1.000 € at 12 % a year, 1 % a month, with 100 € a month: 11 months, 58,98 € of interest.
    const payoff = cardPayoff(1_000, 12, 100);
    expect(payoff).toMatchObject({ kind: 'pays_off', months: 11 });
    if (payoff.kind === 'pays_off') expect(payoff.interest).toBeCloseTo(58.98, 1);
  });

  it('never clears a balance whose payment does not cover the month interest', () => {
    // 3.000 € at 24 %: 60 € of interest a month.
    expect(cardPayoff(3_000, 24, 60)).toEqual({ kind: 'never', monthlyInterest: 60 });
    expect(cardPayoff(3_000, 24, 59)).toEqual({ kind: 'never', monthlyInterest: 60 });
    expect(cardPayoff(3_000, 24, 61)).toMatchObject({ kind: 'pays_off' });
  });
});
