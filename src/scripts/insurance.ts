import { INSURANCE_NORMS } from '../engine/insurance/data/norms';
import { DOCUMENTS_BUILD } from '../documents/config';
import { pageTranslator } from '../i18n/client';
import { setUpInsurance } from '../insurance/main';
import type { CompletedInsuranceReview, InsuranceEvents } from '../insurance/ports';
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
const reviewed: ((r: CompletedInsuranceReview) => void)[] = [];
const cleared: (() => void)[] = [];

// The insurance review measures nothing yet: no event of it is in the analytics catalogue. The
// letter listens to each review shown and each one cleared.
const events: InsuranceEvents = {
  stepShown() {},
  wentBack() {},
  reviewCompleted(r) {
    for (const listener of reviewed) listener(r);
  },
  reviewCleared() {
    for (const listener of cleared) listener();
  },
};

const insurance = setUpInsurance(document.body, {
  events,
  today: localToday,
  tr: pageTranslator(),
  tables: { norms: INSURANCE_NORMS },
});

if (documentsBuild) {
  import('./insurance-documents')
    .then(({ wireInsuranceDocuments }) =>
      wireInsuranceDocuments(
        insurance,
        {
          onReview: (listener) => reviewed.push(listener),
          onRestart: (listener) => cleared.push(listener),
          // Nothing in the insurance result is locked.
          detail: () => {},
        },
        arrival,
      ),
    )
    // Without the document module the page is still the review.
    .catch(() => {
      insurance.form.hidden = false;
      const tabs = document.querySelector<HTMLElement>('.tabs');
      if (tabs) tabs.hidden = false;
      document.querySelector<HTMLElement>('[data-documents-start]')?.remove();
    });
}
