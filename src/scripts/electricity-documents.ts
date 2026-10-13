import { renderBasket } from '../bills/electricity/basket';
import { electricityCase } from '../bills/electricity/case';
import type { CompletedElectricityReview } from '../bills/electricity/ports';
import { electricityReading } from '../bills/electricity/reading';
import { STEPS } from '../bills/electricity/steps';
import type { SectionForm } from '../calculator/section';
import { createBasket } from '../documents/basket';
import { DOCUMENTS } from '../documents/config';
import { ELECTRICITY_EXTRACTION } from '../documents/contract';
import type { NormTable } from '../engine/bills/norms';
import { billsTranslator } from './bills-copy';
import { UNMEASURED, wireDocuments, type ReviewHooks } from './documents';

// Document reading, «tu año», the report and the letter on the electricity review's page. A read
// can bring several bills: each fills the form in turn and, once reviewed, joins the year, which
// lives in this page's memory only. One pass is offered for the whole year, by what its bills add
// up to or repeat. The norms are the ones the reviews read.
export function wireElectricityDocuments(
  electricity: SectionForm,
  hooks: ReviewHooks<CompletedElectricityReview>,
  arrival: { hash: string; search: string },
  norms: NormTable,
): void {
  const tr = billsTranslator();
  const { form } = electricity;
  const reading = electricityReading(form, tr);
  const year = createBasket<CompletedElectricityReview>();
  const show = () => renderBasket(document, year.entries(), reading.pending(), tr);

  // Heard before the pass, so its offer counts the bill just reviewed.
  hooks.onReview((r) => {
    year.put({ ...r, input: { ...r.input, supplyFingerprint: reading.fingerprint() } });
    reading.reviewed();
  });
  hooks.onRestart(() => {
    year.drop();
    show();
  });

  const documents = wireDocuments({
    form: electricity,
    hooks,
    arrival,
    config: DOCUMENTS,
    tr,
    // The review measures nothing yet, and neither does its pass.
    events: UNMEASURED,
    section: {
      extraction: ELECTRICITY_EXTRACTION,
      reading,
      steps: STEPS,
      keptReviewKey: 'eslojusto-revision-luz-en-pago',
      paidReview: () => electricityCase(year.entries(), norms),
      decorateResult: show,
      restore: (saved) => saved,
    },
  });
  if (!documents) return;

  // A new bill starts on an empty form; the year keeps every bill already reviewed.
  const startBill = () => {
    year.next();
    form.reset();
    electricity.fill([]);
  };
  document.querySelector('[data-basket-next]')?.addEventListener('click', () => {
    const bill = reading.next();
    if (!bill) return;
    startBill();
    documents.fillRead(bill);
    electricity.open();
  });
  document.querySelector('[data-basket-add]')?.addEventListener('click', () => {
    startBill();
    reading.typed();
    const result = document.querySelector<HTMLElement>('#resultado');
    if (result) result.hidden = true;
    documents.showStart();
  });
}
