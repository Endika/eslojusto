import type { PaidReview } from '../documents/ports';
import { insuranceLetterKinds, nonRenewalLetter } from './letters';
import type { CompletedInsuranceReview } from './ports';
import { insuranceReport } from './report';

// A policy review as the pass sees it: it never offers the pass, since nothing in it carries
// euros. A pass already held downloads its report; the letter that says the policy is not to be
// extended only tells the insurer so, and needs no pass.
export const insuranceCase = (r: CompletedInsuranceReview): PaidReview => ({
  offer: false,
  letterKinds: [],
  freeLetterKinds: insuranceLetterKinds(r),
  report: (tr, day) => insuranceReport(r, tr, day),
  letter: (_kind, details, tr) => nonRenewalLetter(r, details, tr),
  filename: (document) =>
    document === 'report' ? 'client.insurance.report.filename' : 'client.insurance.letter.filename',
});
