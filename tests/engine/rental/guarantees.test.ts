import { describe, expect, it } from 'vitest';
import { parseDate as f } from '../../../src/engine/date';
import { NORMS } from '../../../src/engine/rental/data/norms';
import { checkAdvance, checkGuarantees } from '../../../src/engine/rental/guarantees';
import { itemAmount, type ItemResult } from '../../../src/engine/rental/item';
import { countedAmount } from '../../../src/engine/rental/outcome';
import type { Guarantee, RentalInput } from '../../../src/engine/rental/types';
import { contract } from './fixtures';

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

  it('nothing entered', () => {
    expect(money({ deposit: null, guarantees: [] })).toEqual({
      status: 'not_entered',
      amount: null,
    });
  });
});

describe('guarantees that are not money', () => {
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

  it('an insurance required from 08-10-2026 is over the cap with no figure, pending validation', () => {
    const [r] = others({
      signedOn: f('2026-10-08'),
      startDate: f('2026-10-15'),
      guarantees: [{ kind: 'insurance', amount: 300 }],
    });
    if (r?.outcome.kind !== 'depends') throw new Error('expected depends');
    expect(r.outcome.reasons).toEqual(['pending_validation']);
    expect(r.outcome.readings.map((x) => x.value.status).sort()).toEqual(['over_cap', 'review_it']);
    expect(r.outcome.readings.every((x) => x.value.amount === null)).toBe(true);
    expect(countedAmount(r.outcome, itemAmount)).toBe(0);
    expect(r.sources.find((s) => s.id === 'insurance_ban')?.status).toBe('pending_validation');
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
