import { electricityAnalytics } from '../analytics/bills';
import { track } from '../analytics/posthog';
import type { Detail } from '../calculator/ports';
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

// Until the document module says whether a pass is there and whether the year offers it, the
// result shows which lines they are and the report counts as shown; without the documents API there
// is no pass to lock them.
let detail: () => Detail = () => 'unlocked';
let yearOffer: (r: CompletedElectricityReview) => boolean = () => false;
const reviewed: ((r: CompletedElectricityReview) => void)[] = [];
const cleared: (() => void)[] = [];

const analytics = electricityAnalytics(
  track,
  () => performance.now(),
  () => detail(),
);
// The measurement hears every event; the documents follow each review shown and each one cleared.
const events: ElectricityEvents = {
  ...analytics,
  reviewCompleted(r) {
    analytics.reviewCompleted(r);
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
  detail: () => detail(),
  offered: (r) => yearOffer(r),
});

if (documentsBuild) {
  import('./electricity-documents')
    .then(({ wireElectricityDocuments }) =>
      wireElectricityDocuments(
        electricity,
        {
          onReview: (listener) => reviewed.push(listener),
          onRestart: (listener) => cleared.push(listener),
          // The pass shows which lines they are and unlocks the report and the letter.
          detail: (state) => (detail = state),
        },
        arrival,
        BILLS_NORMS,
        analytics,
        (offered) => (yearOffer = offered),
      ),
    )
    .catch((error: unknown) => withoutDocuments(electricity.form, error));
}
