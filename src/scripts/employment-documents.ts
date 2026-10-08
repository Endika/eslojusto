import { DOCUMENTS } from '../documents/config';
import { EMPLOYMENT_EXTRACTION } from '../documents/contract';
import type { DocumentEvents } from '../documents/ports';
import { employmentCase } from '../employment/case';
import type { EmploymentCalculator } from '../employment/main';
import type { CompletedEmploymentReview } from '../employment/ports';
import { employmentReading } from '../employment/reading';
import { STEPS } from '../employment/steps';
import { pageTranslator, type ClientKey, type Translate } from '../i18n/client';
import type { EmploymentDeps } from '../engine/employment/review';
import { localToday } from './clock';
import { wireDocuments, type ReviewHooks } from './documents';

// The shared messages the contract page words its own way: what a value worked out from the
// documents comes from, and what the pass keeps once paid.
const EMPLOYMENT_COPY: Partial<Record<ClientKey, ClientKey>> = {
  'client.documents.mark_derived': 'client.employment.documents.mark_derived',
  'client.documents.error.pass_invalid': 'client.employment.documents.error.pass_invalid',
  'client.documents.error.pass_exhausted': 'client.employment.documents.error.pass_exhausted',
  'client.documents.pass.issued': 'client.employment.documents.pass.issued',
  'client.documents.pass.lost': 'client.employment.documents.pass.lost',
};

const employmentCopy =
  (tr: Translate): Translate =>
  (key, vars) =>
    tr(EMPLOYMENT_COPY[key] ?? key, vars);

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

// Document reading and the pass on the contract review's page. The pass unlocks the detail of
// each point, the report and the letter to the company; the letters that only ask for information
// download without it. The tables are the ones the review read.
export function wireEmploymentDocuments(
  employment: EmploymentCalculator,
  hooks: ReviewHooks<CompletedEmploymentReview>,
  arrival: { hash: string; search: string },
  tables: EmploymentDeps,
): void {
  const tr = employmentCopy(pageTranslator());
  wireDocuments({
    form: employment,
    hooks,
    arrival,
    config: DOCUMENTS,
    tr,
    events: quiet,
    section: {
      extraction: EMPLOYMENT_EXTRACTION,
      reading: employmentReading(employment.form, tr),
      steps: STEPS,
      keptReviewKey: 'eslojusto-revision-contrato-en-pago',
      // The review was just worked out: its years run up to today.
      paidReview: (r) => employmentCase(r, localToday(), tables),
      decorateResult: () => {},
      restore: (saved) => saved,
    },
  });
}
