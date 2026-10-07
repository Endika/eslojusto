import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonthsClamped,
  compareDates,
  daysInYear,
  fromOrdinal,
  ordinal,
  parseDate as f,
  type CivilDate,
} from '../../../src/engine/date';
import { RENTAL_TABLES } from '../../../src/engine/rental/data/tables';
import { reviewRental } from '../../../src/engine/rental/review';
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
    // The month runs date to date to 15-12-2022; interest from 16-12-2022 to 19-03-2023.
    // 2022: 16 days at 3,00 %; 2023: 78 days at 3,25 %.
    // 365: 900 × 0,03 × 16 / 365 + 900 × 0,0325 × 78 / 365 = 1,1836 + 6,2507 = 7,43.
    // 360: 900 × 0,03 × 16 / 360 + 900 × 0,0325 × 78 / 360 = 1,2000 + 6,3375 = 7,54.
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
    expect(bothBases(interest)).toEqual({ reasons: ['interest_day_count'], low: 7.43, high: 7.54 });
    expect(countedAmount(interest.outcome, itemAmount)).toBe(7.43);
    expect(letterAmount(interest.outcome, itemAmount)).toBe(7.43);
    expect(highestAmount(interest.outcome, itemAmount)).toBe(7.54);
    if (interest.outcome.kind !== 'depends') throw new Error('expected depends');
    expect(
      interest.outcome.low.calculation.filter((x) => x.key === 'deposit.interest_stretch'),
    ).toEqual([
      {
        key: 'deposit.interest_stretch',
        vars: {
          amount: { euros: 900 },
          from: { date: '2022-12-16' },
          to: { date: '2022-12-31' },
          days: { days: 16 },
          rate: { percent: 3 },
          yearDays: { integer: 365 },
          interest: { euros: 1.18 },
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

  it('accrues on one month of deposit only: two months returned late accrue on one', () => {
    // Rent 1.000 (the fixture's), deposit 2.000 back on 10-07-2025, keys 10-01-2025: 1.000 accrues
    // from 11-02-2025 for 149 days at 3,25 %: 1.000 × 0,0325 × 149 / 365 = 13,27 (360: 13,45).
    const { interest } = check(2000, {
      keysReturnedOn: f('2025-01-10'),
      returns: [{ on: f('2025-07-10'), amount: 2000 }],
      deductions: [],
    });
    expect(bothBases(interest)).toEqual({
      reasons: ['interest_day_count'],
      low: 13.27,
      high: 13.45,
    });
  });

  it('takes the part above the month as the money that would accrue longest', () => {
    // Deposit 1.500 of a 1.000 rent; 300 kept, 400 back on time, 800 back late on 12-03-2025. The
    // 500 above the month go on the late 800 first, so 300 accrue from 11-02-2025 to 11-03-2025:
    // 300 × 0,0325 × 29 / 365 = 0,77.
    const { interest } = check(1500, {
      keysReturnedOn: f('2025-01-10'),
      returns: [
        { on: f('2025-03-12'), amount: 800 },
        { on: f('2025-01-20'), amount: 400 },
      ],
      deductions: [{ kind: 'cleaning', amount: 300 }],
    });
    expect(bothBases(interest).low).toBe(0.77);
  });

  it('two months back, one on time and one late, accrue nothing and open no pass', () => {
    const input = contract({
      deposit: 2000,
      moveOut: {
        keysReturnedOn: f('2025-01-10'),
        returns: [
          { on: f('2025-01-20'), amount: 1000 },
          { on: f('2025-07-10'), amount: 1000 },
        ],
        deductions: [],
      },
    });
    const [, interest] = checkDepositReturn(input, TODAY, DEPS);
    if (interest === undefined) throw new Error('expected interest');
    expect(singleOf(interest)).toEqual({ status: 'within_limit', amount: null });
    const r = reviewRental(input, TODAY, RENTAL_TABLES);
    expect(r.ok && r.review.offerPass).toBe(false);
  });

  it('a deduction leaves the part above the month on the late return', () => {
    // Deposit 1.500 of a 1.000 rent, 500 kept, 1.000 back on 10-07-2025: 500 accrue from
    // 11-02-2025 for 149 days: 500 × 0,0325 × 149 / 365 = 6,63.
    const { interest } = check(1500, {
      keysReturnedOn: f('2025-01-10'),
      returns: [{ on: f('2025-07-10'), amount: 1000 }],
      deductions: [{ kind: 'damage', amount: 500 }],
    });
    expect(bothBases(interest).low).toBe(6.63);
  });

  it('a 2024 stretch counts 366 days a year', () => {
    // 1.000 × 0,0325 × 59 / 366 = 5,24 (360: 5,33), from 02-03-2024 to 29-04-2024.
    const { interest } = check(
      1000,
      {
        keysReturnedOn: f('2024-02-01'),
        returns: [{ on: f('2024-04-30'), amount: 1000 }],
        deductions: [],
      },
      f('2024-06-01'),
    );
    expect(bothBases(interest)).toEqual({ reasons: ['interest_day_count'], low: 5.24, high: 5.33 });
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
    // Keys 10-01-2026; interest from 11-02-2026 at 3,25 %.
    // 600 back on 01-03-2026: 18 days. 400 still out on 07-10-2026: 238 days.
    // 365: 600 × 0,0325 × 18 / 365 + 400 × 0,0325 × 238 / 365 = 0,9616 + 8,4767 = 9,44.
    // 360: 0,9750 + 8,5944 = 9,57.
    const { returned, interest } = check(1000, {
      keysReturnedOn: f('2026-01-10'),
      returns: [{ on: f('2026-03-01'), amount: 600 }],
      deductions: [],
    });
    expect(singleOf(returned)).toEqual({ status: 'owed', amount: 400 });
    expect(bothBases(interest)).toEqual({ reasons: ['interest_day_count'], low: 9.44, high: 9.57 });
  });

  it('a balance still within its month is not due yet and accrues nothing', () => {
    const { returned, interest } = check(1000, {
      keysReturnedOn: f('2026-09-20'),
      returns: [],
      deductions: [],
    });
    expect(singleOf(returned)).toEqual({ status: 'not_yet_due', amount: null });
    expect(singleOf(interest)).toEqual({ status: 'within_limit', amount: null });
    expect(returned.outcome.kind === 'single' && returned.outcome.value.calculation.at(-1)).toEqual(
      { key: 'deposit.not_yet_due', vars: { due: { date: '2026-10-20' } } },
    );
    // On the day the month runs out it is still not due; the day after, it is owed.
    const lastDay = check(
      1000,
      { keysReturnedOn: f('2026-09-20'), returns: [], deductions: [] },
      f('2026-10-20'),
    );
    expect(singleOf(lastDay.returned).status).toBe('not_yet_due');
    const late = check(
      1000,
      { keysReturnedOn: f('2026-09-20'), returns: [], deductions: [] },
      f('2026-10-21'),
    );
    expect(singleOf(late.returned)).toEqual({ status: 'owed', amount: 1000 });
  });

  it.each([
    ['2026-09-07', '2026-10-07', 'not_yet_due'],
    ['2026-09-07', '2026-10-08', 'owed'],
    ['2026-01-31', '2026-02-28', 'not_yet_due'],
    ['2026-01-31', '2026-03-01', 'owed'],
  ] as const)('keys on %s, today %s: %s', (keys, today, status) => {
    const { returned, interest } = check(
      1000,
      { keysReturnedOn: f(keys), returns: [], deductions: [] },
      f(today),
    );
    expect(singleOf(returned).status).toBe(status);
    expect(singleOf(interest)).toEqual({ status: 'within_limit', amount: null });
  });

  it('a year with no legal interest rate loaded counts up to the last known year', () => {
    // Interest from 11-12-2026: 21 days of 2026 at 3,25 % on 1.000 = 1,87 (360: 1,90); 2027 has no
    // rate loaded, so the rest is not checkable.
    const [, interest] = checkDepositReturn(
      contract({
        deposit: 1000,
        moveOut: { keysReturnedOn: f('2026-11-10'), returns: [], deductions: [] },
      }),
      f('2027-03-01'),
      DEPS,
    );
    if (interest === undefined) throw new Error('expected interest');
    expect(bothBases(interest)).toEqual({ reasons: ['interest_day_count'], low: 1.87, high: 1.9 });
    if (interest.outcome.kind !== 'depends') throw new Error('expected depends');
    expect(interest.outcome.low.calculation.at(-1)).toEqual({
      key: 'deposit.interest_rate_not_loaded',
      vars: { year: { integer: 2027 } },
    });
    const [, unknown] = checkDepositReturn(
      contract({
        deposit: 1000,
        moveOut: { keysReturnedOn: f('2027-01-10'), returns: [], deductions: [] },
      }),
      f('2027-06-01'),
      DEPS,
    );
    if (unknown === undefined) throw new Error('expected interest');
    expect(singleOf(unknown).status).toBe('not_checkable');
  });
});

describe('a deposit taken as at least what came back and was kept', () => {
  const lastKey = (r: ItemResult) =>
    r.outcome.kind === 'single' ? r.outcome.value.calculation.at(-1)?.key : undefined;

  it('with no deposit entered, 2.000 back accrue on one month only', () => {
    // Rent 1.000; keys 10-06-2025; 2.000 back on 01-09-2025: 1.000 accrue from 11-07-2025 for 52
    // days: 1.000 × 0,0325 × 52 / 365 = 4,63.
    const { interest } = check(
      null,
      {
        keysReturnedOn: f('2025-06-10'),
        returns: [{ on: f('2025-09-01'), amount: 2000 }],
        deductions: [],
      },
      f('2026-06-01'),
    );
    expect(bothBases(interest).low).toBe(4.63);
  });

  it('with no deposit entered, a late 500 under 1.500 kept accrues nothing and opens no pass', () => {
    const moveOut: MoveOut = {
      keysReturnedOn: f('2025-06-10'),
      returns: [{ on: f('2025-09-01'), amount: 500 }],
      deductions: [{ kind: 'damage', amount: 1500 }],
    };
    const { interest } = check(null, moveOut, f('2026-06-01'));
    expect(singleOf(interest)).toEqual({ status: 'within_limit', amount: null });
    expect(lastKey(interest)).toBe('deposit.late_part_above_month');
    const r = reviewRental(contract({ deposit: null, moveOut }), f('2026-06-01'), RENTAL_TABLES);
    expect(r.ok && r.review.offerPass).toBe(false);
  });

  it('more back than the deposit entered still accrues on one month only', () => {
    // Deposit entered 1.000 = rent, 1.500 back late on 10-07-2025: 1.000 accrue for 149 days.
    const { interest } = check(1000, {
      keysReturnedOn: f('2025-01-10'),
      returns: [{ on: f('2025-07-10'), amount: 1500 }],
      deductions: [],
    });
    expect(bothBases(interest).low).toBe(13.27);
  });

  it('says the late money was the part above one month when it accrues nothing', () => {
    const { interest } = check(2000, {
      keysReturnedOn: f('2025-01-10'),
      returns: [
        { on: f('2025-01-20'), amount: 1000 },
        { on: f('2025-07-10'), amount: 1000 },
      ],
      deductions: [],
    });
    expect(lastKey(interest)).toBe('deposit.late_part_above_month');
  });

  it('with no deposit and nothing back, has nothing entered', () => {
    const { interest } = check(null, {
      keysReturnedOn: f('2025-06-10'),
      returns: [],
      deductions: [],
    });
    expect(singleOf(interest).status).toBe('not_entered');
  });

  it('a return the day after the month accrues no day yet and is not called on time', () => {
    const { interest } = check(1000, {
      keysReturnedOn: f('2026-01-10'),
      returns: [{ on: f('2026-02-11'), amount: 1000 }],
      deductions: [],
    });
    expect(singleOf(interest)).toEqual({ status: 'within_limit', amount: null });
    expect(lastKey(interest)).toBe('deposit.returned_after_month');
  });
});

describe('the part of the deposit above one month', () => {
  // mulberry32: small, seeded and deterministic.
  function prng(seed: number) {
    let a = seed;
    const r = () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
    return { r, int };
  }

  // Interest on 365 (366) days a year on `amount` from the day after the month to `until`,
  // counted day by day, independent of the engine.
  const accrued = (amount: number, keys: CivilDate, until: CivilDate): number => {
    let total = 0;
    for (
      let d = addDays(addMonthsClamped(keys, 1), 1);
      compareDates(d, until) < 0;
      d = addDays(d, 1)
    ) {
      const rate = LEGAL_INTEREST.find((y) => y.year === d.y)?.rate ?? NaN;
      total += (amount * rate) / 100 / daysInYear(d.y);
    }
    return total;
  };

  it('is never put where another split would give less interest', () => {
    const g = prng(36042026);
    const rent = 1000;
    let checked = 0;
    for (let k = 0; k < 150; k++) {
      // A deposit not entered, or one below what comes back, as people misremember it.
      const entered = g.r() < 0.2 ? null : g.int(1000, 3000);
      const overReturn = g.r() < 0.25 ? 1500 : 0;
      const keys = fromOrdinal(ordinal(f('2023-01-01')) + g.int(0, 1200));
      const span = ordinal(TODAY) - ordinal(keys);
      const returns: { on: CivilDate; amount: number }[] = [];
      let left = (entered ?? 2000) + overReturn;
      for (let n = g.int(0, 3); n > 0 && left > 0; n--) {
        const amount = g.int(1, left);
        returns.push({ on: fromOrdinal(ordinal(keys) + g.int(0, span)), amount });
        left -= amount;
      }
      const deducted = left > 0 && g.r() < 0.4 ? g.int(1, left) : 0;
      const deductions = deducted > 0 ? [{ kind: 'other' as const, amount: deducted }] : [];
      const out: MoveOut = { keysReturnedOn: keys, returns, deductions };
      const { interest } = check(entered, out);
      const counted = countedAmount(interest.outcome, itemAmount);

      // Every piece of money with how long it would accrue; the above-month part is split at random.
      const back = returns.reduce((s, r) => s + r.amount, 0) + deducted;
      const pending = entered === null ? 0 : entered - back;
      const deposit = Math.max(entered ?? 0, back);
      const pieces = [
        ...returns.map((r) => ({ amount: r.amount, until: r.on })),
        ...(pending > 0 ? [{ amount: pending, until: TODAY }] : []),
        ...(deducted > 0 ? [{ amount: deducted, until: keys }] : []),
      ];
      for (let t = 0; t < 20; t++) {
        let above = Math.max(0, deposit - rent);
        const order = pieces.map((p, i) => ({ p, key: g.r(), i })).sort((a, b) => a.key - b.key);
        let other = 0;
        for (const { p } of order) {
          const kept = Math.min(p.amount, above, g.r() < 0.5 ? p.amount : g.int(0, p.amount));
          above -= kept;
          other += accrued(p.amount - kept, keys, p.until);
        }
        // Whatever is left of the part above the month goes on the remaining money, in turn.
        if (above > 0) continue;
        expect(counted, JSON.stringify(out)).toBeLessThanOrEqual(
          Math.round(other * 100) / 100 + 0.01,
        );
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(400);
  });
});
