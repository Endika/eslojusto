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

// The contract review measures nothing yet: its events reach no one until they have a catalogue,
// except reading documents and the pass, which listen to a completed review and a restart.
const events: EmploymentEvents = {
  stepShown() {},
  stepCompleted() {},
  wentBack() {},
  fieldRejected() {},
  outOfScope() {},
  reviewCompleted(r) {
    for (const listener of reviewed) listener(r);
  },
  startedOver() {
    for (const listener of restarted) listener();
  },
};

const employment = setUpEmployment(document.body, {
  events,
  today: localToday,
  tr: pageTranslator(),
  tables: { norms: EMPLOYMENT_NORMS, minimumWage: MINIMUM_WAGE },
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
