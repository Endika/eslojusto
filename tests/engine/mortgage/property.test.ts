import { describe, expect, it } from 'vitest';
import { addDays, compareDates, parseDate } from '../../../src/engine/date';
import type { SourceTable } from '../../../src/engine/mortgage/norms';
import { reviewMortgage, type MortgageReview } from '../../../src/engine/mortgage/review';
import {
  CLAUSE_LABELS,
  INVOICE_KINDS,
  type Clause,
  type MortgageDeps,
  type MortgageInput,
  type Operation,
} from '../../../src/engine/mortgage/types';
import { DEPS, invoice, mortgage, READ_DEPS, TODAY } from './input';

const CASES = 300;

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
  const pick = <T>(xs: readonly T[]): T => xs[int(0, xs.length - 1)] as T;
  return { r, int, pick };
}

type Gen = ReturnType<typeof prng>;

const FIRST_DEED = parseDate('1996-01-01');

// An optional figure, present or left out.
const maybe = <K extends string, V>(g: Gen, key: K, value: V): Partial<Record<K, V>> =>
  g.pick([true, false]) ? ({ [key]: value } as Record<K, V>) : {};

function randomClause(g: Gen): Clause {
  return {
    label: g.pick(CLAUSE_LABELS),
    present: g.pick([true, true, false, null]),
    ...maybe(g, 'floorPercent', g.pick([0, g.int(1, 500) / 100])),
    ...maybe(g, 'defaultRate', g.int(0, 2_500) / 100),
    ...maybe(g, 'ordinaryRate', g.int(0, 800) / 100),
    ...maybe(g, 'missedInstalments', g.int(1, 24)),
    ...maybe(g, 'duplicateFee', g.pick([true, false])),
    ...maybe(g, 'feeAmount', g.int(1, 5_000)),
  };
}

function randomInput(g: Gen): MortgageInput {
  const deedOn = addDays(FIRST_DEED, g.int(0, compareDates(TODAY, FIRST_DEED) - 1));
  const daysLeft = compareDates(TODAY, deedOn);
  const operation = (): Operation => ({
    on: addDays(deedOn, g.int(0, daysLeft)),
    kind: g.pick([
      'partial_prepayment',
      'full_prepayment',
      'fixed_rate_novation',
      'creditor_subrogation',
    ] as const),
    principal: g.int(1_000, 200_000),
    feeCharged: g.int(0, 4_000),
    hadInsurance: g.pick([true, false, null]),
  });
  return mortgage({
    deedOn,
    consumer: g.pick([true, false, null]),
    rateType: g.pick(['fixed', 'variable', 'mixed'] as const),
    rateRevisionMonths: g.pick([null, 6, 12, 24]),
    loanAmount: g.pick([null, g.int(30_000, 400_000)]),
    expensesClause: g.pick(['present', 'absent', 'unknown'] as const),
    invoices: Array.from({ length: g.int(0, 5) }, () =>
      invoice(g.pick(INVOICE_KINDS), g.pick([null, g.int(20, 3_000)]), {
        paidBy: g.pick(['me', 'me', 'bank', 'unknown'] as const),
        paidOn: g.pick([null, addDays(deedOn, g.int(0, Math.min(30, daysLeft)))]),
        mixed: g.pick([false, false, true]),
      }),
    ),
    alreadyReturned: g.pick([null, 0, g.int(1, 500)]),
    agreementOnExpenses: g.pick([true, false, null]),
    prepaymentOption: g.pick([null, 'a_015_5y', 'b_025_3y', 'unknown'] as const),
    operations: Array.from({ length: g.int(0, 2) }, operation),
    clauses: Array.from({ length: g.int(0, 4) }, () => randomClause(g)),
  });
}

const reviewOf = (input: MortgageInput, deps: MortgageDeps): MortgageReview => {
  const result = reviewMortgage(input, TODAY, deps);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.review;
};

// What rests on the law: the statute costs, their line and every fee.
const statuteSide = (r: MortgageReview) => ({
  expenses: r.expenses.items.filter((i) => i.basis === 'statute'),
  statute: r.totals.statute,
  fees: r.fees,
  feeTotal: r.totals.fees,
});

// The case-law sources as a later reading might leave them: each one read or unread, reread on
// another day.
function alteredSources(g: Gen): SourceTable {
  return Object.fromEntries(
    Object.entries(DEPS.sources).map(([id, s]) => [
      id,
      { ...s, verified: g.pick([true, false]), lastVerified: g.pick(['2026-07-01', '2026-10-07']) },
    ]),
  ) as SourceTable;
}

describe('mortgage review properties', () => {
  it('flags alone never offer the pass', () => {
    const g = prng(16_06_2019);
    for (let n = 0; n < CASES; n++) {
      const input = { ...randomInput(g), invoices: [], operations: [] };
      expect(reviewOf(input, DEPS).offerPass, JSON.stringify(input)).toBe(false);
      expect(reviewOf(input, READ_DEPS).offerPass, JSON.stringify(input)).toBe(false);
    }
  });

  it('changing a case-law source never changes what rests on the law', () => {
    const g = prng(10_11_2018);
    for (let n = 0; n < CASES; n++) {
      const input = randomInput(g);
      const before = statuteSide(reviewOf(input, DEPS));
      const after = statuteSide(reviewOf(input, { ...READ_DEPS, sources: alteredSources(g) }));
      expect(after, JSON.stringify(input)).toEqual(before);
    }
  });

  it('the pass follows a counted figure, and a fee total never counts more than its highest reading', () => {
    const g = prng(24_11_2022);
    for (let n = 0; n < CASES; n++) {
      const input = randomInput(g);
      for (const deps of [DEPS, READ_DEPS]) {
        const r = reviewOf(input, deps);
        const counted =
          r.totals.statute.principal > 0 ||
          r.totals.caseLaw.principal > 0 ||
          r.totals.fees.counted > 0 ||
          r.expenses.items.some((i) => i.status === 'not_chargeable' && (i.amount ?? 0) > 0);
        expect(r.offerPass, JSON.stringify(input)).toBe(counted);
        expect(r.totals.fees.counted).toBeLessThanOrEqual(r.totals.fees.upTo);
      }
    }
  });

  it('never gives a case-law figure while the rulings behind it are unread', () => {
    const g = prng(27_01_2021);
    for (let n = 0; n < CASES; n++) {
      const r = reviewOf(randomInput(g), DEPS);
      expect(r.totals.caseLaw).toEqual({ principal: 0, interest: null });
    }
  });
});
