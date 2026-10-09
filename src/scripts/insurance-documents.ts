import { documentsAnalytics } from '../analytics/documents';
import { track } from '../analytics/posthog';
import { DOCUMENTS } from '../documents/config';
import type { SectionForm } from '../calculator/section';
import { insuranceCase } from '../insurance/case';
import type { CompletedInsuranceReview } from '../insurance/ports';
import { pageTranslator } from '../i18n/client';
import { wirePass, type ReviewHooks } from './documents';

// The letter on the insurance review's page, which reads no documents yet and never offers the
// pass: the letter that says the policy is not to be extended downloads free, and a pass already
// held downloads the report.
export function wireInsuranceDocuments(
  insurance: SectionForm,
  hooks: ReviewHooks<CompletedInsuranceReview>,
  arrival: { search: string },
): void {
  wirePass({
    form: insurance,
    hooks,
    arrival,
    review: 'insurance',
    config: DOCUMENTS,
    tr: pageTranslator(),
    events: documentsAnalytics(track),
    section: {
      keptReviewKey: 'eslojusto-revision-seguros-en-pago',
      paidReview: insuranceCase,
      decorateResult: () => {},
      restore: (saved) => saved,
    },
  });
}
