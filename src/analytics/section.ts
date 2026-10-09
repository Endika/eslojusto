import { sectionSecondsBucket, type Props, type Section, type Track } from './events';

// The events every review walked through the shared sheets reports the same way: steps, field
// names and question ids only. Kept for this page view: when each step and the whole run started,
// and how many reviews.
export function sectionAnalytics<S extends Section>(track: Track, now: () => number) {
  let viewedSection: Section | null = null;
  let sectionEnteredAt = 0;
  let start: number | null = null;
  let attempts = 0;
  const secondsSince = (t: number) => (now() - t) / 1000;

  return {
    events: {
      stepShown(step: S) {
        if (step === viewedSection) return;
        viewedSection = step;
        sectionEnteredAt = now();
        start ??= sectionEnteredAt;
        track('section_viewed', { section: step });
      },
      stepCompleted(step: S) {
        track('section_completed', {
          section: step,
          seconds: sectionSecondsBucket(secondsSince(sectionEnteredAt)),
        });
      },
      wentBack(from: S, to: S) {
        track('went_back', { from, to });
      },
      fieldRejected(step: S, field: string) {
        track('validation_error', {
          section: step,
          field: field as Props<'validation_error'>['field'],
        });
      },
      helpOpened(topic: string) {
        track('help_opened', { topic: topic as Props<'help_opened'>['topic'] });
      },
      startedOver() {
        track('started_over', {});
      },
    },
    // Counts a finished review and gives its attempt and how long the whole run took.
    reviewed(): { attempt: number; seconds: number } {
      attempts += 1;
      return { attempt: attempts, seconds: secondsSince(start ?? sectionEnteredAt) };
    },
  };
}
