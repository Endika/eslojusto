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
    expect(errors({ instalments: { kind: 'schedule', rows: [row('2019-03-15')] } })).toEqual([]);
    expect(errors({ instalments: { kind: 'schedule', rows: [] } })).toEqual([
      'instalments.rows:count_range',
    ]);
    expect(errors({ instalments: { kind: 'schedule', rows: [row('2019-03-15', 0)] } })).toEqual([
      'instalments.rows:amount_range',
    ]);
  });

  const row = (dueOn: string, amount = 100) => ({ dueOn: parseDate(dueOn), amount });
  const badDate = { y: 2019, m: 2, d: 30 };
  const regular = (change: object) => ({
    kind: 'regular' as const,
    count: 48,
    amount: 273.35,
    frequency: 'monthly' as const,
    firstDueOn: parseDate('2019-03-15'),
    ...change,
  });
  const dated = (change: Partial<ReturnType<typeof repayment>>) => ({
    earlyRepayment: repayment(change),
  });

  it.each<[string, Partial<CreditInput>, string[]]>([
    ['a drawdown day in the future', { drawnOn: parseDate('2026-10-10') }, ['drawnOn:in_future']],
    ['a net amount of nothing', { netDisbursed: 0 }, ['netDisbursed:amount_range']],
    ['a declared APR over 100', { declaredApr: 100.1 }, ['declaredApr:rate_range']],
    [
      'a declared total of nothing',
      { declaredTotalPayable: 0 },
      ['declaredTotalPayable:amount_range'],
    ],
    ['no declared APR nor total', { declaredApr: null, declaredTotalPayable: null }, []],
    [
      'an instalment of nothing',
      { instalments: regular({ amount: 0 }) },
      ['instalments.amount:amount_range'],
    ],
    [
      'a first instalment on no day',
      { instalments: regular({ firstDueOn: badDate }) },
      ['instalments.firstDueOn:invalid_date'],
    ],
    [
      'a schedule with one row on no day',
      {
        instalments: {
          kind: 'schedule',
          rows: [row('2019-03-15'), { ...row('2019-04-15'), dueOn: badDate }],
        },
      },
      ['instalments.rows:invalid_date'],
    ],
    [
      'a schedule with one row of nothing and one on no day',
      {
        instalments: {
          kind: 'schedule',
          rows: [row('2019-03-15'), row('2019-04-15', 0), { ...row('2019-05-15'), dueOn: badDate }],
        },
      },
      ['instalments.rows:invalid_date'],
    ],
    [
      'a schedule with one row of nothing',
      { instalments: { kind: 'schedule', rows: [row('2019-03-15'), row('2019-04-15', 0)] } },
      ['instalments.rows:amount_range'],
    ],
    [
      'a balloon next to a schedule that already failed',
      {
        instalments: {
          kind: 'schedule',
          rows: [
            row('2019-03-15'),
            { ...row('2019-04-15', 3_300), dueOn: { y: 2019, m: 6, d: 31 } },
          ],
        },
        balloon: { amount: 3_000, dueOn: null },
      },
      ['instalments.rows:invalid_date'],
    ],
    ...(
      [
        [
          'a later row holding it, listed first',
          [
            [5, 3_300],
            [3, 300],
            [4, 300],
          ],
          ['balloon:in_schedule'],
        ],
        [
          'a last row equal to it',
          [
            [3, 300],
            [4, 300],
            [5, 3_000],
          ],
          ['balloon:in_schedule'],
        ],
        [
          'a last row below it',
          [
            [3, 100],
            [4, 200],
            [5, 300],
          ],
          [],
        ],
        [
          'an earlier row as large as the last',
          [
            [3, 3_300],
            [4, 100],
            [5, 3_300],
          ],
          [],
        ],
        [
          'a middle row as large as the last',
          [
            [3, 100],
            [4, 3_300],
            [5, 3_300],
          ],
          [],
        ],
      ] satisfies [string, [number, number][], string[]][]
    ).map(([label, rows, expected]): [string, Partial<CreditInput>, string[]] => [
      `a schedule with ${label}, and a balloon of 3.000 €`,
      {
        instalments: {
          kind: 'schedule',
          rows: rows.map(([m, amount]) => row(`2019-0${m}-15`, amount)),
        },
        balloon: { amount: 3_000, dueOn: null },
      },
      expected,
    ]),
    [
      'an agreement on no day, far after the drawdown',
      { agreedOn: { y: 2019, m: 12, d: 40 } },
      ['agreedOn:invalid_date'],
    ],
    [
      'a balloon on no day, before the drawdown',
      { balloon: { amount: 3_000, dueOn: { y: 2018, m: 2, d: 30 } } },
      ['balloon.dueOn:invalid_date'],
    ],
    [
      'an agreement and a drawdown today',
      {
        agreedOn: TODAY,
        drawnOn: TODAY,
        instalments: regular({ firstDueOn: parseDate('2026-11-09') }),
      },
      [],
    ],
    [
      'an early repayment when the drawdown day is wrong',
      { drawnOn: badDate, ...dated({}) },
      ['drawnOn:invalid_date'],
    ],
    [
      'a balloon the schedule holds, next to an earlier error',
      {
        principal: 0,
        netDisbursed: null,
        instalments: { kind: 'schedule', rows: [row('2019-03-15', 3_300)] },
        balloon: { amount: 3_000, dueOn: null },
      },
      ['principal:amount_range', 'balloon:in_schedule'],
    ],
    [
      'a balloon with no instalments',
      { instalments: null, balloon: { amount: 3_000, dueOn: null } },
      [],
    ],
    [
      'a dated balloon when the drawdown day is wrong',
      { drawnOn: badDate, balloon: { amount: 3_000, dueOn: parseDate('2019-02-15') } },
      ['drawnOn:invalid_date'],
    ],
    [
      'a charge on no day',
      { charges: [{ kind: 'study', amount: 0, paidOn: badDate, how: 'paid' }] },
      ['charges:invalid_date'],
    ],
    ['a card limit of nothing', { card: card({ limit: 0 }) }, ['card.limit:amount_range']],
    ['a card with no fee and nothing owed', { card: card({ annualFee: 0, balance: 0 }) }, []],
    ['a card fee below zero', { card: card({ annualFee: -1 }) }, ['card.annualFee:amount_range']],
    ['a card balance below zero', { card: card({ balance: -1 }) }, ['card.balance:amount_range']],
    [
      'a repayment day in the future',
      dated({ on: parseDate('2026-10-10') }),
      ['earlyRepayment.on:in_future'],
    ],
    [
      'an agreed end on no day',
      dated({ agreedEndOn: badDate }),
      ['earlyRepayment.agreedEndOn:invalid_date'],
    ],
    [
      'an agreed end before the drawdown',
      dated({ on: parseDate('2019-02-15'), agreedEndOn: parseDate('2019-02-14') }),
      ['earlyRepayment.on:outside_term', 'earlyRepayment.agreedEndOn:outside_term'],
    ],
    [
      'an agreed end on the drawdown',
      dated({ on: parseDate('2019-02-15'), agreedEndOn: parseDate('2019-02-15') }),
      ['earlyRepayment.agreedEndOn:outside_term'],
    ],
    [
      'a repayment of nothing',
      dated({ principalRepaid: 0 }),
      ['earlyRepayment.principalRepaid:amount_range'],
    ],
    ['a repayment of the whole principal', dated({ principalRepaid: 10_500 }), []],
    [
      'a compensation below zero',
      dated({ compensationCharged: -1 }),
      ['earlyRepayment.compensationCharged:amount_range'],
    ],
    [
      'interest settled below zero',
      dated({ interestSettled: -1 }),
      ['earlyRepayment.interestSettled:amount_range'],
    ],
    [
      'remaining interest below zero',
      dated({ remainingInterest: -1 }),
      ['earlyRepayment.remainingInterest:amount_range'],
    ],
    ['no interest known', dated({ interestSettled: null, remainingInterest: null }), []],
    [
      'a receipt before the contract when the contract day is wrong',
      { agreedOn: badDate, infoReceivedOn: parseDate('2019-02-14') },
      ['agreedOn:invalid_date'],
    ],
    ['a receipt on the contract day', { infoReceivedOn: parseDate('2019-02-15') }, []],
  ])('%s', (_, change, expected) => {
    expect(errors(change)).toEqual(expected);
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
