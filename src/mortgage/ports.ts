import type { SectionEvents } from '../calculator/section';
import type { CivilDate } from '../engine/date';
import type { MortgageReview } from '../engine/mortgage/review';
import type { MortgageDeps, MortgageInput } from '../engine/mortgage/types';
import type { Translate } from '../i18n/client';
import type { Step } from './steps';

export type { Step } from './steps';

export interface CompletedMortgageReview {
  readonly review: MortgageReview;
  readonly input: MortgageInput;
}

// What happens during a visit, for whoever listens; the review does not know who does.
export interface MortgageEvents extends SectionEvents<Step> {
  // A review shown in the result, with the answers it was worked out from.
  reviewCompleted(r: CompletedMortgageReview): void;
  // The result shows no review any more: the answers fell outside it or the person started over.
  reviewCleared(): void;
}

export interface MortgageSetup {
  readonly events: MortgageEvents;
  readonly today: () => CivilDate;
  readonly tr: Translate;
  // The norms, rulings, court criteria and legal interest table the review reads, as the
  // composition root loads them.
  readonly tables: MortgageDeps;
}
