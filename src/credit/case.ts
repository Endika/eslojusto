import type { NormTable } from '../engine/credit/norms';
import type { LetterKind } from '../documents/letter';
import type { PaidReview } from '../documents/ports';
import type { ClientKey } from '../i18n/client';
import { creditLetterKinds, informationLetter, repaymentLetter } from './letters';
import type { CompletedCreditReview } from './ports';
import { creditReport } from './report';

const FILENAMES: Partial<Record<LetterKind, ClientKey>> = {
  credit_information: 'client.credit.letter.information.filename',
  early_repayment_review: 'client.credit.letter.repayment.filename',
};

// A credit review as the pass sees it: offered when the contract states a lower APR than its
// figures give, or an early repayment was charged over a cap, in every reading. It unlocks the
// report and the early repayment letter when there is one. The request for the credit's
// information only asks for it, so it needs no pass. The norms are the ones the review read.
export function creditCase(r: CompletedCreditReview, norms: NormTable): PaidReview {
  const kinds = creditLetterKinds(r);
  return {
    offer: r.review.offerPass,
    letterKinds: kinds.paid,
    freeLetterKinds: kinds.free,
    report: (tr, day) => creditReport(r, tr, day),
    letter: (kind, details, tr) =>
      kind === 'early_repayment_review'
        ? repaymentLetter(r, details, tr)
        : informationLetter(r, norms, details, tr),
    filename: (document, kind) =>
      document === 'report'
        ? 'client.credit.report.filename'
        : ((kind && FILENAMES[kind]) ?? 'client.credit.letter.information.filename'),
  };
}
