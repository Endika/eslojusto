import { describe, expect, it } from 'vitest';
import { parseDate } from '../../../src/engine/date';
import { validate } from '../../../src/engine/credit/validate';
import type { Card, CreditInput } from '../../../src/engine/credit/types';
import { loan, repayment, TODAY } from './input';

const errors = (change: Partial<CreditInput>) =>
  validate(loan(change), TODAY).map(({ field, code }) => `${field}:${code}`);

const card = (change: Partial<Card> = {}): Card => ({
  limit: 1_500,
  nominalRate: 21.94,
  annualFee: 0,
  minimumPayment: 30,
  balance: 0,
  ...change,
});

describe('credit validation', () => {
  it('accepts a whole synthetic loan', () => {
    expect(errors({})).toEqual([]);
    expect(errors({ earlyRepayment: repayment() })).toEqual([]);
    expect(errors({ product: 'revolving', instalments: null, card: card() })).toEqual([]);
  });

  it('rejects days that do not exist or have not happened', () => {
    expect(errors({ agreedOn: { y: 2019, m: 2, d: 29 } })).toEqual(['agreedOn:invalid_date']);
    expect(errors({ agreedOn: parseDate('2026-10-10') })).toEqual(['agreedOn:in_future']);
    expect(errors({ infoReceivedOn: parseDate('2026-10-10') })).toEqual([
      'infoReceivedOn:in_future',
    ]);
  });

  it.each([
    ['2019-01-16', []],
    ['2019-01-15', ['drawnOn:before_agreed']],
  ])('money drawn on %s, at most 30 days before the contract', (day, expected) => {
    expect(errors({ drawnOn: parseDate(day) })).toEqual(expected);
  });

  it('keeps amounts between 0 and 1.000.000 €', () => {
    expect(errors({ principal: 0 })).toContain('principal:amount_range');
    expect(errors({ principal: 1_000_000 })).toEqual([]);
    expect(errors({ principal: 1_000_000.01, netDisbursed: null })).toEqual([
      'principal:amount_range',
    ]);
    expect(errors({ balloon: { amount: -1, dueOn: null } })).toEqual(['balloon:amount_range']);
  });

  it('keeps the balloon day real and after the drawdown', () => {
    expect(errors({ balloon: { amount: 3_000, dueOn: parseDate('2023-03-15') } })).toEqual([]);
    expect(errors({ balloon: { amount: 3_000, dueOn: { y: 2023, m: 2, d: 29 } } })).toEqual([
      'balloon.dueOn:invalid_date',
    ]);
    expect(errors({ balloon: { amount: 3_000, dueOn: parseDate('2019-02-15') } })).toEqual([
      'balloon.dueOn:outside_term',
    ]);
  });

  it('refuses a balloon the schedule already holds as its last row', () => {
    const rows = (last: number) => ({
      kind: 'schedule' as const,
      rows: [
        { dueOn: parseDate('2019-03-15'), amount: 300 },
        { dueOn: parseDate('2019-04-15'), amount: 300 },
        { dueOn: parseDate('2019-05-15'), amount: last },
      ],
    });
    const balloon = { amount: 3_000, dueOn: null };
    expect(errors({ instalments: rows(3_300), balloon })).toEqual(['balloon:in_schedule']);
    expect(errors({ instalments: rows(300), balloon })).toEqual([]);
    // A small balloon next to equal rows is not in them.
    expect(errors({ instalments: rows(300), balloon: { amount: 100, dueOn: null } })).toEqual([]);
  });

  it('keeps the money handed over at most the principal', () => {
    expect(errors({ netDisbursed: 10_500 })).toEqual([]);
    expect(errors({ netDisbursed: 10_500.01 })).toEqual(['netDisbursed:above_principal']);
  });

  it.each([
    [0, []],
    [100, []],
    [-0.1, ['nominalRate:rate_range']],
    [100.1, ['nominalRate:rate_range']],
  ])('a nominal rate of %s %%', (nominalRate, expected) => {
    expect(errors({ nominalRate })).toEqual(expected);
  });

  it.each([
    [1, []],
    [600, []],
    [0, ['instalments.count:count_range']],
    [601, ['instalments.count:count_range']],
    [12.5, ['instalments.count:count_range']],
  ])('%s instalments', (count, expected) => {
    expect(
      errors({
        instalments: {
          kind: 'regular',
          count,
          amount: 273.35,
          frequency: 'monthly',
          firstDueOn: parseDate('2019-03-15'),
        },
      }),
    ).toEqual(expected);
  });

  it('checks every row of a schedule', () => {
    const row = (dueOn: string, amount = 100) => ({ dueOn: parseDate(dueOn), amount });
    expect(errors({ instalments: { kind: 'schedule', rows: [row('2019-03-15')] } })).toEqual([]);
    expect(errors({ instalments: { kind: 'schedule', rows: [] } })).toEqual([
      'instalments.rows:count_range',
    ]);
    expect(errors({ instalments: { kind: 'schedule', rows: [row('2019-03-15', 0)] } })).toEqual([
      'instalments.rows:amount_range',
    ]);
  });

  it('checks the charges, the insurance and the card', () => {
    expect(
      errors({
        charges: [{ kind: 'study', amount: 0, paidOn: parseDate('2019-02-15'), how: 'paid' }],
      }),
    ).toEqual(['charges:amount_range']);
    expect(
      errors({ insurance: { premium: 0, single: true, financed: true, required: null } }),
    ).toEqual(['insurance.premium:amount_range']);
    expect(errors({ card: card({ nominalRate: 101, minimumPayment: 0 }) })).toEqual([
      'card.nominalRate:rate_range',
      'card.minimumPayment:amount_range',
    ]);
  });

  it.each([
    ['2019-02-14', ['earlyRepayment.on:outside_term']],
    ['2019-02-15', []],
    ['2022-02-15', []],
    ['2022-02-16', ['earlyRepayment.on:outside_term']],
  ])('an early repayment on %s, within a term ending on 15-02-2022', (on, expected) => {
    const end = { agreedEndOn: parseDate('2022-02-15') };
    expect(errors({ earlyRepayment: repayment({ on: parseDate(on), ...end }) })).toEqual(expected);
  });

  it('keeps an early repayment below the principal', () => {
    expect(errors({ earlyRepayment: repayment({ principalRepaid: 10_500.01 }) })).toContain(
      'earlyRepayment.principalRepaid:above_principal',
    );
    expect(errors({ earlyRepayment: repayment({ compensationCharged: 0 }) })).toEqual([]);
  });

  it('takes the receipt of the contract terms on or after the contract day', () => {
    expect(errors({ infoReceivedOn: parseDate('2019-02-20') })).toEqual([]);
    expect(errors({ infoReceivedOn: parseDate('2019-02-14') })).toEqual([
      'infoReceivedOn:before_agreed',
    ]);
  });
});
