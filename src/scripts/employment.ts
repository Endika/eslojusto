import { employmentAnalytics } from '../analytics/employment';
import { track } from '../analytics/posthog';
import { EMPLOYMENT_NORMS } from '../engine/employment/data/norms';
import { MINIMUM_WAGE } from '../engine/employment/data/minimum-wage';
import { DOCUMENTS_BUILD } from '../documents/config';
import { pageTranslator } from '../i18n/client';
import { setUpEmployment } from '../employment/main';
import type { CompletedEmploymentReview, Detail, EmploymentEvents } from '../employment/ports';
import { localToday } from './clock';

// The review's address as it arrived, before the form rewrites its fragment.
const arrival = { hash: location.hash, search: location.search };

// Read inline, as on the final pay's page, so a build without the API drops every document branch.
const documentsBuild =
  !!(
    import.meta.env.PUBLIC_API_EXTRACT_URL &&
    import.meta.env.PUBLIC_API_CHECKOUT_URL &&
    import.meta.env.PUBLIC_API_PASS_URL &&
    import.meta.env.PUBLIC_TURNSTILE_SITE_KEY
  ) && DOCUMENTS_BUILD;
// Until the document module says whether a pass is there, the result shows its detail; without
// the documents API it always does.
let detail: () => Detail = () => 'unlocked';
const reviewed: ((r: CompletedEmploymentReview) => void)[] = [];
const restarted: (() => void)[] = [];

const analytics = employmentAnalytics(track, () => performance.now());
// Reading documents and the pass listen to the same completed review and restart as analytics.
const events: EmploymentEvents = {
  ...analytics,
  reviewCompleted(r) {
    analytics.reviewCompleted(r);
    for (const listener of reviewed) listener(r);
  },
  startedOver() {
    analytics.startedOver();
    for (const listener of restarted) listener();
  },
};

const tables = { norms: EMPLOYMENT_NORMS, minimumWage: MINIMUM_WAGE };
const employment = setUpEmployment(document.body, {
  events,
  today: localToday,
  tr: pageTranslator(),
  tables,
  detail: () => detail(),
});

if (documentsBuild) {
  import('./employment-documents')
    .then(({ wireEmploymentDocuments }) =>
      wireEmploymentDocuments(
        employment,
        {
          onReview: (listener) => reviewed.push(listener),
          onRestart: (listener) => restarted.push(listener),
          detail: (state) => (detail = state),
        },
        arrival,
        tables,
      ),
    )
    // Without the document module the page is still the review.
    .catch(() => {
      employment.form.hidden = false;
      const tabs = document.querySelector<HTMLElement>('.tabs');
      if (tabs) tabs.hidden = false;
      document.querySelector<HTMLElement>('[data-documents-start]')?.remove();
    });
}
