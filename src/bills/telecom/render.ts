import { find } from '../../calculator/review-result';
import type { BillsItemId } from '../../engine/bills/finding';
import type { NormTable } from '../../engine/bills/norms';
import type { TelecomReview } from '../../engine/bills/telecom-review';
import type { Translate } from '../../i18n/client';
import {
  renderItems,
  renderTotals,
  renderUnchecked,
  showInScope,
  summaryKind,
  type ItemLabels,
  type Tone,
} from '../result';
import { SECTION_OF_STEP, type Step, type Tab } from './steps';

// Each line goes with the tab that asks for its figures.
const STEP_OF: Partial<Record<BillsItemId, Step>> = {
  commitment_length: 'permanencia',
  commitment_penalty: 'permanencia',
  change_exit: 'aviso',
  charge_after_exit: 'despues',
};
const TAB_NUMBER: Record<Tab, string> = {
  cause: '01',
  salary: '02',
  settlement: '03',
  result: '04',
};

const tone = (id: BillsItemId): Tone => {
  const tab = SECTION_OF_STEP[STEP_OF[id] ?? 'cobros'];
  return { tone: tab, number: TAB_NUMBER[tab] };
};

export const telecomLabels = (tr: Translate): ItemLabels => ({
  title: (f) => tr(`client.bills.item.${f.id}`),
  tone,
});

// The totals first, then the commitment, the exit after a change and what was billed after it took
// effect, each with its calculation and its rules, and what the review does not look at.
export function renderTelecomResult(
  root: HTMLElement,
  review: TelecomReview,
  norms: NormTable,
  tr: Translate,
): void {
  showInScope(root);
  const kind = review.items.length === 0 ? 'nothing' : summaryKind(review.items, review.totals);
  find(root, '[data-lead]').textContent = tr(`client.bills.result.telecom_lead_${kind}`);
  renderTotals(root, review.totals, tr);
  find(root, '[data-recurring]').hidden = true;
  renderItems(root, review.items, norms, telecomLabels(tr), tr);
  renderUnchecked(
    root,
    review.unchecked.map((code) => tr(`client.bills.unchecked.telecom.${code}`)),
  );
}
