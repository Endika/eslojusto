import { documentsAnalytics } from '../analytics/documents';
import { track } from '../analytics/posthog';
import { renewalReading } from '../bills/renewal/reading';
import { STEPS } from '../bills/renewal/steps';
import type { SectionForm } from '../calculator/section';
import { DOCUMENTS } from '../documents/config';
import { RENEWAL_EXTRACTION } from '../documents/contract';
import { billsTranslator } from './bills-copy';
import { READS_UNMEASURED, wireReading } from './documents';

// Reading the renewal letter on the review's page: the letter fills its sheets. The review is
// free and sells no pass. `read` is
// told when a letter has filled the form, so the review can say how its answers came.
export function wireRenewalDocuments(
  renewal: SectionForm,
  arrival: { hash: string; search: string },
  read: () => void,
): void {
  const tr = billsTranslator();
  wireReading({
    form: renewal,
    arrival,
    config: DOCUMENTS,
    tr,
    // Its reads send no event, as on the other finance pages; the form's own events say the rest.
    events: { ...documentsAnalytics(track), ...READS_UNMEASURED, extractionCompleted: read },
    section: {
      extraction: RENEWAL_EXTRACTION,
      reading: renewalReading(tr),
      steps: STEPS,
    },
  });
}
