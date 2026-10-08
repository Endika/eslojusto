import { DOCUMENTS } from '../documents/config';
import { RENTAL_EXTRACTION } from '../documents/contract';
import type { DocumentEvents } from '../documents/ports';
import { pageTranslator, type ClientKey, type Translate } from '../i18n/client';
import type { RentalCalculator } from '../rental/main';
import type { CompletedRentalReview } from '../rental/ports';
import { rentalReading } from '../rental/reading';
import { STEPS } from '../rental/steps';
import { wireDocuments, type ReviewHooks } from './documents';

// The shared messages the rental page words its own way: what a value worked out from the
// documents comes from, and what the pass keeps once paid.
const RENTAL_COPY: Partial<Record<ClientKey, ClientKey>> = {
  'client.documents.mark_derived': 'client.rental.documents.mark_derived',
  'client.documents.error.pass_invalid': 'client.rental.documents.error.pass_invalid',
  'client.documents.error.pass_exhausted': 'client.rental.documents.error.pass_exhausted',
  'client.documents.pass.issued': 'client.rental.documents.pass.issued',
  'client.documents.pass.lost': 'client.rental.documents.pass.lost',
};

const rentalCopy =
  (tr: Translate): Translate =>
  (key, vars) =>
    tr(RENTAL_COPY[key] ?? key, vars);

// Reading documents and the pass are measured only on the final pay's page for now.
const quiet: DocumentEvents = {
  startChosen() {},
  uploadStarted() {},
  extractionCompleted() {},
  extractionFailed() {},
  nothingRead() {},
  qualityWarned() {},
  qualityOverridden() {},
  checkoutStarted() {},
  passIssued() {},
  passFailed() {},
  passVerified() {},
  downloaded() {},
};

// Document reading and the pass on the rental review's page. The pass unlocks the detail of each
// item; nothing else is paid for here yet.
export function wireRentalDocuments(
  rental: RentalCalculator,
  hooks: ReviewHooks<CompletedRentalReview>,
  arrival: { hash: string; search: string },
): void {
  const tr = rentalCopy(pageTranslator());
  wireDocuments({
    form: rental,
    hooks,
    arrival,
    config: DOCUMENTS,
    tr,
    events: quiet,
    section: {
      extraction: RENTAL_EXTRACTION,
      reading: rentalReading(rental.form, tr),
      steps: STEPS,
      keptReviewKey: 'eslojusto-revision-alquiler-en-pago',
      paidReview: (r) => ({ offer: r.review.offerPass }),
      decorateResult: () => {},
      restore: (saved) => saved,
    },
  });
}
