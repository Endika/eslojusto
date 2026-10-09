import { describe, expect, expectTypeOf, it } from 'vitest';
import { parseDate } from '../../../src/engine/date';
import { reviewExpenses } from '../../../src/engine/mortgage/expenses';
import {
  basisTotals,
  type BasisAmounts,
  type BasisTotals,
} from '../../../src/engine/mortgage/totals';
import { invoice, mortgage, READ_DEPS, TODAY } from './input';

// Every number anywhere inside `value`.
const numbers = (value: unknown): number[] => {
  if (typeof value === 'number') return [value];
  if (typeof value !== 'object' || value === null) return [];
  return Object.values(value).flatMap(numbers);
};

describe('totals by basis', () => {
  it('have a line by law and a line by case law, and no field that adds them', () => {
    expectTypeOf<keyof BasisTotals>().toEqualTypeOf<'statute' | 'caseLaw'>();
    expectTypeOf<keyof BasisAmounts>().toEqualTypeOf<'principal' | 'interest'>();
    expectTypeOf<BasisTotals['statute']['interest']>().toEqualTypeOf<null>();
    expect(Object.keys(basisTotals([], 0))).toEqual(['statute', 'caseLaw']);
  });

  it('never show the two lines added up anywhere in the review', () => {
    const deed = parseDate('2018-12-14');
    const r = reviewExpenses(
      mortgage({
        deedOn: deed,
        invoices: [
          invoice('notary_loan', 612.4, { paidOn: deed }),
          invoice('registry_mortgage', 389.15, { paidOn: deed }),
          invoice('ajd_loan', 1_523.7, { paidOn: deed }),
        ],
      }),
      TODAY,
      READ_DEPS,
    );
    const { statute, caseLaw } = r.totals;
    // 612,40 × 50 % + 389,15.
    expect([statute.principal, caseLaw.principal]).toEqual([1_523.7, 695.35]);
    // Interest rests on a court's criterion, so only the case-law line carries it.
    expect(statute.interest).toBeNull();
    const courtInterest = caseLaw.interest?.amount ?? 0;
    expect(courtInterest).toBeGreaterThan(0);
    const added = [
      statute.principal + caseLaw.principal,
      statute.principal + caseLaw.principal + courtInterest,
    ].map((x) => Math.round(x * 100) / 100);
    for (const n of numbers(r)) expect(added).not.toContain(Math.round(n * 100) / 100);
  });

  it('leave the interest out of a line when one of its items has none', () => {
    const totals = basisTotals(
      [
        {
          index: 0,
          kind: 'registry_mortgage',
          basis: 'case_law',
          status: 'lender_bears',
          share: 100,
          amount: 100,
          interest: { amount: 5, until: '2026-10-08', estimated: false, missingYear: null },
          calculation: [],
          sources: [],
        },
        {
          index: 1,
          kind: 'notary_loan',
          basis: 'case_law',
          status: 'lender_bears',
          share: 100,
          amount: 50,
          interest: null,
          calculation: [],
          sources: [],
        },
      ],
      0,
    );
    expect(totals.caseLaw).toEqual({ principal: 150, interest: null });
  });

  it('never fall below zero when more came back than a line holds', () => {
    expect(basisTotals([], 300)).toEqual({
      statute: { principal: 0, interest: null },
      caseLaw: { principal: 0, interest: null },
    });
  });
});
