import { formatCalculationEuros, formatWholeEuros } from '../../calculator/number';
import { find, listOf } from '../../calculator/review-result';
import type { Translate } from '../../i18n/client';
import { billHeading, electricityBasket } from './year';
import type { CompletedElectricityReview } from './ports';

// «Tu año»: every bill reviewed in this tab, what those that count add up to, and the yearly
// estimate apart, never in a total. `pending` is how many bills read still wait their turn. Locked
// with the pass offered, what repeats is not named: which lines they are is the pass's.
export function renderBasket(
  root: ParentNode,
  entries: readonly CompletedElectricityReview[],
  pending: number,
  locked: boolean,
  tr: Translate,
): void {
  const box = find(root, '[data-basket]');
  const basket = electricityBasket(entries);
  const counted = basket.bills.length;
  box.hidden = entries.length === 0 && pending === 0;
  find(box, '[data-basket-title]').textContent =
    counted === 1
      ? tr('client.bills.basket.title_one')
      : tr('client.bills.basket.title_many', { n: counted });

  find(box, '[data-basket-bills]').replaceChildren(
    ...listOf(
      entries.map((entry, i) => {
        const bill = billHeading(entry, tr);
        return basket.skipped.some((s) => s.bill === i && s.reason === 'duplicate')
          ? tr('client.bills.basket.bill_duplicate', { factura: bill })
          : tr('client.bills.basket.bill_counted', {
              factura: bill,
              importe: formatCalculationEuros(entry.review.totals.counted),
            });
      }),
    ),
  );

  const year = find(box, '[data-basket-year]');
  year.hidden = counted < 2;
  const { totals } = basket;
  find(year, '[data-basket-counted]').textContent = formatCalculationEuros(totals.counted);
  const upTo = find(year, '[data-basket-up-to]');
  upTo.hidden = totals.upTo <= totals.counted;
  upTo.textContent = tr('client.bills.total.up_to', {
    importe: formatCalculationEuros(totals.upTo),
  });
  const under = find(year, '[data-basket-under]');
  under.hidden = totals.under <= 0;
  under.textContent = tr('client.bills.total.under', {
    importe: formatCalculationEuros(totals.under),
  });
  const unnamed = locked && basket.offerPass;
  const partidas = basket.recurring.map((id) => tr(`client.bills.item.${id}`)).join(', ');
  const recurring = find(year, '[data-basket-recurring]');
  recurring.hidden = basket.recurring.length === 0;
  recurring.textContent = unnamed
    ? tr('client.bills.basket.recurring_unnamed')
    : tr('client.bills.basket.recurring', { partidas });
  const estimate = find(year, '[data-basket-estimate]');
  estimate.hidden = basket.yearlyEstimate === null;
  const importe = formatWholeEuros(basket.yearlyEstimate ?? 0);
  estimate.textContent =
    basket.yearlyEstimate === null
      ? ''
      : unnamed
        ? tr('client.bills.basket.estimate_unnamed', { importe })
        : tr('client.bills.basket.estimate', { partidas, importe });

  const next = find(box, '[data-basket-next]');
  next.hidden = pending === 0;
  next.textContent =
    pending === 1
      ? tr('client.bills.basket.next_one')
      : tr('client.bills.basket.next_many', { n: pending });
}
