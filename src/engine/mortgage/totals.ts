import { round2 } from '../money';
import type { ExpenseInterest, ExpenseItem } from './expenses';
import type { Basis } from './rules';

export interface InterestTotal {
  readonly amount: number;
  // The earliest last day counted among the items.
  readonly until: string;
  readonly estimated: boolean;
  readonly missingYear: number | null;
}

export interface BasisAmounts {
  // What the lender bears of what the person paid, less anything already given back.
  readonly principal: number;
  // Null unless every item behind `principal` carries its interest.
  readonly interest: InterestTotal | null;
}

// What the law says and what a court applies, side by side. There is deliberately no field that
// adds them: a figure that depends on a judge never joins one the law settles. That is why the
// line by law never carries interest: interest on these costs rests on a Supreme Court criterion.
export interface BasisTotals {
  readonly statute: BasisAmounts & { readonly interest: null };
  readonly caseLaw: BasisAmounts;
}

function interestTotal(interests: readonly (ExpenseInterest | null)[]): InterestTotal | null {
  const [first, ...rest] = interests;
  if (first === undefined || first === null) return null;
  let total: InterestTotal = { ...first };
  for (const i of rest) {
    if (i === null) return null;
    total = {
      amount: total.amount + i.amount,
      until: i.until < total.until ? i.until : total.until,
      estimated: total.estimated || i.estimated,
      missingYear: total.missingYear ?? i.missingYear,
    };
  }
  return { ...total, amount: round2(total.amount) };
}

// Which part of anything already given back belongs to which basis is unknown, so each line takes
// it off in full: neither ever shows more than it might.
function amountsOf(items: readonly ExpenseItem[], basis: Basis, returned: number): BasisAmounts {
  const counted = items.filter((i) => i.status === 'lender_bears' && i.basis === basis);
  const principal = round2(counted.reduce((s, i) => s + (i.amount ?? 0), 0));
  return {
    principal: Math.max(0, round2(principal - returned)),
    interest: interestTotal(counted.map((i) => i.interest)),
  };
}

export const basisTotals = (items: readonly ExpenseItem[], returned: number): BasisTotals => ({
  statute: { principal: amountsOf(items, 'statute', returned).principal, interest: null },
  caseLaw: amountsOf(items, 'case_law', returned),
});
