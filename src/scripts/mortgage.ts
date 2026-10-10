import { LEGAL_INTEREST } from '../engine/law/data/legal-interest';
import { MORTGAGE_NORMS } from '../engine/mortgage/data/norms';
import { MORTGAGE_SOURCES } from '../engine/mortgage/data/sources';
import { CASE_LAW_RULES } from '../engine/mortgage/rules';
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

const reviewed: ((r: CompletedMortgageReview) => void)[] = [];
const cleared: (() => void)[] = [];

// The mortgage review measures nothing yet: no event of it is in the analytics catalogue. The pass
// listens to each review shown and each one cleared.
const events: MortgageEvents = {
  stepShown() {},
  wentBack() {},
  stepCompleted() {},
  fieldRejected() {},
  helpOpened() {},
  startedOver() {},
  reviewCompleted(r) {
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
          // Nothing in the mortgage result is locked.
          detail: () => {},
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
