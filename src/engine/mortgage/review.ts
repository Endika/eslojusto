import type { CivilDate } from '../date';
import { reviewExpenses, type ExpensesReview } from './expenses';
import { feeTotal, reviewFees, type FeeItem, type FeeTotal } from './fees';
import { reviewFlags, type ClauseFlag } from './flags';
import { informationBlocks, type InformationBlock } from './information';
import { scope } from './scope';
import { basisTotals, type BasisTotals } from './totals';
import type { MortgageDeps, MortgageInput, Scope } from './types';
import { validate, type ValidationError } from './validate';

// What the review never looks at, always listed at the end.
export type UncheckedCode =
  | 'clause_transparency'
  | 'floor_irph_paid'
  | 'time_limits'
  | 'novations'
  | 'insurance'
  | 'purchase'
  | 'purchase_taxes';

export const UNCHECKED: readonly UncheckedCode[] = [
  'clause_transparency',
  'floor_irph_paid',
  'time_limits',
  'novations',
  'insurance',
  'purchase',
  'purchase_taxes',
];

// The set-up costs by law and by the Supreme Court's split, and the fees over their caps, each on a
// line of its own. Nothing adds them up.
export type MortgageTotals = BasisTotals & { readonly fees: FeeTotal };

export interface MortgageReview {
  readonly scope: Scope;
  readonly expenses: ExpensesReview;
  readonly fees: readonly FeeItem[];
  readonly flags: readonly ClauseFlag[];
  readonly information: readonly InformationBlock[];
  readonly totals: MortgageTotals;
  // Some cost or fee carries a counted figure. Flags alone never offer it.
  readonly offerPass: boolean;
  readonly unchecked: readonly UncheckedCode[];
}

export type MortgageResult =
  | { readonly ok: false; readonly errors: readonly ValidationError[] }
  | { readonly ok: true; readonly review: MortgageReview };

const NO_EXPENSES: ExpensesReview = { items: [], totals: basisTotals([], 0), calculation: [] };

// The whole mortgage review. `today` and the tables come in from the composition root, so a change
// of norm status or a ruling read at its source needs no change here.
export function reviewMortgage(
  input: MortgageInput,
  today: CivilDate,
  deps: MortgageDeps,
): MortgageResult {
  const errors = validate(input, today);
  if (errors.length > 0) return { ok: false, errors };
  const reach = scope(input);
  if (!reach.inScope)
    return {
      ok: true,
      review: {
        scope: reach,
        expenses: NO_EXPENSES,
        fees: [],
        flags: [],
        information: [],
        totals: { ...NO_EXPENSES.totals, fees: { counted: 0, upTo: 0 } },
        offerPass: false,
        unchecked: UNCHECKED,
      },
    };

  const expenses = reviewExpenses(input, today, deps);
  const fees = reviewFees(input, deps);
  const totals: MortgageTotals = { ...expenses.totals, fees: feeTotal(fees) };
  // What was paid for the notary's record is charged to nobody: a figure of its own, out of the
  // totals, that still counts.
  const notChargeable = expenses.items.some(
    (i) => i.status === 'not_chargeable' && (i.amount ?? 0) > 0,
  );
  return {
    ok: true,
    review: {
      scope: reach,
      expenses,
      fees,
      flags: reviewFlags(input, today, deps),
      information: informationBlocks(input, today, deps),
      totals,
      offerPass:
        totals.statute.principal > 0 ||
        totals.caseLaw.principal > 0 ||
        totals.fees.counted > 0 ||
        notChargeable,
      unchecked: UNCHECKED,
    },
  };
}
