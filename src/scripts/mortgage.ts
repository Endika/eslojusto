import { LEGAL_INTEREST } from '../engine/law/data/legal-interest';
import { MORTGAGE_NORMS } from '../engine/mortgage/data/norms';
import { MORTGAGE_SOURCES } from '../engine/mortgage/data/sources';
import { CASE_LAW_RULES } from '../engine/mortgage/rules';
import { mortgageAnalytics } from '../analytics/mortgage';
import { track } from '../analytics/posthog';
import type { Detail } from '../calculator/ports';
import { setUpMortgage } from '../mortgage/main';
import type { CompletedMortgageReview, MortgageEvents } from '../mortgage/ports';
import { DOCUMENTS_BUILD } from '../documents/config';
import { pageTranslator } from '../i18n/client';
import { localToday } from './clock';

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

// Until the document module says whether a pass is there, the report counts as shown; without
// the documents API there is no pass to lock it.
let detail: () => Detail = () => 'unlocked';
const reviewed: ((r: CompletedMortgageReview) => void)[] = [];
const cleared: (() => void)[] = [];

const analytics = mortgageAnalytics(
  track,
  () => performance.now(),
  () => detail(),
);
// The measurement hears every event; the pass listens to each review shown and each one cleared.
const events: MortgageEvents = {
  ...analytics,
  reviewCompleted(r) {
    analytics.reviewCompleted(r);
    for (const listener of reviewed) listener(r);
  },
  reviewCleared() {
    for (const listener of cleared) listener();
  },
};

const mortgage = setUpMortgage(document.body, {
  events,
  today: localToday,
  tr: pageTranslator(),
  tables: {
    norms: MORTGAGE_NORMS,
    sources: MORTGAGE_SOURCES,
    criteria: CASE_LAW_RULES,
    legalInterest: LEGAL_INTEREST,
  },
});

if (documentsBuild) {
  import('./mortgage-documents')
    .then(({ wireMortgageDocuments }) =>
      wireMortgageDocuments(
        mortgage,
        {
          onReview: (listener) => reviewed.push(listener),
          onRestart: (listener) => cleared.push(listener),
          // Nothing in the result is locked; the pass unlocks the report and the amounts letter.
          detail: (state) => (detail = state),
        },
        arrival,
        LEGAL_INTEREST,
      ),
    )
    // Without the document module the page is still the review.
    .catch(() => {
      mortgage.form.hidden = false;
      const tabs = document.querySelector<HTMLElement>('.tabs');
      if (tabs) tabs.hidden = false;
      document.querySelector<HTMLElement>('[data-documents-start]')?.remove();
    });
}
