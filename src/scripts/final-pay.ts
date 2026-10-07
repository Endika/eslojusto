import { calculatorAnalytics } from '../analytics/calculator';
import { track } from '../analytics/posthog';
import { setUpCalculator } from '../calculator/main';
import type { CalculatorEvents, CompletedReview, Detail } from '../calculator/ports';
import { pageTranslator } from '../i18n/client';
import { DOCUMENTS_BUILD } from '../documents/config';
import { localToday } from './clock';

const analytics = calculatorAnalytics(track, () => performance.now());
// The calculator rewrites the fragment as it opens, so the address it arrived at is kept first.
const arrival = { hash: location.hash, search: location.search };

// The variables are read inline so a build without them folds this to false and drops every
// document branch below; with them, the same check as the pages make.
const documentsBuild =
  !!(
    import.meta.env.PUBLIC_API_EXTRACT_URL &&
    import.meta.env.PUBLIC_API_CHECKOUT_URL &&
    import.meta.env.PUBLIC_API_PASS_URL &&
    import.meta.env.PUBLIC_TURNSTILE_SITE_KEY
  ) && DOCUMENTS_BUILD;
// Until the document module says whether a pass is there, the result shows its detail.
let detail: () => Detail = () => 'unlocked';
const reviewed: ((r: CompletedReview) => void)[] = [];
const restarted: (() => void)[] = [];

// Document reading listens to the same events as analytics; without its API, nothing else listens.
const events: CalculatorEvents = documentsBuild
  ? {
      ...analytics,
      reviewCompleted(r) {
        analytics.reviewCompleted(r);
        for (const listener of reviewed) listener(r);
      },
      startedOver() {
        analytics.startedOver();
        for (const listener of restarted) listener();
      },
    }
  : analytics;

const calculator = setUpCalculator(document.body, {
  events,
  today: localToday,
  tr: pageTranslator(),
  detail: () => detail(),
});

if (documentsBuild) {
  import('./documents')
    .then(({ wireDocuments }) =>
      wireDocuments(
        calculator,
        {
          onReview: (listener) => reviewed.push(listener),
          onRestart: (listener) => restarted.push(listener),
          detail: (state) => (detail = state),
        },
        arrival,
      ),
    )
    // Without the document module the page is still the calculator.
    .catch(() => {
      calculator.form.hidden = false;
      const tabs = document.querySelector<HTMLElement>('.tabs');
      if (tabs) tabs.hidden = false;
      document.querySelector<HTMLElement>('[data-documents-start]')?.remove();
    });
}
