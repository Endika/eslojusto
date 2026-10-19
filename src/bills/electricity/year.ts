import { dayText } from '../../calculator/review-result';
import type { ReviewBasket } from '../../documents/basket';
import { PASS_PRICE } from '../../documents/contract';
import { reviewBasket, type Basket } from '../../engine/bills/basket';
import { toIso } from '../../engine/date';
import type { Translate } from '../../i18n/client';
import type { CompletedElectricityReview } from './ports';

export const electricityBasket = (entries: readonly CompletedElectricityReview[]): Basket =>
  reviewBasket(entries, { passPrice: PASS_PRICE });

// Whether the year offers the pass with this bill in it, asked before the year keeps it.
export const offeredWith = <T extends CompletedElectricityReview>(
  year: ReviewBasket<T>,
  bill: T,
): boolean => electricityBasket(year.entriesWith(bill)).offerPass;

// «Factura del 31-05-2026 al 30-06-2026».
// A date never breaks at its hyphens on a narrow screen; the PDF writes them as plain hyphens.
const unbroken = (day: string) => day.replaceAll('-', '‑');

export const billHeading = ({ input }: CompletedElectricityReview, tr: Translate): string =>
  tr('client.bills.basket.bill', {
    desde: unbroken(dayText(toIso(input.readingFrom))),
    hasta: unbroken(dayText(toIso(input.readingTo))),
  });
