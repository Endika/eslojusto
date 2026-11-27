import { describe, expect, it } from 'vitest';
import { parseDate as f } from '../../../src/engine/date';
import { NORMS } from '../../../src/engine/rental/data/norms';
import { checkAdvance, checkGuarantees } from '../../../src/engine/rental/guarantees';
import { itemAmount, type ItemResult } from '../../../src/engine/rental/item';
import { countedAmount } from '../../../src/engine/rental/outcome';
import type { Guarantee, RentalInput } from '../../../src/engine/rental/types';
import { contract, readingOf } from './fixtures';
import { NORMS_BEFORE_VOTE } from './norms-before-vote';

const RENT = 850;
const input = (change: Partial<RentalInput>): RentalInput =>
  contract({ initialRent: RENT, deposit: RENT, agreedMonths: 36, ...change });
const cash = (amount: number): Guarantee => ({ kind: 'cash', amount });

const singleOf = (r: ItemResult | undefined) => {
  if (r?.outcome.kind !== 'single') throw new Error('expected single');
  return { status: r.outcome.value.status, amount: r.outcome.value.amount };
};
const money = (change: Partial<RentalInput>) =>
  singleOf(checkGuarantees(input(change), NORMS).find((r) => r.kind === 'guarantees'));
const others = (change: Partial<RentalInput>) =>
  checkGuarantees(input(change), NORMS).filter((r) => r.kind === 'guarantee');

describe('deposit and extra guarantees in money', () => {
  it('two months of deposit and two more in cash over three years: one month over the cap', () => {
    // Deposit 1.700 = 850 deposit + 850 extra; extra money 850 + 1.700 = 2.550; cap 2 × 850 = 1.700.
    expect(money({ deposit: 2 * RENT, guarantees: [cash(2 * RENT)] })).toEqual({
      status: 'over_cap',
      amount: RENT,
    });
  });

  it('the same over six years with a person as landlord has no cap', () => {
    expect(money({ deposit: 2 * RENT, guarantees: [cash(2 * RENT)], agreedMonths: 72 })).toEqual({
      status: 'not_applicable_to_date',
      amount: null,
    });
  });

  it('a company landlord keeps the cap up to seven years', () => {
    const company = { landlordType: 'company' as const, deposit: 2 * RENT };
    expect(money({ ...company, guarantees: [cash(2 * RENT)], agreedMonths: 84 })).toEqual({
      status: 'over_cap',
      amount: RENT,
    });
    expect(money({ ...company, guarantees: [cash(2 * RENT)], agreedMonths: 85 }).status).toBe(
      'not_applicable_to_date',
    );
  });

  it.each([
    [60, 'over_cap'],
    [61, 'not_applicable_to_date'],
  ] as const)('a person landlord, %i months agreed → %s', (agreedMonths, status) => {
    expect(money({ deposit: RENT, guarantees: [cash(3 * RENT)], agreedMonths }).status).toBe(
      status,
    );
  });

  it('up to two months of extra money is within the cap', () => {
    expect(money({ guarantees: [cash(1000), cash(700)] })).toEqual({
      status: 'within_limit',
      amount: null,
    });
    // A cent of rounding is not a difference.
    expect(money({ guarantees: [cash(1700.01)] }).status).toBe('within_limit');
  });
});

describe('guarantees that are not money', () => {
  it('make the money item say that only money was compared', () => {
    const results = checkGuarantees(
      input({
        deposit: RENT,
        guarantees: [cash(2 * RENT), { kind: 'bank_guarantee', amount: 6000 }],
      }),
      NORMS,
    );
    const moneyItem = results.find((r) => r.kind === 'guarantees');
    if (moneyItem?.outcome.kind !== 'single') throw new Error('expected single');
    expect(moneyItem.outcome.value.status).toBe('within_limit');
    expect(moneyItem.outcome.value.calculation.map((x) => x.key)).toEqual([
      'guarantees.money',
      'guarantees.only_money_compared',
      'guarantees.within_cap',
    ]);
    const plain = checkGuarantees(input({ guarantees: [cash(RENT)] }), NORMS)[0];
    if (plain?.outcome.kind !== 'single') throw new Error('expected single');
    expect(plain.outcome.value.calculation.map((x) => x.key)).not.toContain(
      'guarantees.only_money_compared',
    );
  });

  it('a bank guarantee is left to look at, with no figure; past the capped years, not applicable', () => {
    const [aval] = others({ guarantees: [{ kind: 'bank_guarantee', amount: 5000 }] });
    expect(singleOf(aval)).toEqual({ status: 'review_it', amount: null });
    const [late] = others({
      guarantees: [{ kind: 'bank_guarantee', amount: 5000 }],
      agreedMonths: 120,
    });
    expect(singleOf(late).status).toBe('not_applicable_to_date');
  });

  it('cash with no amount is not entered and stays out of the money compared', () => {
    const results = checkGuarantees(input({ guarantees: [{ kind: 'cash', amount: null }] }), NORMS);
    expect(results.map((r) => [r.kind, r.index])).toEqual([
      ['guarantees', null],
      ['guarantee', 0],
    ]);
    expect(singleOf(results[1]).status).toBe('not_entered');
  });

  it('an insurance before 08-10-2026 is left to look at', () => {
    const [r] = others({
      signedOn: f('2026-10-07'),
      startDate: f('2026-10-07'),
      guarantees: [{ kind: 'insurance', amount: null }],
    });
    expect(singleOf(r)).toEqual({ status: 'review_it', amount: null });
  });

  const insured = input({
    signedOn: f('2026-10-08'),
    startDate: f('2026-10-15'),
    guarantees: [{ kind: 'insurance', amount: 300 }],
  });

  it('an insurance required from 08-10-2026 is over the cap with no figure, pending validation', () => {
    const [r] = checkGuarantees(insured, NORMS_BEFORE_VOTE).filter((x) => x.kind === 'guarantee');
    if (r?.outcome.kind !== 'depends') throw new Error('expected depends');
    expect(r.outcome.reasons).toEqual(['pending_validation']);
    expect(r.outcome.readings.map((x) => x.value.status).sort()).toEqual(['over_cap', 'review_it']);
    expect(r.outcome.readings.every((x) => x.value.amount === null)).toBe(true);
    expect(countedAmount(r.outcome, itemAmount)).toBe(0);
    expect(r.sources.find((s) => s.id === 'insurance_ban')?.status).toBe('pending_validation');
  });

  it('an insurance required from 08-10-2026 is over the cap with a single reading once validated', () => {
    const [r] = checkGuarantees(insured, NORMS).filter((x) => x.kind === 'guarantee');
    expect(singleOf(r)).toEqual({ status: 'over_cap', amount: null });
    expect(r?.sources.find((s) => s.id === 'insurance_ban')?.status).toBe('in_force');
  });
});

describe('rent paid in advance', () => {
  const advance = (advanceMonths: number | null) =>
    singleOf(checkAdvance(input({ advanceMonths }), NORMS));

  it.each([
    [null, 'not_entered', null],
    [0, 'within_limit', null],
    [1, 'within_limit', null],
    // (3 − 1) × 850 = 1.700.
    [3, 'over_cap', 1700],
  ] as const)('%s months → %s', (months, status, amount) => {
    expect(advance(months)).toEqual({ status, amount });
  });
});

describe('how each guarantee reading is worded and sourced', () => {
  const MONEY_RULES = ['deposit_one_month', 'guarantee_cap'];
  const LONG = (months: number, limit: number) => ({
    key: 'guarantees.long_contract',
    vars: { months: { integer: months }, limit: { integer: limit } },
  });
  const MONEY = (money: number, cap: number) => ({
    key: 'guarantees.money',
    vars: { money: { euros: money }, cap: { euros: cap } },
  });
  const EXCESS = (deposit: number, excess: number) => ({
    key: 'guarantees.deposit_excess',
    vars: { deposit: { euros: deposit }, rent: { euros: RENT }, excess: { euros: excess } },
  });
  const moneyRow = (change: Partial<RentalInput>) =>
    readingOf(checkGuarantees(input(change), NORMS)[0]);
  const BANK: Guarantee = { kind: 'bank_guarantee', amount: 5000 };

  it.each<[string, () => ReturnType<typeof readingOf>, object]>([
    [
      'money over the cap',
      () => moneyRow({ deposit: 2 * RENT, guarantees: [cash(2 * RENT)] }),
      {
        status: 'over_cap',
        amount: RENT,
        calculation: [
          EXCESS(1700, 850),
          MONEY(2550, 1700),
          { key: 'guarantees.over_cap', vars: { amount: { euros: 850 } } },
        ],
        rules: MONEY_RULES,
      },
    ],
    [
      'a deposit a cent over the rent is rounding',
      () => moneyRow({ deposit: RENT + 0.01 }),
      {
        status: 'within_limit',
        amount: null,
        calculation: [MONEY(0.01, 1700), { key: 'guarantees.within_cap' }],
        rules: MONEY_RULES,
      },
    ],
    [
      'a long contract with a deposit over the rent',
      () => moneyRow({ deposit: 2 * RENT, agreedMonths: 72 }),
      {
        status: 'not_applicable_to_date',
        amount: null,
        calculation: [EXCESS(1700, 850), LONG(72, 60)],
        rules: MONEY_RULES,
      },
    ],
    [
      'nothing entered',
      () => moneyRow({ deposit: null, guarantees: [] }),
      {
        status: 'not_entered',
        amount: null,
        calculation: [{ key: 'item.not_entered' }],
        rules: MONEY_RULES,
      },
    ],
    [
      'no deposit and only guarantees that are not money',
      () => moneyRow({ deposit: null, guarantees: [BANK, { kind: 'cash', amount: null }] }),
      {
        status: 'not_entered',
        amount: null,
        calculation: [{ key: 'item.not_entered' }],
        rules: MONEY_RULES,
      },
    ],
    [
      'no deposit and some cash',
      () => moneyRow({ deposit: null, guarantees: [cash(100)] }),
      {
        status: 'within_limit',
        amount: null,
        calculation: [MONEY(100, 1700), { key: 'guarantees.within_cap' }],
        rules: MONEY_RULES,
      },
    ],
  ])('%s', (_, actual, expected) => {
    expect(actual()).toEqual(expected);
  });

  const guaranteeRow = (guarantee: Guarantee, change: Partial<RentalInput> = {}) =>
    readingOf(
      checkGuarantees(input({ guarantees: [guarantee], ...change }), NORMS).find(
        (r) => r.kind === 'guarantee',
      ),
    );
  const AFTER_VOTE = { signedOn: f('2026-10-08'), startDate: f('2026-10-15') };

  it.each<[string, () => ReturnType<typeof readingOf>, object]>([
    [
      'cash with no amount',
      () => guaranteeRow({ kind: 'cash', amount: null }),
      {
        status: 'not_entered',
        amount: null,
        calculation: [{ key: 'item.not_entered' }],
        rules: ['guarantee_cap'],
      },
    ],
    [
      'a bank guarantee',
      () => guaranteeRow(BANK),
      {
        status: 'review_it',
        amount: null,
        calculation: [{ key: 'guarantees.not_money' }],
        rules: ['guarantee_cap'],
      },
    ],
    [
      'an insurance before the ban',
      () =>
        guaranteeRow(
          { kind: 'insurance', amount: null },
          { signedOn: f('2026-10-07'), startDate: f('2026-10-07') },
        ),
      {
        status: 'review_it',
        amount: null,
        calculation: [{ key: 'guarantees.insurance_before_ban' }],
        rules: ['guarantee_cap'],
      },
    ],
    [
      'an insurance before the ban, in a long contract',
      () =>
        guaranteeRow(
          { kind: 'insurance', amount: null },
          { signedOn: f('2026-10-07'), startDate: f('2026-10-07'), agreedMonths: 120 },
        ),
      {
        status: 'not_applicable_to_date',
        amount: null,
        calculation: [LONG(120, 60)],
        rules: ['guarantee_cap'],
      },
    ],
    [
      'an insurance under the ban',
      () => guaranteeRow({ kind: 'insurance', amount: 300 }, AFTER_VOTE),
      {
        status: 'over_cap',
        amount: null,
        calculation: [{ key: 'guarantees.insurance_banned' }],
        rules: ['insurance_ban'],
      },
    ],
  ])('%s', (_, actual, expected) => {
    expect(actual()).toEqual(expected);
  });

  it.each([
    [3, 1700, 'over_cap'],
    [0, null, 'within_limit'],
  ] as const)('rent paid %i months in advance is worded', (months, amount, status) => {
    const calculation =
      amount === null
        ? [{ key: 'advance.within_cap' }]
        : [
            {
              key: 'advance.over_cap',
              vars: {
                months: { integer: months },
                rent: { euros: RENT },
                amount: { euros: amount },
              },
            },
          ];
    expect(readingOf(checkAdvance(input({ advanceMonths: months }), NORMS))).toEqual({
      status,
      amount,
      calculation,
      rules: ['advance_cap'],
    });
  });
});
