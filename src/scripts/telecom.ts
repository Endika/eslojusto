import { telecomAnalytics } from '../analytics/bills';
import { track } from '../analytics/posthog';
import type { Detail } from '../calculator/flow';
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

// Until the document module says whether a pass is there, the result shows which items they are;
// without the documents API there is no pass to lock them.
let detail: () => Detail = () => 'unlocked';
const reviewed: ((r: CompletedTelecomReview) => void)[] = [];
const cleared: (() => void)[] = [];

const analytics = telecomAnalytics(track, () => performance.now());
// The measurement hears every event; the documents follow each review shown and each one cleared.
const events: TelecomEvents = {
  ...analytics,
  reviewCompleted(r) {
    analytics.reviewCompleted(r);
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
  detail: () => detail(),
});

if (documentsBuild) {
  import('./telecom-documents')
    .then(({ wireTelecomDocuments }) =>
      wireTelecomDocuments(
        telecom,
        {
          onReview: (listener) => reviewed.push(listener),
          onRestart: (listener) => cleared.push(listener),
          // The pass shows which items they are and unlocks the report and the penalty letter.
          detail: (state) => (detail = state),
        },
        arrival,
        BILLS_NORMS,
      ),
    )
    .catch((error: unknown) => withoutDocuments(telecom.form, error));
}
