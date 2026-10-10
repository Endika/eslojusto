import type { SectionForm } from '../calculator/section';
import { DOCUMENTS } from '../documents/config';
import { MORTGAGE_EXTRACTION } from '../documents/contract';
import type { DocumentEvents } from '../documents/ports';
import { pageTranslator, type ClientKey, type Translate } from '../i18n/client';
import { mortgageReading } from '../mortgage/reading';
import { STEPS } from '../mortgage/steps';
import { READS_UNMEASURED, wireReading } from './documents';

// The shared message the mortgage page words its own way: what a value worked out from the
// documents comes from.
const MORTGAGE_COPY: Partial<Record<ClientKey, ClientKey>> = {
  'client.documents.mark_derived': 'client.mortgage.documents.mark_derived',
};

const mortgageCopy =
  (tr: Translate): Translate =>
  (key, vars) =>
    tr(MORTGAGE_COPY[key] ?? key, vars);

// The review measures nothing yet, so neither do its reads: no event of it is in the analytics
// catalogue. The page sells no pass, so nothing of one is measured either.
const UNMEASURED: DocumentEvents = {
  ...READS_UNMEASURED,
  checkoutStarted() {},
  passIssued() {},
  passFailed() {},
  passVerified() {},
  downloaded() {},
};

// Document reading on the mortgage review's page: the deed and the invoices fill its sheets.
export function wireMortgageDocuments(mortgage: SectionForm, arrival: { hash: string }): void {
  const tr = mortgageCopy(pageTranslator());
  wireReading({
    form: mortgage,
    arrival,
    config: DOCUMENTS,
    tr,
    events: UNMEASURED,
    section: {
      extraction: MORTGAGE_EXTRACTION,
      reading: mortgageReading(mortgage.form, tr),
      steps: STEPS,
    },
  });
}
