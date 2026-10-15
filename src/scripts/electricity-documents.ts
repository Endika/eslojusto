import { documentsAnalytics } from '../analytics/documents';
import { track } from '../analytics/posthog';
import { renderBasket } from '../bills/electricity/basket';
import { electricityCase } from '../bills/electricity/case';
import type { PvpcSource } from '../bills/electricity/official';
import type { CompletedElectricityReview, YearEvents } from '../bills/electricity/ports';
import { electricityReading } from '../bills/electricity/reading';
import { STEPS } from '../bills/electricity/steps';
import { electricityBasket } from '../bills/electricity/year';
import type { FormEntries } from '../calculator/fill';
import type { SectionForm } from '../calculator/section';
import { createBasket } from '../documents/basket';
import { DOCUMENTS } from '../documents/config';
import { ELECTRICITY_EXTRACTION } from '../documents/contract';
import { TOLL_HOLIDAYS } from '../engine/bills/data/holidays-20td';
import { pvpcTable } from '../engine/bills/data/pvpc-hourly';
import type { OfficialDeps } from '../engine/bills/electricity-official';
import type { NormTable } from '../engine/bills/norms';
import { billsTranslator } from './bills-copy';
import { READS_UNMEASURED, wireDocuments, type ReviewHooks } from './documents';

// A bill of the year with the answers it was reviewed from, which are all the trip to Stripe keeps
// of it.
interface KeptBill extends CompletedElectricityReview {
  readonly answers: FormEntries;
}

// Document reading, «tu año», the report and the letter on the electricity review's page. A read
// can bring several bills: each fills the form in turn and, once reviewed, joins the year, which
// lives in this page's memory only. One pass is offered for the whole year, by what its bills add
// up to or repeat. The norms are the ones the reviews read; the year is reported once no bill read
// waits its turn.
export function wireElectricityDocuments(
  electricity: SectionForm,
  hooks: ReviewHooks<CompletedElectricityReview>,
  arrival: { hash: string; search: string },
  norms: NormTable,
  yearEvents: YearEvents,
): void {
  const tr = billsTranslator();
  const { form } = electricity;
  // The PVPC prices only the paid report reads: fetched once a bill is reviewed, which a pass
  // needs, so they are here by the time one is paid. A failed fetch is tried again with the next
  // review or download; until then the report says it goes without them.
  let official: { readonly deps: OfficialDeps; readonly pvpc: PvpcSource } | null = null;
  let loading = false;
  const loadOfficial = () => {
    if (official !== null || loading) return;
    loading = true;
    import('../engine/bills/data/pvpc-hourly.json')
      .then(({ default: raw }: { default: unknown }) => {
        const table = pvpcTable(raw);
        if (table !== null)
          official = {
            deps: { pvpc: table, tollHolidays: TOLL_HOLIDAYS },
            pvpc: { source: table.source, url: table.url },
          };
      })
      .catch(() => undefined)
      .finally(() => {
        loading = false;
      });
  };
  const reading = electricityReading(form, tr);
  const year = createBasket<KeptBill>();
  const show = () => renderBasket(document, year.entries(), reading.pending(), tr);

  // A new bill starts on an empty form; the year keeps every bill already reviewed.
  function startBill() {
    year.next();
    form.reset();
    electricity.fill([]);
  }

  // Heard before the pass, so its offer counts the bill just reviewed.
  hooks.onReview((r) => {
    loadOfficial();
    year.put({
      ...r,
      input: { ...r.input, supplyFingerprint: reading.fingerprint() },
      answers: electricity.entries(),
    });
    reading.reviewed();
    if (reading.pending() === 0) yearEvents.basketCompleted(electricityBasket(year.entries()));
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
    // Its reads send no event, as on the other finance pages; the pass is measured as on every
    // page.
    events: { ...documentsAnalytics(track), ...READS_UNMEASURED },
    section: {
      extraction: ELECTRICITY_EXTRACTION,
      reading,
      steps: STEPS,
      keptReviewKey: 'eslojusto-revision-luz-en-pago',
      paidReview: () =>
        electricityCase(year.entries(), norms, () => {
          loadOfficial();
          return official;
        }),
      decorateResult: show,
      restore: (saved) => saved,
      // The whole year goes on the trip to Stripe, each bill as its answers and nothing else, and
      // each is reviewed again on return. The supply fingerprint stays behind, so a year rebuilt
      // tells copies of a bill apart by their period alone.
      basket: { answers: () => year.entries().map((bill) => bill.answers), startNext: startBill },
    },
  });
  if (!documents) return;

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
