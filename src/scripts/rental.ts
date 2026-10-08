import { RENTAL_TABLES } from '../engine/rental/data/tables';
import { DOCUMENTS_BUILD } from '../documents/config';
import { pageTranslator } from '../i18n/client';
import { setUpRental } from '../rental/main';
import type { CompletedRentalReview, Detail, RentalEvents } from '../rental/ports';
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
const reviewed: ((r: CompletedRentalReview) => void)[] = [];
const restarted: (() => void)[] = [];

// The rental review measures nothing yet: its events reach no one until they have a catalogue,
// except reading documents and the pass, which listen to a completed review and a restart.
const events: RentalEvents = {
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

const rental = setUpRental(document.body, {
  events,
  today: localToday,
  tr: pageTranslator(),
  tables: RENTAL_TABLES,
  detail: () => detail(),
});

if (documentsBuild) {
  import('./rental-documents')
    .then(({ wireRentalDocuments }) =>
      wireRentalDocuments(
        rental,
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
      rental.form.hidden = false;
      const tabs = document.querySelector<HTMLElement>('.tabs');
      if (tabs) tabs.hidden = false;
      document.querySelector<HTMLElement>('[data-documents-start]')?.remove();
    });
}
