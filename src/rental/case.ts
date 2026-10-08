import type { CivilDate } from '../engine/date';
import type { PaidReview } from '../documents/ports';
import { depositLetter, rentalLetterKinds, rentLetter } from './letters';
import type { CompletedRentalReview } from './ports';
import { rentalReport } from './report';

// A rental review as the pass sees it: offered when something is paid over or owed in every
// reading; it unlocks the detail, the report and the letters the review has figures for. `today`
// is the day the review was worked out, up to which the interest runs.
export function rentalCase(r: CompletedRentalReview, today: CivilDate): PaidReview {
  return {
    offer: r.review.offerPass,
    letterKinds: rentalLetterKinds(r.review),
    report: (tr, day) => rentalReport(r, tr, day),
    letter: (kind, details, tr) =>
      kind === 'deposit_return' ? depositLetter(r, today, details, tr) : rentLetter(r, details, tr),
    filename: (document, kind) =>
      document === 'report'
        ? 'client.rental.report.filename'
        : kind === 'deposit_return'
          ? 'client.rental.letter.deposit.filename'
          : 'client.rental.letter.rent.filename',
  };
}
