import { BILLS_NORMS } from '../engine/bills/data/norms';
import { BILLS_TABLES } from '../engine/bills/data/tables';
import { setUpElectricity } from '../bills/electricity/main';
import type { CompletedElectricityReview, ElectricityEvents } from '../bills/electricity/ports';
import { DOCUMENTS_BUILD } from '../documents/config';
import { pageTranslator } from '../i18n/client';
import { localToday } from './clock';
import { withoutDocuments } from './without-documents';

// The review's address as it arrived, before the form rewrites its fragment.
const arrival = { hash: location.hash, search: location.search };

// Read inline, as on the other reviews' pages, so a build without the API drops every document
// branch.
const documentsBuild =
  !!(
    import.meta.env.PUBLIC_API_EXTRACT_URL &&
    import.meta.env.PUBLIC_API_CHECKOUT_URL &&
    import.meta.env.PUBLIC_API_PASS_URL &&
    import.meta.env.PUBLIC_TURNSTILE_SITE_KEY
  ) && DOCUMENTS_BUILD;

const reviewed: ((r: CompletedElectricityReview) => void)[] = [];
const cleared: (() => void)[] = [];

// Nothing on this page is measured yet: every event the review reports is heard by no one but the
// documents, which follow each review shown and each one cleared.
const ignore = () => undefined;
const events: ElectricityEvents = {
  stepShown: ignore,
  wentBack: ignore,
  stepCompleted: ignore,
  fieldRejected: ignore,
  helpOpened: ignore,
  startedOver: ignore,
  outOfScope: ignore,
  reviewCompleted(r) {
    for (const listener of reviewed) listener(r);
  },
  reviewCleared() {
    for (const listener of cleared) listener();
  },
};

const electricity = setUpElectricity(document.body, {
  events,
  today: localToday,
  tr: pageTranslator(),
  tables: { norms: BILLS_NORMS, tables: BILLS_TABLES },
});

if (documentsBuild) {
  import('./electricity-documents')
    .then(({ wireElectricityDocuments }) =>
      wireElectricityDocuments(
        electricity,
        {
          onReview: (listener) => reviewed.push(listener),
          onRestart: (listener) => cleared.push(listener),
          // Nothing in the bills result is locked.
          detail: () => {},
        },
        arrival,
      ),
    )
    .catch((error: unknown) => withoutDocuments(electricity.form, error));
}
