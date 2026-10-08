import { documentsAnalytics } from '../analytics/documents';
import { track } from '../analytics/posthog';
import { DOCUMENTS } from '../documents/config';
import { RENTAL_EXTRACTION } from '../documents/contract';
import { pageTranslator, type ClientKey, type Translate } from '../i18n/client';
import { rentalCase } from '../rental/case';
import type { RentalCalculator } from '../rental/main';
import type { CompletedRentalReview } from '../rental/ports';
import { rentalReading } from '../rental/reading';
import { STEPS } from '../rental/steps';
import { localToday } from './clock';
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

// Document reading and the pass on the rental review's page. The pass unlocks the detail of each
// item, the report and the letters the review has figures for.
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
    events: documentsAnalytics(track),
    section: {
      extraction: RENTAL_EXTRACTION,
      reading: rentalReading(rental.form, tr),
      steps: STEPS,
      keptReviewKey: 'eslojusto-revision-alquiler-en-pago',
      // The review was just worked out: its interest runs up to today.
      paidReview: (r) => rentalCase(r, localToday()),
      decorateResult: () => {},
      restore: (saved) => saved,
    },
  });
}
