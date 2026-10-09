import { describe, expect, it } from 'vitest';
import { parseDate } from '../../../src/engine/date';
import type { MortgageInput } from '../../../src/engine/mortgage/types';
import { validate } from '../../../src/engine/mortgage/validate';
import { invoice, mortgage, TODAY } from './input';

const errors = (change: Partial<MortgageInput>) =>
  validate(mortgage(change), TODAY).map(({ field, code, index }) =>
    index === null ? `${field}:${code}` : `${field}[${index}]:${code}`,
  );

const operation = (change: Partial<MortgageInput['operations'][number]> = {}) => ({
  on: parseDate('2021-03-01'),
  kind: 'partial_prepayment' as const,
  principal: 20_000,
  feeCharged: 0,
  hadInsurance: null,
  ...change,
});

describe('mortgage validation', () => {
  it('accepts a whole synthetic deed', () => {
    expect(
      errors({
        invoices: [
          invoice('notary_loan', 612.4, { paidOn: parseDate('2012-05-10') }),
          invoice('agency', 450, { supplied: [120] }),
          invoice('valuation', null),
        ],
        alreadyReturned: 0,
        deedPercents: { variable: 0.5 },
        operations: [operation()],
        clauses: [{ label: 'floor_clause', present: true, floorPercent: 3 }],
      }),
    ).toEqual([]);
  });

  it('rejects days that do not exist or have not happened', () => {
    expect(errors({ deedOn: { y: 2015, m: 2, d: 29 } })).toEqual(['deedOn:invalid_date']);
    expect(errors({ deedOn: parseDate('2026-10-10') })).toEqual(['deedOn:in_future']);
    expect(errors({ fixedUntil: { y: 2030, m: 13, d: 1 } })).toEqual(['fixedUntil:invalid_date']);
  });

  it.each([
    ['1995-01-01', []],
    ['1994-12-31', ['deedOn:before_table']],
  ])('a deed of %s, the first year the legal interest table holds', (day, expected) => {
    expect(errors({ deedOn: parseDate(day) })).toEqual(expected);
  });

  it.each([
    ['2012-02-10', []],
    ['2012-02-09', ['invoices.paidOn[0]:before_deed']],
  ])('an invoice paid on %s, at most 90 days before the deed', (day, expected) => {
    expect(errors({ invoices: [invoice('notary_loan', 600, { paidOn: parseDate(day) })] })).toEqual(
      expected,
    );
  });

  it.each([
    [0, ['invoices.total[0]:amount_range']],
    [-5, ['invoices.total[0]:amount_range']],
    [1_000_000, []],
    [1_000_000.01, ['invoices.total[0]:amount_range']],
  ])('an invoice of %s €', (total, expected) => {
    expect(errors({ invoices: [invoice('registry_mortgage', total)] })).toEqual(expected);
  });

  it('takes outlays only on an agency invoice, never above its total', () => {
    expect(errors({ invoices: [invoice('notary_loan', 600, { supplied: [10] })] })).toEqual([
      'invoices.supplied[0]:not_agency',
    ]);
    expect(errors({ invoices: [invoice('agency', 300, { supplied: [200, 100.01] })] })).toEqual([
      'invoices.supplied[0]:above_total',
    ]);
    expect(errors({ invoices: [invoice('agency', 300, { supplied: [0] })] })).toEqual([
      'invoices.supplied[0]:amount_range',
    ]);
  });

  it.each([
    [{ deedPercents: { fixed: 30.5 } }, ['deedPercents.fixed:percent_range']],
    [{ deedPercents: { variable: -1 } }, ['deedPercents.variable:percent_range']],
    [
      { clauses: [{ label: 'default_interest', present: true, defaultRate: 31 }] },
      ['clauses.defaultRate[0]:percent_range'],
    ],
    [{ alreadyReturned: -1 }, ['alreadyReturned:amount_range']],
  ] as const)('bounds %j', (change, expected) => {
    expect(errors(change)).toEqual(expected);
  });

  it('places each operation after the deed and checks its amounts', () => {
    expect(errors({ operations: [operation({ on: parseDate('2012-05-09') })] })).toEqual([
      'operations.on[0]:before_deed',
    ]);
    expect(errors({ operations: [operation({ principal: 0, feeCharged: -1 })] })).toEqual([
      'operations.principal[0]:amount_range',
      'operations.feeCharged[0]:amount_range',
    ]);
  });

  it('takes the revision of the rate as a whole count of months and the capital as an amount', () => {
    expect(errors({ rateRevisionMonths: 6, loanAmount: 150_000 })).toEqual([]);
    expect(errors({ rateRevisionMonths: 0, loanAmount: 0 })).toEqual([
      'rateRevisionMonths:count_range',
      'loanAmount:amount_range',
    ]);
    expect(errors({ clauses: [{ label: 'opening_fee', present: true, feeAmount: -1 }] })).toEqual([
      'clauses.feeAmount[0]:amount_range',
    ]);
  });

  it('lets a switch to a fixed rate repay nothing, and nothing else', () => {
    const nothing = { principal: 0 };
    expect(
      errors({ operations: [operation({ ...nothing, kind: 'fixed_rate_novation' })] }),
    ).toEqual([]);
    expect(errors({ operations: [operation(nothing)] })).toEqual([
      'operations.principal[0]:amount_range',
    ]);
  });

  it('takes the missed instalments of an early termination clause as a whole count', () => {
    const clauses = (missedInstalments: number) => [
      { label: 'early_termination' as const, present: true, missedInstalments },
    ];
    expect(errors({ clauses: clauses(1) })).toEqual([]);
    expect(errors({ clauses: clauses(600) })).toEqual([]);
    for (const bad of [0, 1.5, 601, Number.NaN])
      expect(errors({ clauses: clauses(bad) })).toEqual([
        'clauses.missedInstalments[0]:count_range',
      ]);
  });
});
