import { documentsAnalytics } from '../analytics/documents';
import { track } from '../analytics/posthog';
import type { SectionForm } from '../calculator/section';
import { DOCUMENTS } from '../documents/config';
import { MORTGAGE_EXTRACTION } from '../documents/contract';
import type { LegalInterestTable } from '../engine/law/interest';
import { pageTranslator, type ClientKey, type Translate } from '../i18n/client';
import { mortgageCase } from '../mortgage/case';
import type { CompletedMortgageReview } from '../mortgage/ports';
import { mortgageReading } from '../mortgage/reading';
import { STEPS } from '../mortgage/steps';
import { READS_UNMEASURED, wireDocuments, type ReviewHooks } from './documents';

// The shared message the mortgage page words its own way: what a value worked out from the
// documents comes from.
const MORTGAGE_COPY: Partial<Record<ClientKey, ClientKey>> = {
  'client.documents.mark_derived': 'client.mortgage.documents.mark_derived',
};

const mortgageCopy =
  (tr: Translate): Translate =>
  (key, vars) =>
    tr(MORTGAGE_COPY[key] ?? key, vars);

// Document reading, the pass, the report and the letters on the mortgage review's page: the deed
// and the invoices fill its sheets. The pass unlocks the report and the amounts letter; the request
// for the mortgage's documents downloads without it. The legal interest table is the one the review
// read.
export function wireMortgageDocuments(
  mortgage: SectionForm,
  hooks: ReviewHooks<CompletedMortgageReview>,
  arrival: { hash: string; search: string },
  legalInterest: LegalInterestTable,
): void {
  const tr = mortgageCopy(pageTranslator());
  wireDocuments({
    form: mortgage,
    hooks,
    arrival,
    config: DOCUMENTS,
    tr,
    // The review measures nothing yet, so neither do its reads: no event of it is in the
    // analytics catalogue. The pass is measured as on every page.
    events: { ...documentsAnalytics(track), ...READS_UNMEASURED },
    section: {
      extraction: MORTGAGE_EXTRACTION,
      reading: mortgageReading(mortgage.form, tr),
      steps: STEPS,
      keptReviewKey: 'eslojusto-revision-hipoteca-en-pago',
      paidReview: (r) => mortgageCase(r, legalInterest),
      decorateResult: () => {},
      restore: (saved) => saved,
    },
  });
}
