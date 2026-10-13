import { BILLS_NORMS } from '../engine/bills/data/norms';
import { BILLS_SOURCES } from '../engine/bills/data/sources';
import { BILLS_TABLES } from '../engine/bills/data/tables';
import { setUpTelecom } from '../bills/telecom/main';
import type { CompletedTelecomReview, TelecomEvents } from '../bills/telecom/ports';
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

const reviewed: ((r: CompletedTelecomReview) => void)[] = [];
const cleared: (() => void)[] = [];

// Nothing on this page is measured yet: every event the review reports is heard by no one but the
// documents, which follow each review shown and each one cleared.
const ignore = () => undefined;
const events: TelecomEvents = {
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

const telecom = setUpTelecom(document.body, {
  events,
  today: localToday,
  tr: pageTranslator(),
  tables: {
    norms: BILLS_NORMS,
    sources: BILLS_SOURCES,
    tables: { holidays: BILLS_TABLES.holidays },
  },
});

if (documentsBuild) {
  import('./telecom-documents')
    .then(({ wireTelecomDocuments }) =>
      wireTelecomDocuments(
        telecom,
        {
          onReview: (listener) => reviewed.push(listener),
          onRestart: (listener) => cleared.push(listener),
          // Nothing in the bills result is locked.
          detail: () => {},
        },
        arrival,
      ),
    )
    .catch((error: unknown) => withoutDocuments(telecom.form, error));
}
