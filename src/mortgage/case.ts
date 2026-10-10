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
