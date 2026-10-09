import { describe, expect, it } from 'vitest';
import { parseDate } from '../../../src/engine/date';
import { aprFlows, solveApr, yearsBetween, type CashFlow } from '../../../src/engine/credit/tae';
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
  it('counts whole months as twelfths of a year', () => {
    expect(yearsBetween(parseDate('2019-02-15'), parseDate('2019-03-15'), 1)).toBe(1 / 12);
    expect(yearsBetween(parseDate('2019-02-15'), parseDate('2023-02-15'), 1)).toBe(4);
  });

  it('counts whole months back from the date, then the days to the drawdown', () => {
    // 15-01-2024 to 01-03-2024: back one month to 01-02-2024, then 17 days, over the 365 days of
    // the year that ends on 01-02-2024.
    expect(yearsBetween(parseDate('2024-01-15'), parseDate('2024-03-01'), 1)).toBeCloseTo(
      1 / 12 + 17 / 365,
      12,
    );
  });

  it('takes a year of 366 days when the year counted back holds a 29 February', () => {
    // 01-02-2024 to 15-03-2024 in years and days: 43 days over the 366 days from 15-03-2023.
    expect(yearsBetween(parseDate('2024-02-01'), parseDate('2024-03-15'), 12)).toBeCloseTo(
      43 / 366,
      12,
    );
    // The same stretch a year earlier: 42 days over 365.
    expect(yearsBetween(parseDate('2023-02-01'), parseDate('2023-03-15'), 12)).toBeCloseTo(
      42 / 365,
      12,
    );
  });

  it('runs backwards for a payment made before the drawdown', () => {
    expect(yearsBetween(parseDate('2024-03-10'), parseDate('2024-03-01'), 12)).toBeCloseTo(
      -9 / 366,
      12,
    );
  });
});

describe('APR from the contract figures', () => {
  // STS 366/2026: 10.500 € of which 761,25 € of charges never reached the borrower, 48 × 273,35 €.
  it('gives 16,61 % for the loan the Supreme Court looked at, and 12,00 % without its charges', () => {
    expect(aprOf(loan())).toBe(16.61);
    expect(aprOf(loan({ netDisbursed: null, charges: [] }))).toBe(12);
  });

  it('takes the deducted charges off the principal when the net amount is not given', () => {
    expect(aprOf(loan({ netDisbursed: null }))).toBe(16.61);
  });

  it('gives 8,29 % for 20.000 € over 60 months at 7,99 %', () => {
    expect(aprOf(twentyThousand())).toBe(8.29);
  });

  it('gives 10,16 % with a 3,95 % opening charge paid apart', () => {
    const opening = { kind: 'opening', amount: 790, paidOn: parseDate('2024-03-01') } as const;
    expect(aprOf(twentyThousand({ charges: [{ ...opening, how: 'paid' }] }))).toBe(10.16);
    expect(aprOf(twentyThousand({ charges: [{ ...opening, how: 'deducted' }] }))).toBe(10.16);
  });

  it('gives 10,08 % with the opening charge financed and repaid in 421,45 € instalments', () => {
    const financed = twentyThousand({
      instalments: regular(60, 421.45, '2024-04-01'),
      charges: [{ kind: 'opening', amount: 790, paidOn: parseDate('2024-03-01'), how: 'financed' }],
    });
    expect(aprOf(financed)).toBe(10.08);
  });

  it('gives 24,29 % for a revolving card at a 21,94 % nominal rate and no annual fee', () => {
    // Annex I, part II: one year, 12 equal capital repayments, interest on what is left, so the
    // monthly rate is the nominal one: (1 + 0,2194/12)^12 − 1.
    const card = loan({
      product: 'revolving',
      instalments: null,
      netDisbursed: null,
      charges: [],
      principal: 1_500,
      nominalRate: 21.94,
      card: { limit: 1_500, nominalRate: 21.94, annualFee: 0, minimumPayment: 30, balance: 0 },
    });
    expect(aprOf(card)).toBe(24.29);
  });

  it('adds a revolving card annual fee at the drawdown', () => {
    const card = (annualFee: number) =>
      loan({
        product: 'revolving',
        instalments: null,
        netDisbursed: null,
        charges: [],
        card: { limit: 1_500, nominalRate: 21.94, annualFee, minimumPayment: 30, balance: 0 },
      });
    expect(aprOf(card(30))).toBeGreaterThan(aprOf(card(0)) ?? Infinity);
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

  it('pays an undated balloon a month after the last instalment in that reading', () => {
    const input = twentyThousand({
      instalments: regular(36, 300, '2024-04-01'),
      balloon: { amount: 12_000, dueOn: null },
    });
    const flows = aprFlows(input, COUNTED);
    expect(flows?.flows.at(-1)).toMatchObject({
      on: parseDate('2027-04-01'),
      years: 37 / 12,
      amount: -12_000,
    });
    expect(flows?.totalPayable).toBeCloseTo(36 * 300 + 12_000, 6);
    // 20.000 € back in 36 × 300 € and 12.000 € a month later: the rate found zeroes the equation.
    const solution = solveApr(flows?.flows ?? []);
    const rate = solution.kind === 'solved' ? solution.rate : Number.NaN;
    const check = (flows?.flows ?? []).reduce(
      (sum, f) => sum + f.amount * (1 + rate) ** -f.years,
      0,
    );
    expect(Math.abs(check)).toBeLessThan(1e-6);
  });

  it('pays an undated balloon with the last instalment in the other reading', () => {
    const input = twentyThousand({
      instalments: regular(36, 300, '2024-04-01'),
      balloon: { amount: 12_000, dueOn: null },
    });
    const flows = aprFlows(input, { ...COUNTED, balloon: 'balloon_with_last' });
    expect(flows?.basis).toBe('normalised_months');
    expect(flows?.flows.at(-1)).toMatchObject({
      on: parseDate('2027-03-01'),
      years: 36 / 12,
      amount: -12_000,
    });
    // 20.000 €, 36 × 300 € and 12.000 €: 5,80 % with the balloon in month 37, 5,91 % in month 36.
    expect(aprOf(input)).toBe(5.8);
    expect(aprOf({ ...input, balloon: { amount: 12_000, dueOn: parseDate('2027-03-01') } })).toBe(
      5.91,
    );
  });

  it('places a dated balloon on its day, whatever the reading', () => {
    const input = twentyThousand({
      instalments: regular(36, 300, '2024-04-01'),
      balloon: { amount: 12_000, dueOn: parseDate('2027-04-01') },
    });
    const late = aprFlows(input, { ...COUNTED, balloon: 'balloon_with_last' });
    expect(late?.flows.at(-1)).toMatchObject({ years: 37 / 12, amount: -12_000 });
    // Off the monthly grid, the whole plan is read in days.
    const offGrid = aprFlows(
      { ...input, balloon: { amount: 12_000, dueOn: parseDate('2027-04-20') } },
      COUNTED,
    );
    expect(offGrid?.basis).toBe('days');
  });

  it('reads an irregular schedule in days, over 366 across a 29 February', () => {
    const rows = ['2024-02-20', '2024-03-18', '2024-04-22'].map((dueOn) => ({
      dueOn: parseDate(dueOn),
      amount: 340,
    }));
    const input = loan({
      agreedOn: parseDate('2024-01-20'),
      drawnOn: parseDate('2024-01-20'),
      principal: 1_000,
      netDisbursed: null,
      charges: [],
      instalments: { kind: 'schedule', rows },
    });
    const flows = aprFlows(input, COUNTED);
    expect(flows?.basis).toBe('days');
    // 31, 58 and 93 days, each over the days of the year counted back from its date: 365 up to
    // 20-02-2024, 366 once that year holds 29-02-2024.
    expect(flows?.flows.map((f) => f.years)).toEqual([0, 31 / 365, 58 / 366, 93 / 366]);
    expect(aprOf(input)).toBeGreaterThan(0);
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

  it('adds a periodic premium to each instalment', () => {
    const input = twentyThousand({
      insurance: { premium: 15, single: false, financed: false, required: true },
    });
    const flows = aprFlows(input, COUNTED);
    expect(flows?.flows[1]?.amount).toBeCloseTo(-420.43, 6);
    expect(aprOf(input)).toBeGreaterThan(8.29);
  });

  it('gives no figure without instalments', () => {
    expect(aprFlows(loan({ instalments: null }), COUNTED)).toBeNull();
  });
});

describe('solveApr', () => {
  const flow = (years: number, amount: number): CashFlow => ({
    on: parseDate('2024-01-01'),
    years,
    amount,
  });

  it('solves to well within 1e-9', () => {
    const flows = [flow(0, 1_000), flow(1, -1_100)];
    const solution = solveApr(flows);
    expect(solution.kind).toBe('solved');
    if (solution.kind === 'solved') expect(Math.abs(solution.rate - 0.1)).toBeLessThan(1e-9);
  });

  it('gives a zero rate when nothing is paid on top', () => {
    const solution = solveApr([
      flow(0, 1_200),
      ...Array.from({ length: 12 }, (_, k) => flow((k + 1) / 12, -100)),
    ]);
    expect(solution.kind === 'solved' && Math.abs(solution.rate)).toBeLessThan(1e-9);
  });

  it('gives no figure when the flows never change sign or change it twice', () => {
    expect(solveApr([flow(0, 1_000), flow(1, 100)])).toEqual({ kind: 'unsolvable' });
    expect(solveApr([flow(0, -1_000), flow(1, 2_300), flow(2, -1_320)])).toEqual({
      kind: 'unsolvable',
    });
  });
});
