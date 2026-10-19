import type { ExpenseStatus } from '../engine/mortgage/expenses';
import type { MortgageReview } from '../engine/mortgage/review';
import type { LegalInterestTable } from '../engine/law/interest';
import type { LetterKind } from '../documents/letter';
import type { PaidReview } from '../documents/ports';
import type { ClientKey } from '../i18n/client';
import { amountsLetter, documentsLetter, mortgageLetterKinds } from './letters';
import type { CompletedMortgageReview } from './ports';
import { mortgageReport } from './report';

const FILENAMES: Partial<Record<LetterKind, ClientKey>> = {
  mortgage_documents: 'client.mortgage.letter.documents.filename',
  mortgage_amounts: 'client.mortgage.letter.amounts.filename',
};

// Expense statuses that put nothing on the lender and leave nothing to look at.
const SETTLED: ReadonlySet<ExpenseStatus> = new Set([
  'borrower_bears',
  'not_applicable',
  'not_applicable_to_date',
  'paid_by_bank',
  'not_entered',
]);

// No clause flagged in the deed or unreadable, every expense settled and every fee within its cap
// in every reading, with at least one figure compared.
function allClear(review: MortgageReview): boolean {
  const { items } = review.expenses;
  const fees = review.fees.flatMap((f) =>
    f.kind === 'single' ? [f.finding] : f.readings.map((r) => r.finding),
  );
  return (
    review.flags.every((f) => f.state === 'not_in_deed') &&
    items.every((i) => SETTLED.has(i.status)) &&
    fees.every((f) => f.status === 'within_cap') &&
    (fees.length > 0 || items.some((i) => i.status !== 'not_entered'))
  );
}

// A mortgage review as the pass sees it: offered when some cost or fee carries a counted figure,
// never for the clauses alone. It unlocks the report and, when a law settles some item with euros,
// the amounts letter. The request for the mortgage's documents only asks for them, so it needs no
// pass: whoever lacks the invoices, and so never sees the offer, still has it. The legal interest
// table is the one the review read.
export function mortgageCase(
  r: CompletedMortgageReview,
  legalInterest: LegalInterestTable,
): PaidReview {
  const kinds = mortgageLetterKinds(r);
  return {
    offer: r.review.offerPass,
    quiet: allClear(r.review),
    letterKinds: kinds.paid,
    freeLetterKinds: kinds.free,
    report: (tr, day) => mortgageReport(r, legalInterest, tr, day),
    letter: (kind, details, tr) =>
      kind === 'mortgage_amounts' ? amountsLetter(r, details, tr) : documentsLetter(r, details, tr),
    filename: (document, kind) =>
      document === 'report'
        ? 'client.mortgage.report.filename'
        : ((kind && FILENAMES[kind]) ?? 'client.mortgage.letter.documents.filename'),
  };
}
