import type { CalculatorEvents, CompletedReview, RevealArm, Step } from '../calculator/ports';
import type { PassMode } from '../documents/ports';
import { changedFields, reviewProps, snapshot, type Snapshot, type Track } from './events';
import { sectionAnalytics } from './section';

// The calculator's events as catalogue events. The catalogue's «section» is the step. Kept for this
// page view only: when each step and the whole run started, how many reviews were made, and the
// previous answers, only to name what changed. `pass` tells how the pass shows under a review.
export function calculatorAnalytics(
  track: Track,
  now: () => number,
  pass: (r: CompletedReview) => PassMode,
  reveal: RevealArm = 'instant',
): CalculatorEvents {
  const { events, reviewed } = sectionAnalytics<Step>(track, now);
  let previous: Snapshot | null = null;

  return {
    ...events,
    reviewCompleted(completed) {
      const { review, input, figures, benefit, otherContracts, detail } = completed;
      const answers = snapshot(input, figures);
      track(
        'review_completed',
        reviewProps({
          review,
          input,
          ...reviewed(),
          changedFields: changedFields(previous, answers),
          benefit,
          otherContracts,
          detail,
          pass: pass(completed),
          reveal,
        }),
      );
      previous = answers;
    },
    detailOpened(item) {
      track('detail_opened', { item });
    },
  };
}
