import { basketCase } from '../../documents/basket';
import type { PaidReview } from '../../documents/ports';
import type { Basket } from '../../engine/bills/basket';
import type { OfficialDeps } from '../../engine/bills/electricity-official';
import type { NormTable } from '../../engine/bills/norms';
import type { Translate } from '../../i18n/client';
import { billsReport, type ReportedReview } from '../report';
import { officialBlocks, type PvpcSource } from './official';
import { correctionLetter, electricityLetterKinds } from './letters';
import type { CompletedElectricityReview } from './ports';
import { electricityLabels } from './render';
import { billHeading, electricityBasket } from './year';

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
// that count, a copy of a bill only once; the letter asks for a corrective invoice of each bill
// with a line over the norm. The norms are the ones the reviews read.
export const electricityCase = (
  entries: readonly CompletedElectricityReview[],
  norms: NormTable,
  // The PVPC prices for «Tus cifras frente a las oficiales», once loaded; null until then or if
  // they could not be.
  official: () => { readonly deps: OfficialDeps; readonly pvpc: PvpcSource } | null = () => null,
): PaidReview =>
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
          norms,
          extra: officialBlocks(
            kept.filter((_, i) => !basket.skipped.some((s) => s.bill === i)),
            official(),
            norms,
            tr,
          ),
        },
        tr,
        today,
      );
    },
    reportFilename: 'client.bills.electricity.report.filename',
    letters: {
      paid: electricityLetterKinds,
      letter: (kept, _kind, details, tr) => correctionLetter(kept, norms, details, tr),
      filename: () => 'client.bills.letter.correction.filename',
    },
  });
