import type { CalculatorEvents } from '../calculator/ports';
import {
  changedFields,
  reviewProps,
  sectionSecondsBucket,
  snapshot,
  type Props,
  type Section,
  type Snapshot,
  type Track,
  type TrackableField,
} from './events';

// The calculator's events as catalogue events. The catalogue's «section» is the step. Kept for this
// page view only: when each step and the whole run started, how many reviews were made, and the
// previous answers, only to name what changed.
export function calculatorAnalytics(track: Track, now: () => number): CalculatorEvents {
  let viewedSection: Section | null = null;
  let sectionEnteredAt = 0;
  let start: number | null = null;
  let attempts = 0;
  let previous: Snapshot | null = null;
  const secondsSince = (t: number) => (now() - t) / 1000;

  return {
    stepShown(step) {
      if (step === viewedSection) return;
      viewedSection = step;
      sectionEnteredAt = now();
      start ??= sectionEnteredAt;
      track('section_viewed', { section: viewedSection });
    },
    stepCompleted(step) {
      track('section_completed', {
        section: step,
        seconds: sectionSecondsBucket(secondsSince(sectionEnteredAt)),
      });
    },
    wentBack(from, to) {
      track('went_back', { from, to });
    },
    fieldRejected(step, field) {
      track('validation_error', { section: step, field: field as TrackableField });
    },
    reviewCompleted({ review, input, figures, benefit, otherContracts, detail }) {
      attempts += 1;
      const answers = snapshot(input, figures);
      track(
        'review_completed',
        reviewProps({
          review,
          input,
          attempt: attempts,
          changedFields: changedFields(previous, answers),
          seconds: secondsSince(start ?? sectionEnteredAt),
          benefit,
          otherContracts,
          detail,
        }),
      );
      previous = answers;
    },
    helpOpened(topic) {
      track('help_opened', { topic: topic as Props<'help_opened'>['topic'] });
    },
    detailOpened(item) {
      track('detail_opened', { item });
    },
    startedOver() {
      track('started_over', {});
    },
  };
}
