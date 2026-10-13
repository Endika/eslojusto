import { dayText } from '../../calculator/review-result';
import { basketCase } from '../../documents/basket';
import { PASS_PRICE } from '../../documents/contract';
import type { PaidReview } from '../../documents/ports';
import { reviewBasket, type Basket } from '../../engine/bills/basket';
import { toIso } from '../../engine/date';
import type { Translate } from '../../i18n/client';
import { billsReport, type ReportedReview } from '../report';
import type { CompletedElectricityReview } from './ports';
import { electricityLabels } from './render';

export const electricityBasket = (entries: readonly CompletedElectricityReview[]): Basket =>
  reviewBasket(entries, { passPrice: PASS_PRICE });

// «Factura del 31-05-2026 al 30-06-2026».
export const billHeading = ({ input }: CompletedElectricityReview, tr: Translate): string =>
  tr('client.bills.basket.bill', {
    desde: dayText(toIso(input.readingFrom)),
    hasta: dayText(toIso(input.readingTo)),
  });

function reported(
  entries: readonly CompletedElectricityReview[],
  basket: Basket,
  tr: Translate,
): ReportedReview[] {
  return entries.map((entry, i) => {
    const duplicate = basket.skipped.some((s) => s.bill === i && s.reason === 'duplicate');
    return {
      heading: billHeading(entry, tr),
      items: entry.review.items,
      totals: entry.review.totals,
      labels: electricityLabels(entry.input, tr),
      ...(duplicate && { skipped: tr('client.bills.basket.duplicate') }),
    };
  });
}

// The bills of «tu año» as the pass sees them: offered when what they count reaches the pass's
// price or a difference comes back bill after bill. The report lists every bill and adds up those
// that count, a copy of a bill only once.
export const electricityCase = (entries: readonly CompletedElectricityReview[]): PaidReview =>
  basketCase(entries, {
    offer: (kept) => electricityBasket(kept).offerPass,
    report(kept, tr, today) {
      const basket = electricityBasket(kept);
      return billsReport(
        {
          title: 'client.bills.electricity.report.title',
          intro: 'client.bills.electricity.report.intro',
          reviews: reported(kept, basket, tr),
          year:
            kept.length < 2
              ? null
              : {
                  totals: basket.totals,
                  recurring: basket.recurring.map((id) => tr(`client.bills.item.${id}`)),
                  yearlyEstimate: basket.yearlyEstimate,
                },
        },
        tr,
        today,
      );
    },
    reportFilename: 'client.bills.electricity.report.filename',
  });
