import { basketCase } from '../../documents/basket';
import type { PaidReview } from '../../documents/ports';
import { PASS_PRICE } from '../../documents/contract';
import type { NormTable } from '../../engine/bills/norms';
import { billsReport } from '../report';
import { exitLetter, penaltyLetter, telecomLetterKinds } from './letters';
import type { CompletedTelecomReview } from './ports';
import { telecomLabels } from './render';

// The exit from a phone or internet contract as the pass sees it: one review, offered when what
// it counts reaches the pass's price. The pass unlocks the report and the penalty letter, which
// carries figures; the letter about leaving after a change of conditions carries none and needs no
// pass. The norms are the ones the review read.
export const telecomCase = (r: CompletedTelecomReview, norms: NormTable): PaidReview =>
  basketCase([r], {
    offer: (kept) => kept.reduce((sum, k) => sum + k.review.totals.counted, 0) >= PASS_PRICE,
    report: (kept, tr, today) =>
      billsReport(
        {
          title: 'client.bills.telecom.report.title',
          intro: 'client.bills.telecom.report.intro',
          reviews: kept.map(({ review }) => ({
            heading: tr('client.bills.telecom.report.exit'),
            items: review.items,
            totals: review.totals,
            labels: telecomLabels(tr),
          })),
          year: null,
          norms,
        },
        tr,
        today,
      ),
    reportFilename: 'client.bills.telecom.report.filename',
    letters: {
      paid: () => telecomLetterKinds(r).paid,
      free: () => telecomLetterKinds(r).free,
      letter: (_kept, kind, details, tr) =>
        kind === 'telecom_penalty_review'
          ? penaltyLetter(r, details, tr)
          : exitLetter(r, details, tr),
      filename: (kind) =>
        kind === 'telecom_penalty_review'
          ? 'client.bills.telecom.letter.penalty.filename'
          : 'client.bills.telecom.letter.exit.filename',
    },
  });
