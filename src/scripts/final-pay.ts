import { calculatorAnalytics } from '../analytics/calculator';
import { track } from '../analytics/posthog';
import { setUpCalculator } from '../calculator/main';
import type { CalculatorEvents, CompletedReview } from '../calculator/ports';
import { pageTranslator } from '../i18n/client';
import { localToday } from './clock';

const analytics = calculatorAnalytics(track, () => performance.now());
// The calculator rewrites the fragment as it opens, so the address it arrived at is kept first.
const arrival = { hash: location.hash, search: location.search };
const reviewed: ((r: CompletedReview) => void)[] = [];
const restarted: (() => void)[] = [];

// Document reading listens to the same events as analytics; without its API, nothing else listens.
const events: CalculatorEvents = import.meta.env.PUBLIC_API_URL
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
});

if (import.meta.env.PUBLIC_API_URL) {
  import('./documents')
    .then(({ wireDocuments }) =>
      wireDocuments(
        calculator,
        {
          onReview: (listener) => reviewed.push(listener),
          onRestart: (listener) => restarted.push(listener),
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
