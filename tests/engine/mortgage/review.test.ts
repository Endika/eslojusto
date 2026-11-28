import { describe, expect, expectTypeOf, it } from 'vitest';
import { parseDate } from '../../../src/engine/date';
import {
  reviewMortgage,
  type MortgageReview,
  type MortgageTotals,
} from '../../../src/engine/mortgage/review';
import type { MortgageDeps, MortgageInput } from '../../../src/engine/mortgage/types';
import { DEPS, invoice, mortgage, TODAY, UNREAD_DEPS } from './input';

const d = parseDate;

const reviewOf = (change: Partial<MortgageInput>, deps: MortgageDeps = DEPS): MortgageReview => {
  const result = reviewMortgage(mortgage(change), TODAY, deps);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.review;
};

const paid = (deedOn: string) => ({ paidOn: d(deedOn) });

// A 2021 deed: everything by law, the valuation the borrower's, and the notary's record charged.
const deed2021 = (): Partial<MortgageInput> => ({
  deedOn: d('2021-05-10'),
  invoices: [
    invoice('notary_loan', 700, paid('2021-05-10')),
    invoice('registry_mortgage', 450, paid('2021-05-10')),
    invoice('agency', 350, paid('2021-05-10')),
    invoice('valuation', 400, paid('2021-04-20')),
    invoice('ajd_loan', 1_200, paid('2021-05-10')),
    invoice('transparency_deed', 60, paid('2021-05-09')),
  ],
  prepaymentOption: 'a_015_5y',
  operations: [
    {
      on: d('2022-03-01'),
      kind: 'partial_prepayment',
      principal: 20_000,
      feeCharged: 100,
      hadInsurance: null,
    },
  ],
  clauses: [{ label: 'floor_clause', present: true, floorPercent: 1 }],
});

describe('reviewMortgage', () => {
  it('stops on invalid input', () => {
    const result = reviewMortgage(mortgage({ deedOn: d('2026-10-10') }), TODAY, DEPS);
    expect(result).toEqual({
      ok: false,
      errors: [{ field: 'deedOn', code: 'in_future', index: null }],
    });
  });

  it('stops at the door for a company, with nothing worked out', () => {
    const r = reviewOf({ ...deed2021(), borrower: 'company' });
    expect(r.scope).toEqual({ inScope: false, reason: 'company' });
    expect([r.expenses.items, r.fees, r.flags, r.information, r.offerPass]).toEqual([
      [],
      [],
      [],
      [],
      false,
    ]);
    expect(r.totals).toEqual({
      statute: { principal: 0, interest: null },
      caseLaw: { principal: 0, interest: null },
      fees: { counted: 0, upTo: 0 },
    });
  });

  it.each([
    [
      'a notary record of less than a cent',
      [invoice('transparency_deed', 0.001, paid('2021-05-09'))],
      null,
    ],
    ['a cost given back in full', [invoice('notary_loan', 100, paid('2021-05-10'))], 500],
  ])('%s offers no pass', (_, invoices, alreadyReturned) => {
    expect(reviewOf({ deedOn: d('2021-05-10'), invoices, alreadyReturned }).offerPass).toBe(false);
  });

  it('a 2018-12 deed: the tax by law, the rest by the split, on separate lines', () => {
    const deedOn = '2018-12-10';
    const invoices = [
      invoice('notary_loan', 600, paid(deedOn)),
      invoice('registry_mortgage', 400, paid(deedOn)),
      invoice('ajd_loan', 1_500, paid(deedOn)),
    ];
    const unread = reviewOf({ deedOn: d(deedOn), invoices }, UNREAD_DEPS);
    expect(unread.totals.statute.principal).toBe(1_500);
    expect(unread.totals.caseLaw.principal).toBe(0);
    const read = reviewOf({ deedOn: d(deedOn), invoices }, DEPS);
    expect(read.totals.statute.principal).toBe(1_500);
    // 50 % of 600 + 400.
    expect(read.totals.caseLaw.principal).toBe(700);
  });

  it('a 2012 deed with flags and costs only explained offers no pass', () => {
    const r = reviewOf(
      {
        deedOn: d('2012-05-10'),
        invoices: [invoice('notary_loan', 600, paid('2012-05-10'))],
        clauses: [
          { label: 'floor_clause', present: true, floorPercent: 3 },
          { label: 'irph', present: true },
        ],
      },
      UNREAD_DEPS,
    );
    expect(r.expenses.items.map((i) => i.status)).toEqual(['split_explained']);
    expect(r.flags).toHaveLength(2);
    expect(r.offerPass).toBe(false);
  });
});

describe('totals by basis', () => {
  it('have a line by law, one by the Supreme Court and one for fees, and nothing that adds them', () => {
    expectTypeOf<keyof MortgageTotals>().toEqualTypeOf<'statute' | 'caseLaw' | 'fees'>();
    const r = reviewOf(deed2021(), DEPS);
    expect(Object.keys(r.totals).sort()).toEqual(['caseLaw', 'fees', 'statute']);
    expect(Object.keys(r.totals.statute).sort()).toEqual(['interest', 'principal']);
    expect(Object.keys(r.totals.caseLaw).sort()).toEqual(['interest', 'principal']);
  });
});
