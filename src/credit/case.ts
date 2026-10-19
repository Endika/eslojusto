import { findingsOf, type FindingStatus } from '../engine/credit/finding';
import type { IndicatorStatus } from '../engine/credit/indicator';
import type { NormTable } from '../engine/credit/norms';
import type { CreditReview } from '../engine/credit/review';
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

// Statuses that leave nothing to look at, and those among them that compared a figure.
const SETTLED: ReadonlySet<FindingStatus> = new Set([
  'matches',
  'contract_higher',
  'within_cap',
  'nothing_charged',
  'open',
  'ended',
  'not_started',
  'not_entered',
]);
const COMPARED: ReadonlySet<FindingStatus> = new Set([
  'matches',
  'contract_higher',
  'within_cap',
  'nothing_charged',
]);

// Where the APR stands against the average rate leaves nothing to look at only below the revolving
// criterion; a loan's distance in points comes with no criterion read.
const CALM: ReadonlySet<IndicatorStatus> = new Set([
  'below',
  'not_published',
  'no_data',
  'not_entered',
]);

// Every finding settled in every reading, the indicator calm, with at least one figure compared.
function allClear(review: CreditReview): boolean {
  const findings = review.items.flatMap(findingsOf);
  return (
    (review.indicator === null || CALM.has(review.indicator.status)) &&
    review.totals.overCharged.upTo === 0 &&
    findings.every((f) => SETTLED.has(f.status)) &&
    findings.some((f) => COMPARED.has(f.status))
  );
}

// A credit review as the pass sees it: offered when the contract states a lower APR than its
// figures give, or an early repayment was charged over a cap, in every reading. It unlocks the
// report and the early repayment letter when there is one. The request for the credit's
// information only asks for it, so it needs no pass. The norms are the ones the review read.
export function creditCase(r: CompletedCreditReview, norms: NormTable): PaidReview {
  const kinds = creditLetterKinds(r);
  return {
    offer: r.review.offerPass,
    quiet: allClear(r.review),
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
