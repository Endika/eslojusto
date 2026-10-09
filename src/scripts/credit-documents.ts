import { documentsAnalytics } from '../analytics/documents';
import { track } from '../analytics/posthog';
import type { SectionForm } from '../calculator/section';
import { creditCase } from '../credit/case';
import type { CompletedCreditReview } from '../credit/ports';
import { creditReading } from '../credit/reading';
import { STEPS } from '../credit/steps';
import { DOCUMENTS } from '../documents/config';
import { CREDIT_EXTRACTION } from '../documents/contract';
import type { NormTable } from '../engine/credit/norms';
import { pageTranslator, type ClientKey, type Translate } from '../i18n/client';
import { READS_UNMEASURED, wireDocuments, type ReviewHooks } from './documents';

// The shared message the credit page words its own way: what a value worked out from the
// documents comes from.
const CREDIT_COPY: Partial<Record<ClientKey, ClientKey>> = {
  'client.documents.mark_derived': 'client.credit.documents.mark_derived',
};

const creditCopy =
  (tr: Translate): Translate =>
  (key, vars) =>
    tr(CREDIT_COPY[key] ?? key, vars);

// Document reading, the pass, the report and the letters on the credit review's page. The pass
// unlocks the report and the early repayment letter; the request for the credit's information
// downloads without it. The norms are the ones the review read.
export function wireCreditDocuments(
  credit: SectionForm,
  hooks: ReviewHooks<CompletedCreditReview>,
  arrival: { hash: string; search: string },
  norms: NormTable,
): void {
  const tr = creditCopy(pageTranslator());
  wireDocuments({
    form: credit,
    hooks,
    arrival,
    config: DOCUMENTS,
    tr,
    // The review measures nothing yet, so neither do its reads: no event of it is in the
    // analytics catalogue. The pass is measured as on every page.
    events: { ...documentsAnalytics(track), ...READS_UNMEASURED },
    section: {
      extraction: CREDIT_EXTRACTION,
      reading: creditReading(credit.form, tr),
      steps: STEPS,
      keptReviewKey: 'eslojusto-revision-financiacion-en-pago',
      paidReview: (r) => creditCase(r, norms),
      decorateResult: () => {},
      restore: (saved) => saved,
    },
  });
}
