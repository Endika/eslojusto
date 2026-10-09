import { documentsAnalytics } from '../analytics/documents';
import { track } from '../analytics/posthog';
import type { SectionForm } from '../calculator/section';
import { DOCUMENTS } from '../documents/config';
import { INSURANCE_EXTRACTION } from '../documents/contract';
import { pageTranslator, type ClientKey, type Translate } from '../i18n/client';
import { insuranceCase } from '../insurance/case';
import type { CompletedInsuranceReview } from '../insurance/ports';
import { insuranceReading } from '../insurance/reading';
import { STEPS } from '../insurance/steps';
import { READS_UNMEASURED, wireDocuments, type ReviewHooks } from './documents';

// The shared message the insurance page words its own way: what a value worked out from the
// documents comes from.
const INSURANCE_COPY: Partial<Record<ClientKey, ClientKey>> = {
  'client.documents.mark_derived': 'client.insurance.documents.mark_derived',
};

const insuranceCopy =
  (tr: Translate): Translate =>
  (key, vars) =>
    tr(INSURANCE_COPY[key] ?? key, vars);

// Document reading and the letter on the insurance review's page, which never offers the pass:
// the letter that says the policy is not to be extended downloads free, and a pass already held
// pays for the reads and downloads the report.
export function wireInsuranceDocuments(
  insurance: SectionForm,
  hooks: ReviewHooks<CompletedInsuranceReview>,
  arrival: { hash: string; search: string },
): void {
  const tr = insuranceCopy(pageTranslator());
  wireDocuments({
    form: insurance,
    hooks,
    arrival,
    config: DOCUMENTS,
    tr,
    // The review measures nothing yet, so neither do its reads: no event of it is in the
    // analytics catalogue. The pass is measured as on every page.
    events: { ...documentsAnalytics(track), ...READS_UNMEASURED },
    section: {
      extraction: INSURANCE_EXTRACTION,
      reading: insuranceReading(insurance.form, tr),
      steps: STEPS,
      keptReviewKey: 'eslojusto-revision-seguros-en-pago',
      paidReview: insuranceCase,
      decorateResult: () => {},
      restore: (saved) => saved,
    },
  });
}
