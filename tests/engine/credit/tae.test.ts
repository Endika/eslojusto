import { describe, expect, it } from 'vitest';
import { parseDate } from '../../../src/engine/date';
import {
  aprFlows,
  solveApr,
  yearsBetween,
  type CashFlow,
  type FlowOptions,
} from '../../../src/engine/credit/tae';
import type { CreditInput } from '../../../src/engine/credit/types';
import { loan } from './input';

const COUNTED = { insurance: true, leaveOut: null, balloon: 'balloon_month_after' } as const;

// The APR in %, to two decimals, worked out from a contract.
const aprOf = (input: CreditInput): number | null => {
  const flows = aprFlows(input, COUNTED);
  if (flows === null) return null;
  const solution = solveApr(flows.flows);
  return solution.kind === 'solved' ? Math.round(solution.rate * 10_000) / 100 : null;
};

const regular = (count: number, amount: number, firstDueOn: string) => ({
  kind: 'regular' as const,
  count,
  amount,
  frequency: 'monthly' as const,
  firstDueOn: parseDate(firstDueOn),
});

// 20.000 € over 60 months at a 7,99 % nominal rate: 405,43 € a month, (1 + 0,0799/12)^12 − 1.
const twentyThousand = (change: Partial<CreditInput> = {}): CreditInput =>
  loan({
    agreedOn: parseDate('2024-03-01'),
    drawnOn: parseDate('2024-03-01'),
    principal: 20_000,
    netDisbursed: null,
    nominalRate: 7.99,
    declaredApr: null,
    declaredTotalPayable: null,
    instalments: regular(60, 405.43, '2024-04-01'),
    charges: [],
    ...change,
  });

describe('annex I times', () => {
  it.each([
    // Two whole years and the days to 20-05-2021, over the 365 days of the year from 20-05-2018.

    // A year and the days left, with the end month before the start month.
    ['2019-11-15', '2021-02-10', 12, 1 + 87 / 365],
    // A month end to the next month end is a whole month.
    ['2024-02-29', '2024-03-31', 1, 1 / 12],
  ])(
    'counts whole periods and then the days: %s to %s in periods of %s months',
    (from, to, months, years) => {
      expect(yearsBetween(parseDate(from), parseDate(to), months)).toBeCloseTo(years, 12);
    },
  );

  it('counts a day to day year as one even when the day is missing in the end month', () => {
    expect(yearsBetween(parseDate('2024-02-29'), parseDate('2025-02-28'), 12)).toBe(1);
  });

  it('runs backwards for a payment made before the drawdown', () => {
    expect(yearsBetween(parseDate('2024-03-10'), parseDate('2024-03-01'), 12)).toBeCloseTo(
      -9 / 366,
      12,
    );
  });
});

describe('APR from the contract figures', () => {
  it('gives 8,29 % for 20.000 € over 60 months at 7,99 %', () => {
    expect(aprOf(twentyThousand())).toBe(8.29);
  });

  it('gives 10,08 % with the opening charge financed and repaid in 421,45 € instalments', () => {
    const financed = twentyThousand({
      instalments: regular(60, 421.45, '2024-04-01'),
      charges: [{ kind: 'opening', amount: 790, paidOn: parseDate('2024-03-01'), how: 'financed' }],
    });
    expect(aprOf(financed)).toBe(10.08);
  });

  it('counts a first instalment 45 days after the drawdown as a month and the days before it', () => {
    // 1.000 € drawn on 15-01-2024, 12 × 87 € from 01-03-2024: the first one at a month and 17
    // days, then a twelfth of a year apart.
    const input = loan({
      agreedOn: parseDate('2024-01-15'),
      drawnOn: parseDate('2024-01-15'),
      principal: 1_000,
      netDisbursed: null,
      charges: [],
      instalments: regular(12, 87, '2024-03-01'),
    });
    const flows = aprFlows(input, COUNTED);
    const first = 1 / 12 + 17 / 365;
    expect(flows?.basis).toBe('normalised_months');
    expect(flows?.flows.map((f) => f.years)).toEqual([
      0,
      ...Array.from({ length: 12 }, (_, k) => first + k / 12),
    ]);
    // Later than a month, so lower than the same instalments a month apart.
    const monthApart = aprOf({ ...input, instalments: regular(12, 87, '2024-02-15') });
    expect(aprOf(input)).toBeLessThan(monthApart ?? 0);
  });

  it('reads a schedule that follows month by month in normalised months', () => {
    const rows = ['2024-02-29', '2024-03-31', '2024-04-30'].map((dueOn) => ({
      dueOn: parseDate(dueOn),
      amount: 340,
    }));
    const input = loan({
      drawnOn: parseDate('2024-01-31'),
      agreedOn: parseDate('2024-01-31'),
      principal: 1_000,
      netDisbursed: null,
      charges: [],
      instalments: { kind: 'schedule', rows },
    });
    const flows = aprFlows(input, COUNTED);
    expect(flows?.basis).toBe('normalised_months');
    expect(flows?.flows.map((f) => f.years)).toEqual([0, 1 / 12, 2 / 12, 3 / 12]);
  });

  it('counts a financed single insurance premium only when it is counted', () => {
    const insured = twentyThousand({
      instalments: regular(60, 421.45, '2024-04-01'),
      insurance: { premium: 790, single: true, financed: true, required: true },
    });
    expect(aprOf(insured)).toBe(10.08);
    // Left out, the premium counts as money received.
    const left = aprFlows(insured, { ...COUNTED, insurance: false });
    expect(left?.received).toBe(20_790);
    const solution = solveApr(left?.flows ?? []);
    expect(solution.kind === 'solved' && Math.round(solution.rate * 10_000) / 100).toBe(8.29);
  });

  it('puts a dated balloon before the first instalment off the monthly grid', () => {
    const early = { amount: 12_000, dueOn: parseDate('2024-03-01') };
    const input = twentyThousand({ instalments: regular(36, 300, '2024-04-01'), balloon: early });
    expect(aprFlows(input, COUNTED)?.basis).toBe('days');
  });

  it('reads instalments that skip a month in days', () => {
    const rows = ['2024-02-15', '2024-04-15'].map((dueOn) => ({
      dueOn: parseDate(dueOn),
      amount: 500,
    }));
    const flows = aprFlows(
      twentyThousand({ instalments: { kind: 'schedule', rows }, principal: 1_000 }),
      COUNTED,
    );
    expect(flows?.basis).toBe('days');
  });

  it('puts the rows of a schedule in date order', () => {
    const rows = ['2024-04-22', '2024-02-20', '2024-03-18'].map((dueOn) => ({
      dueOn: parseDate(dueOn),
      amount: 340,
    }));
    const flows = aprFlows(
      loan({
        agreedOn: parseDate('2024-01-20'),
        drawnOn: parseDate('2024-01-20'),
        principal: 1_000,
        netDisbursed: null,
        charges: [],
        instalments: { kind: 'schedule', rows },
      }),
      COUNTED,
    );
    expect(flows?.flows.map((f) => f.years)).toEqual([0, 31 / 365, 58 / 366, 93 / 366]);
  });

  it('reads the last day of each month as month by month when the first is a month end', () => {
    const monthEnds = (...days: string[]) =>
      aprFlows(
        loan({
          drawnOn: parseDate('2024-01-31'),
          agreedOn: parseDate('2024-01-31'),
          principal: 1_000,
          netDisbursed: null,
          charges: [],
          instalments: {
            kind: 'schedule',
            rows: days.map((d) => ({ dueOn: parseDate(d), amount: 340 })),
          },
        }),
        COUNTED,
      )?.basis;
    expect(monthEnds('2024-02-29', '2024-03-31')).toBe('normalised_months');
    // A first day that is not a month end only follows date to date.
    expect(monthEnds('2024-02-15', '2024-03-31')).toBe('days');
    // A month end first day: a later day of the month is not its due day.
    expect(monthEnds('2024-02-29', '2024-03-30')).toBe('days');
  });

  describe('which cost is left out', () => {
    const costly = twentyThousand({
      charges: [
        { kind: 'study', amount: 100, paidOn: parseDate('2024-03-01'), how: 'paid' },
        { kind: 'other', amount: 50, paidOn: parseDate('2024-03-01'), how: 'paid' },
      ],
      insurance: { premium: 200, single: true, financed: false, required: true },
    });
    const paidAtDrawdown = (leaveOut: FlowOptions['leaveOut']) =>
      aprFlows(costly, { ...COUNTED, leaveOut })
        ?.flows.filter((f) => f.years === 0 && f.amount < 0)
        .map((f) => -f.amount);

    it.each([['the second charge', { kind: 'charge', index: 1 }, [100, 200]]] as const)(
      'takes out %s only',
      (_, leaveOut, expected) => {
        expect(paidAtDrawdown(leaveOut)).toEqual(expected);
      },
    );
  });

  describe('a periodic premium with a balloon', () => {
    const input = twentyThousand({
      instalments: regular(36, 300, '2024-04-01'),
      balloon: { amount: 12_000, dueOn: null },
      insurance: { premium: 15, single: false, financed: false, required: true },
    });

    it('is paid with each instalment but not with the balloon', () => {
      const flows = aprFlows(input, COUNTED)?.flows ?? [];
      expect(flows.at(-2)?.amount).toBe(-315);
      expect(flows.at(-1)?.amount).toBe(-12_000);
    });

    it('is paid with the last instalment when there is no balloon', () => {
      const flows = aprFlows({ ...input, balloon: null }, COUNTED)?.flows ?? [];
      expect(flows.at(-1)?.amount).toBe(-315);
    });
  });
});

describe('a revolving card', () => {
  const card = (change: Partial<CreditInput> = {}) =>
    loan({
      product: 'revolving',
      instalments: null,
      netDisbursed: null,
      charges: [],
      principal: 1_500,
      nominalRate: 21.94,
      card: { limit: 1_200, nominalRate: 12, annualFee: 0, minimumPayment: 30, balance: 0 },
      ...change,
    });
  const flowsOf = (input: CreditInput, options: Partial<FlowOptions> = {}) =>
    aprFlows(input, { ...COUNTED, ...options });
  const first = (input: CreditInput) => flowsOf(input)?.flows;

  it('falls back on the principal and the nominal rate when no card is given', () => {
    const flows = first(card({ card: null }));
    expect(flows?.[0]?.amount).toBe(1_500);
    expect(flows?.[1]?.amount).toBeCloseTo(-(125 + 1_500 * (21.94 / 1_200)), 9);
  });

  it('pays the annual fee, the charges and a single premium at the drawdown', () => {
    const input = card({
      card: { limit: 1_200, nominalRate: 12, annualFee: 30, minimumPayment: 30, balance: 0 },
      charges: [
        { kind: 'study', amount: 10, paidOn: parseDate('2019-02-15'), how: 'paid' },
        { kind: 'other', amount: 5, paidOn: parseDate('2019-02-15'), how: 'paid' },
      ],
      insurance: { premium: 100, single: true, financed: false, required: true },
    });
    const upfront = (options?: Partial<FlowOptions>) => flowsOf(input, options)?.flows[1]?.amount;
    expect(upfront()).toBe(-145);
    expect(upfront({ leaveOut: { kind: 'charge', index: 1 } })).toBe(-140);
    expect(upfront({ leaveOut: { kind: 'charge', index: 0 } })).toBe(-135);
    expect(upfront({ leaveOut: { kind: 'insurance' } })).toBe(-45);
    expect(upfront({ insurance: false })).toBe(-45);
  });

  it('adds a periodic premium to each instalment and never an upfront payment', () => {
    const flows = first(
      card({ insurance: { premium: 7, single: false, financed: false, required: true } }),
    );
    expect(flows).toHaveLength(13);
    expect(flows?.[1]?.amount).toBeCloseTo(-119, 9);
  });
});

describe('solveApr', () => {
  const flow = (years: number, amount: number): CashFlow => ({
    on: parseDate('2024-01-01'),
    years,
    amount,
  });

  it('solves a rate close to the top of the search interval, and one with the signs reversed', () => {
    const high = solveApr([flow(0, 1_000), flow(1, -10_995)]);
    expect(high.kind === 'solved' && high.rate).toBeCloseTo(9.995, 9);
    const reversed = solveApr([flow(0, -1_000), flow(1, 1_100)]);
    expect(reversed.kind === 'solved' && reversed.rate).toBeCloseTo(0.1, 9);
  });

  it('gives no figure when the flows never change sign or change it more than once', () => {
    expect(solveApr([flow(0, 1_000), flow(1, 100)])).toEqual({ kind: 'unsolvable' });
    // Three roots: at 100 %, 0 % and -50 %.
    expect(solveApr([flow(0, 1_000), flow(1, -3_500), flow(2, 3_500), flow(3, -1_000)])).toEqual({
      kind: 'unsolvable',
    });
    expect(solveApr([flow(0, -1_000), flow(1, 2_300), flow(2, -1_320)])).toEqual({
      kind: 'unsolvable',
    });
  });
});
