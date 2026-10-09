import { describe, expect, expectTypeOf, it } from 'vitest';
import { parseDate } from '../../../src/engine/date';
import {
  reviewMortgage,
  UNCHECKED,
  type MortgageReview,
  type MortgageTotals,
} from '../../../src/engine/mortgage/review';
import type { MortgageDeps, MortgageInput } from '../../../src/engine/mortgage/types';
import { DEPS, invoice, mortgage, READ_DEPS, TODAY } from './input';

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

  it('a 2021 deed end to end: costs by law, the fee over its cap and the floor the law forbids', () => {
    const r = reviewOf(deed2021());
    expect(r.scope).toEqual({ inScope: true });
    // 700 + 450 + 350 + 1.200; the valuation stays the borrower's.
    expect(r.totals.statute).toEqual({ principal: 2_700, interest: null });
    expect(r.totals.caseLaw).toEqual({ principal: 0, interest: null });
    // 0,15 % of 20.000 € is 30 €: 70 € over.
    expect(r.totals.fees).toEqual({ counted: 70, upTo: 70 });
    expect(r.flags.map((f) => [f.label, f.parts.map((p) => p.basis)])).toEqual([
      ['floor_clause', ['statute']],
    ]);
    expect(r.information.map((b) => b.id)).toContain('fein_timing');
    expect(r.offerPass).toBe(true);
    expect(r.unchecked).toEqual(UNCHECKED);
  });

  it('the notary record charged under the LCCI is a figure by law of its own, out of the totals', () => {
    const r = reviewOf({
      deedOn: d('2021-05-10'),
      invoices: [invoice('transparency_deed', 60, paid('2021-05-09'))],
    });
    expect(r.expenses.items.map((i) => [i.basis, i.status, i.amount])).toEqual([
      ['statute', 'not_chargeable', 60],
    ]);
    expect(r.totals.statute.principal).toBe(0);
    expect(r.offerPass).toBe(true);
  });

  it('a 2018-12 deed: the tax by law, the rest by the split, on separate lines', () => {
    const deedOn = '2018-12-10';
    const invoices = [
      invoice('notary_loan', 600, paid(deedOn)),
      invoice('registry_mortgage', 400, paid(deedOn)),
      invoice('ajd_loan', 1_500, paid(deedOn)),
    ];
    const unread = reviewOf({ deedOn: d(deedOn), invoices });
    expect(unread.totals.statute.principal).toBe(1_500);
    expect(unread.totals.caseLaw.principal).toBe(0);
    const read = reviewOf({ deedOn: d(deedOn), invoices }, READ_DEPS);
    expect(read.totals.statute.principal).toBe(1_500);
    // 50 % of 600 + 400.
    expect(read.totals.caseLaw.principal).toBe(700);
  });

  it('a 2012 deed with flags and costs only explained offers no pass', () => {
    const r = reviewOf({
      deedOn: d('2012-05-10'),
      invoices: [invoice('notary_loan', 600, paid('2012-05-10'))],
      clauses: [
        { label: 'floor_clause', present: true, floorPercent: 3 },
        { label: 'irph', present: true },
      ],
    });
    expect(r.expenses.items.map((i) => i.status)).toEqual(['split_explained']);
    expect(r.flags).toHaveLength(2);
    expect(r.offerPass).toBe(false);
  });

  it('the same 2012 deed offers it once the split gives figures', () => {
    const r = reviewOf(
      { deedOn: d('2012-05-10'), invoices: [invoice('notary_loan', 600, paid('2012-05-10'))] },
      READ_DEPS,
    );
    expect(r.totals.caseLaw.principal).toBe(300);
    expect(r.offerPass).toBe(true);
  });

  it('a fee within its cap and costs without a figure offer no pass', () => {
    const r = reviewOf({
      deedOn: d('2021-05-10'),
      prepaymentOption: 'a_015_5y',
      operations: [
        {
          on: d('2022-03-01'),
          kind: 'partial_prepayment',
          principal: 20_000,
          feeCharged: 30,
          hadInsurance: null,
        },
      ],
    });
    expect(r.offerPass).toBe(false);
  });
});

describe('totals by basis', () => {
  it('have a line by law, one by the Supreme Court and one for fees, and nothing that adds them', () => {
    expectTypeOf<keyof MortgageTotals>().toEqualTypeOf<'statute' | 'caseLaw' | 'fees'>();
    const r = reviewOf(deed2021(), READ_DEPS);
    expect(Object.keys(r.totals).sort()).toEqual(['caseLaw', 'fees', 'statute']);
    expect(Object.keys(r.totals.statute).sort()).toEqual(['interest', 'principal']);
    expect(Object.keys(r.totals.caseLaw).sort()).toEqual(['interest', 'principal']);
  });
});
