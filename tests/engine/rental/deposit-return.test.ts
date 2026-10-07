import { describe, expect, it } from 'vitest';
import { parseDate as f, type CivilDate } from '../../../src/engine/date';
import { LEGAL_INTEREST } from '../../../src/engine/rental/data/legal-interest';
import { NORMS } from '../../../src/engine/rental/data/norms';
import { checkDepositReturn } from '../../../src/engine/rental/deposit-return';
import { itemAmount, type ItemResult } from '../../../src/engine/rental/item';
import { countedAmount, highestAmount, letterAmount } from '../../../src/engine/rental/outcome';
import type { MoveOut } from '../../../src/engine/rental/types';
import { contract } from './fixtures';

const DEPS = { norms: NORMS, legalInterest: LEGAL_INTEREST };
const TODAY = f('2026-10-07');

const check = (deposit: number | null, moveOut: MoveOut, today: CivilDate = TODAY) => {
  const [returned, interest] = checkDepositReturn(contract({ deposit, moveOut }), today, DEPS);
  if (returned === undefined || interest === undefined) throw new Error('expected two items');
  return { returned, interest };
};

const singleOf = (r: ItemResult) => {
  if (r.outcome.kind !== 'single') throw new Error(`expected single, got ${r.outcome.kind}`);
  return { status: r.outcome.value.status, amount: r.outcome.value.amount };
};

const bothBases = (r: ItemResult) => {
  if (r.outcome.kind !== 'depends') throw new Error('expected depends');
  return {
    reasons: r.outcome.reasons,
    low: r.outcome.low.amount,
    high: r.outcome.high.amount,
  };
};

describe('what is still owed of the deposit', () => {
  it('nothing until the keys are back', () => {
    expect(checkDepositReturn(contract({ moveOut: null }), TODAY, DEPS)).toEqual([]);
  });

  it('is the deposit less what came back and what was kept, listing what was kept unweighed', () => {
    const { returned } = check(1000, {
      keysReturnedOn: f('2026-06-30'),
      returns: [{ on: f('2026-07-15'), amount: 700 }],
      deductions: [
        { kind: 'cleaning', amount: 120 },
        { kind: 'damage', amount: 80 },
      ],
    });
    // 1.000 − 700 − 120 − 80 = 100.
    expect(singleOf(returned)).toEqual({ status: 'owed', amount: 100 });
    const keys =
      returned.outcome.kind === 'single'
        ? returned.outcome.value.calculation.map((x) => x.key)
        : [];
    expect(keys).toEqual([
      'deposit.pending',
      'deposit.deduction.cleaning',
      'deposit.deduction.damage',
      'deposit.deductions_not_judged',
      'deposit.owed',
    ]);
  });

  it('with no deposit entered, says so and still works out late returns', () => {
    const { returned, interest } = check(null, {
      keysReturnedOn: f('2026-01-10'),
      returns: [{ on: f('2026-03-01'), amount: 600 }],
      deductions: [],
    });
    expect(singleOf(returned).status).toBe('not_entered');
    expect(interest.outcome.kind).toBe('depends');
  });
});

describe('late-payment interest (LAU art. 36.4)', () => {
  it('keys 15-11-2022, 900 € back on 20-03-2023: two yearly stretches, both day counts', () => {
    // From 15-12-2022, a month after the keys, to 19-03-2023.
    // 2022: 17 days at 3,00 %; 2023: 78 days at 3,25 %.
    // 365: 900 × 0,03 × 17 / 365 + 900 × 0,0325 × 78 / 365 = 1,2575 + 6,2507 = 7,51.
    // 360: 900 × 0,03 × 17 / 360 + 900 × 0,0325 × 78 / 360 = 1,2750 + 6,3375 = 7,61.
    const { returned, interest } = check(
      900,
      {
        keysReturnedOn: f('2022-11-15'),
        returns: [{ on: f('2023-03-20'), amount: 900 }],
        deductions: [],
      },
      f('2023-06-01'),
    );
    expect(singleOf(returned)).toEqual({ status: 'within_limit', amount: null });
    expect(bothBases(interest)).toEqual({ reasons: ['interest_day_count'], low: 7.51, high: 7.61 });
    expect(countedAmount(interest.outcome, itemAmount)).toBe(7.51);
    expect(letterAmount(interest.outcome, itemAmount)).toBe(7.51);
    expect(highestAmount(interest.outcome, itemAmount)).toBe(7.61);
    if (interest.outcome.kind !== 'depends') throw new Error('expected depends');
    expect(
      interest.outcome.low.calculation.filter((x) => x.key === 'deposit.interest_stretch'),
    ).toEqual([
      {
        key: 'deposit.interest_stretch',
        vars: {
          amount: { euros: 900 },
          from: { date: '2022-12-15' },
          to: { date: '2022-12-31' },
          days: { days: 17 },
          rate: { percent: 3 },
          yearDays: { integer: 365 },
          interest: { euros: 1.26 },
        },
      },
      {
        key: 'deposit.interest_stretch',
        vars: {
          amount: { euros: 900 },
          from: { date: '2023-01-01' },
          to: { date: '2023-03-19' },
          days: { days: 78 },
          rate: { percent: 3.25 },
          yearDays: { integer: 365 },
          interest: { euros: 6.25 },
        },
      },
    ]);
  });

  it('a 2024 stretch counts 366 days a year', () => {
    // 1.000 × 0,0325 × 60 / 366 = 5,33 (360: 5,42), from 01-03-2024 to 29-04-2024.
    const { interest } = check(
      1000,
      {
        keysReturnedOn: f('2024-02-01'),
        returns: [{ on: f('2024-04-30'), amount: 1000 }],
        deductions: [],
      },
      f('2024-06-01'),
    );
    expect(bothBases(interest)).toEqual({ reasons: ['interest_day_count'], low: 5.33, high: 5.42 });
  });

  it('a return within the month accrues nothing', () => {
    const { returned, interest } = check(1000, {
      keysReturnedOn: f('2026-01-31'),
      returns: [{ on: f('2026-02-28'), amount: 1000 }],
      deductions: [],
    });
    expect(singleOf(returned)).toEqual({ status: 'within_limit', amount: null });
    expect(singleOf(interest)).toEqual({ status: 'within_limit', amount: null });
  });

  it('a partial late return and a balance still out are two items: the balance and the interest', () => {
    // Keys 10-01-2026; interest from 10-02-2026 at 3,25 %.
    // 600 back on 01-03-2026: 19 days. 400 still out on 07-10-2026: 239 days.
    // 365: 600 × 0,0325 × 19 / 365 + 400 × 0,0325 × 239 / 365 = 1,0151 + 8,5123 = 9,53.
    // 360: 1,0292 + 8,6306 = 9,66.
    const { returned, interest } = check(1000, {
      keysReturnedOn: f('2026-01-10'),
      returns: [{ on: f('2026-03-01'), amount: 600 }],
      deductions: [],
    });
    expect(singleOf(returned)).toEqual({ status: 'owed', amount: 400 });
    expect(bothBases(interest)).toEqual({ reasons: ['interest_day_count'], low: 9.53, high: 9.66 });
  });

  it('a balance still within its month accrues nothing yet', () => {
    const { returned, interest } = check(1000, {
      keysReturnedOn: f('2026-09-20'),
      returns: [],
      deductions: [],
    });
    expect(singleOf(returned)).toEqual({ status: 'owed', amount: 1000 });
    expect(singleOf(interest)).toEqual({ status: 'within_limit', amount: null });
  });

  it('a year with no legal interest rate loaded is not checkable', () => {
    const [, interest] = checkDepositReturn(
      contract({
        deposit: 1000,
        moveOut: { keysReturnedOn: f('2026-11-10'), returns: [], deductions: [] },
      }),
      f('2027-03-01'),
      DEPS,
    );
    if (interest === undefined) throw new Error('expected interest');
    expect(singleOf(interest).status).toBe('not_checkable');
  });
});
