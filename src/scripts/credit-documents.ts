import { documentsAnalytics } from '../analytics/documents';
import { track } from '../analytics/posthog';
import { DOCUMENTS } from '../documents/config';
import type { SectionForm } from '../calculator/section';
import { creditCase } from '../credit/case';
import type { CompletedCreditReview } from '../credit/ports';
import type { NormTable } from '../engine/credit/norms';
import { pageTranslator } from '../i18n/client';
import { wirePass, type ReviewHooks } from './documents';

// The pass, the report and the letters on the credit review's page, which reads no documents yet.
// The pass unlocks the report and the early repayment letter; the request for the credit's
// information downloads without it. The norms are the ones the review read.
export function wireCreditDocuments(
  credit: SectionForm,
  hooks: ReviewHooks<CompletedCreditReview>,
  arrival: { search: string },
  norms: NormTable,
): void {
  wirePass({
    form: credit,
    hooks,
    arrival,
    review: 'credit',
    config: DOCUMENTS,
    tr: pageTranslator(),
    events: documentsAnalytics(track),
    section: {
      keptReviewKey: 'eslojusto-revision-financiacion-en-pago',
      paidReview: (r) => creditCase(r, norms),
      decorateResult: () => {},
      restore: (saved) => saved,
    },
  });
}
