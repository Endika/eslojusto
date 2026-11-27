import { describe, expect, it } from 'vitest';
import { basePay } from '../../../src/engine/household/salary';
import { DEPS, household } from './input';

const apart = (count: number, amount: number | null) => ({
  count,
  amount,
  prorated: false,
  accrual: 'semiannual' as const,
});

const base = (change = {}) => basePay(household({ extraPays: null, ...change }), DEPS.minimumWage);

describe('the year of pay', () => {
  it.each([
    ['no monthly pay', { monthlyCash: null }, null],
    ['extra payments apart of an unknown amount', { extraPays: apart(2, null) }, null],
    [
      'extra payments apart of no count',
      { extraPays: apart(0, null) },
      { annual: 18000, raisedToMinimum: false },
    ],
    [
      'extra payments apart, worked out',
      { extraPays: apart(2, 1500) },
      { annual: 21000, raisedToMinimum: false },
    ],
    ['no extra payments', {}, { annual: 18000, raisedToMinimum: false }],
  ])('with %s', (_name, change, expected) => {
    expect(base(change)).toEqual(expected);
  });
});

describe('the base against the minimum wage of 17.094 € for a full week', () => {
  it.each([
    ['a year with no decree loaded', { payYear: 2027, monthlyCash: 100 }, 1200, false],
    ['hours not known', { weeklyHours: null, monthlyCash: 100 }, 1200, false],
    ['exactly the minimum', { monthlyCash: 1424.5 }, 17094, false],
    ['below the minimum', { monthlyCash: 1400 }, 17094, true],
    [
      'half a week below its half of the minimum',
      { weeklyHours: 20, monthlyCash: 500 },
      8547,
      true,
    ],
    [
      'more than a full week, which the minimum does not scale up',
      { weeklyHours: 50, monthlyCash: 500 },
      17094,
      true,
    ],
    [
      'pay in kind that takes it above the minimum',
      { monthlyCash: 1400, inKindMonthly: 100 },
      16800,
      false,
    ],
    [
      'pay in kind that leaves it below, so the money is raised by the rest',
      { monthlyCash: 1000, inKindMonthly: 100 },
      15894,
      true,
    ],
  ])('with %s', (_name, change, annual, raisedToMinimum) => {
    expect(base(change)).toEqual({ annual, raisedToMinimum });
  });
});
