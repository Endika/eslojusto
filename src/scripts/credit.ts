import { CREDIT_NORMS } from '../engine/credit/data/norms';
import { CREDIT_SOURCES } from '../engine/credit/data/sources';
import { BE1904 } from '../engine/credit/data/be1904';
import { DOCUMENTS_BUILD } from '../documents/config';
import { setUpCredit } from '../credit/main';
import type { CompletedCreditReview, CreditEvents } from '../credit/ports';
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
const reviewed: ((r: CompletedCreditReview) => void)[] = [];
const cleared: (() => void)[] = [];

// The credit review measures nothing yet: no event of it is in the analytics catalogue. The pass
// listens to each review shown and each one cleared.
const events: CreditEvents = {
  stepShown() {},
  wentBack() {},
  reviewCompleted(r) {
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
});

if (documentsBuild) {
  import('./credit-documents')
    .then(({ wireCreditDocuments }) =>
      wireCreditDocuments(
        credit,
        {
          onReview: (listener) => reviewed.push(listener),
          onRestart: (listener) => cleared.push(listener),
          // Nothing in the credit result is locked.
          detail: () => {},
        },
        arrival,
        tables.norms,
      ),
    )
    // Without the document module the page is still the review.
    .catch(() => {
      credit.form.hidden = false;
      const tabs = document.querySelector<HTMLElement>('.tabs');
      if (tabs) tabs.hidden = false;
      document.querySelector<HTMLElement>('[data-documents-start]')?.remove();
    });
}
