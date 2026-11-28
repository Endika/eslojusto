import type { CompletedElectricityReview } from '../../../src/bills/electricity/ports';
import { BILLS_TABLES } from '../../../src/engine/bills/data/tables';
import {
  reviewElectricityBill,
  type ElectricityReview,
} from '../../../src/engine/bills/electricity-review';
import { billFinding, type BillFinding, type BillsItemId } from '../../../src/engine/bills/finding';
import type { ElectricityBillInput } from '../../../src/engine/bills/types';
import { juneBill, TODAY } from '../../engine/bills/input';
import { NORMS_BEFORE_FIGURE } from '../../engine/bills/norms-before-figure';

// A line of a bill charged over the norm by `amount`.
export function finding(
  id: BillsItemId,
  amount: number,
  line: number | null = null,
  rule: 'vat' | 'billing' | 'meter_rent' = 'vat',
): BillFinding {
  return billFinding(id, 'paid_over', [], [rule], NORMS_BEFORE_FIGURE, {
    amount,
    direction: 'over',
    line,
  });
}

// A June bill, changed as asked, reviewed as the engine does, but with the items and totals given.
export function entryWith(
  items: ElectricityReview['items'],
  change: Partial<ElectricityBillInput> = {},
  totals: Partial<ElectricityReview['totals']> = {},
): CompletedElectricityReview {
  const input = juneBill(change);
  const r = reviewElectricityBill(input, TODAY, {
    norms: NORMS_BEFORE_FIGURE,
    tables: BILLS_TABLES,
  });
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return { input, review: { ...r.review, items, totals: { ...r.review.totals, ...totals } } };
}
