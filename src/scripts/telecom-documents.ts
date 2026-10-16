import { documentsAnalytics } from '../analytics/documents';
import { track } from '../analytics/posthog';
import { telecomCase } from '../bills/telecom/case';
import type { CompletedTelecomReview } from '../bills/telecom/ports';
import { telecomReading } from '../bills/telecom/reading';
import { STEPS } from '../bills/telecom/steps';
import type { SectionForm } from '../calculator/section';
import { DOCUMENTS } from '../documents/config';
import { TELECOM_EXTRACTION } from '../documents/contract';
import type { NormTable } from '../engine/bills/norms';
import { billsPapersTranslator, billsTranslator } from './bills-copy';
import { localToday } from './clock';
import { READS_UNMEASURED, wireDocuments, type ReviewHooks } from './documents';

// Document reading, the pass and the letters on the telecom review's page: the contract and the
// bills fill its sheets and the bills' lines are listed as soon as they are read, the pass unlocks
// the report and the penalty letter, and the letter about leaving after a change of conditions
// downloads without it. The norms are the ones the review read.
export function wireTelecomDocuments(
  telecom: SectionForm,
  hooks: ReviewHooks<CompletedTelecomReview>,
  arrival: { hash: string; search: string },
  norms: NormTable,
): void {
  const tr = billsTranslator();
  const paperTr = billsPapersTranslator();
  wireDocuments({
    form: telecom,
    hooks,
    arrival,
    config: DOCUMENTS,
    tr,
    paperTr,
    // Its reads send no event, as on the other finance pages; the pass is measured as on every
    // page.
    events: { ...documentsAnalytics(track), ...READS_UNMEASURED },
    section: {
      extraction: TELECOM_EXTRACTION,
      reading: telecomReading(telecom.form, tr, {
        root: document.querySelector<HTMLElement>('[data-charges]'),
        today: localToday,
      }),
      steps: STEPS,
      keptReviewKey: 'eslojusto-revision-permanencia-en-pago',
      paidReview: (r) => telecomCase(r, norms),
      decorateResult: () => {},
      restore: (saved) => saved,
    },
  });
}
