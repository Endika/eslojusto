import type { CivilDate } from '../engine/date';
import type { InsuranceDeps, InsuranceReview } from '../engine/insurance/review';
import type { InsuranceInput } from '../engine/insurance/types';
import type { Translate } from '../i18n/client';
import type { Step } from './steps';

export type { Step } from './steps';

// What happens during a visit, for whoever listens; the review does not know who does.
export interface InsuranceEvents {
  stepShown(step: Step): void;
  wentBack(from: Step, to: Step): void;
  // A review shown in the result, with the answers it was worked out from.
  reviewCompleted(r: CompletedInsuranceReview): void;
  // The result shows no review any more: the answers fell outside it or the person started over.
  reviewCleared(): void;
}

export interface CompletedInsuranceReview {
  readonly input: InsuranceInput;
  readonly review: InsuranceReview;
}

export interface InsuranceSetup {
  readonly events: InsuranceEvents;
  readonly today: () => CivilDate;
  readonly tr: Translate;
  // The norms the review reads, as the composition root loads them.
  readonly tables: InsuranceDeps;
}
