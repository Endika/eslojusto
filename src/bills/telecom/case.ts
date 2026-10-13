import { basketCase } from '../../documents/basket';
import { PASS_PRICE } from '../../documents/contract';
import type { PaidReview } from '../../documents/ports';
import { billsReport } from '../report';
import type { CompletedTelecomReview } from './ports';
import { telecomLabels } from './render';

// The exit from a phone or internet contract as the pass sees it: one review, offered when what
// it counts reaches the pass's price.
export const telecomCase = (r: CompletedTelecomReview): PaidReview =>
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
        },
        tr,
        today,
      ),
    reportFilename: 'client.bills.telecom.report.filename',
  });
