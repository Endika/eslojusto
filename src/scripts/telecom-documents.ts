import { telecomCase } from '../bills/telecom/case';
import type { CompletedTelecomReview } from '../bills/telecom/ports';
import { telecomReading } from '../bills/telecom/reading';
import { STEPS } from '../bills/telecom/steps';
import type { SectionForm } from '../calculator/section';
import { DOCUMENTS } from '../documents/config';
import { TELECOM_EXTRACTION } from '../documents/contract';
import { billsTranslator } from './bills-copy';
import { UNMEASURED, wireDocuments, type ReviewHooks } from './documents';

// Document reading and the pass on the telecom review's page: the contract and the bills fill its
// sheets, and the pass unlocks the report.
export function wireTelecomDocuments(
  telecom: SectionForm,
  hooks: ReviewHooks<CompletedTelecomReview>,
  arrival: { hash: string; search: string },
): void {
  const tr = billsTranslator();
  wireDocuments({
    form: telecom,
    hooks,
    arrival,
    config: DOCUMENTS,
    tr,
    // The review measures nothing yet, and neither does its pass.
    events: UNMEASURED,
    section: {
      extraction: TELECOM_EXTRACTION,
      reading: telecomReading(telecom.form, tr),
      steps: STEPS,
      keptReviewKey: 'eslojusto-revision-permanencia-en-pago',
      paidReview: telecomCase,
      decorateResult: () => {},
      restore: (saved) => saved,
    },
  });
}
