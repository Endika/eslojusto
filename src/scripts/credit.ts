import { CREDIT_NORMS } from '../engine/credit/data/norms';
import { CREDIT_SOURCES } from '../engine/credit/data/sources';
import { BE1904 } from '../engine/credit/data/be1904';
import { creditAnalytics } from '../analytics/credit';
import { track } from '../analytics/posthog';
import type { Detail } from '../calculator/flow';
import { DOCUMENTS_BUILD } from '../documents/config';
import type { PassMode } from '../documents/ports';
import { setUpCredit } from '../credit/main';
import type { CompletedCreditReview, CreditEvents } from '../credit/ports';
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
// Until the document module says whether a pass is there, the result shows every point; without
// the documents API there is no pass to lock them.
let detail: () => Detail = () => 'unlocked';
const reviewed: ((r: CompletedCreditReview) => void)[] = [];
const cleared: (() => void)[] = [];

// Until the document module says how the pass shows under a review, it shows none; without the
// documents API there is no pass.
let pass: (r: CompletedCreditReview) => PassMode = () => 'none';
const analytics = creditAnalytics(
  track,
  () => performance.now(),
  () => detail(),
  (r) => pass(r),
);
// The measurement hears every event; the pass listens to each review shown and each one cleared.
const events: CreditEvents = {
  ...analytics,
  reviewCompleted(r) {
    analytics.reviewCompleted(r);
    for (const listener of reviewed) listener(r);
  },
  reviewCleared() {
    for (const listener of cleared) listener();
  },
};

const tables = {
  norms: CREDIT_NORMS,
  sources: CREDIT_SOURCES,
  rates: {
    'BE_19_4.7': BE1904['BE_19_4.7'],
    'BE_19_4.9': BE1904['BE_19_4.9'],
    'BE_19_4.10': BE1904['BE_19_4.10'],
    'BE_19_4.11': BE1904['BE_19_4.11'],
  },
};
const credit = setUpCredit(document.body, {
  events,
  today: localToday,
  tr: pageTranslator(),
  tables,
  detail: () => detail(),
});

if (documentsBuild) {
  import('./credit-documents')
    .then(({ wireCreditDocuments }) =>
      wireCreditDocuments(
        credit,
        {
          onReview: (listener) => reviewed.push(listener),
          onRestart: (listener) => cleared.push(listener),
          // The pass shows which points they are and unlocks the report and the repayment letter.
          detail: (state) => (detail = state),
          pass: (state) => (pass = state),
        },
        arrival,
        tables.norms,
      ),
    )
    .catch((error: unknown) => withoutDocuments(credit.form, error));
}
