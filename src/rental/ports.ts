import type { Detail } from '../calculator/flow';
import type { CivilDate } from '../engine/date';
import type { RentalReview } from '../engine/rental/review';
import type { OutOfScopeReason } from '../engine/rental/scope';
import type { RentalInput, ReviewDeps } from '../engine/rental/types';
import type { Translate } from '../i18n/client';
import type { Step } from './steps';

export type { Detail } from '../calculator/flow';
export type { Step } from './steps';

export interface CompletedRentalReview {
  readonly review: RentalReview;
  readonly input: RentalInput;
  readonly detail: Detail;
}

// What happens during a visit, for whoever listens; the review does not know who does.
export interface RentalEvents {
  stepShown(step: Step): void;
  stepCompleted(step: Step): void;
  wentBack(from: Step, to: Step): void;
  fieldRejected(step: Step, field: string): void;
  outOfScope(reason: OutOfScopeReason): void;
  reviewCompleted(r: CompletedRentalReview): void;
  startedOver(): void;
}

export interface RentalDeps {
  readonly events: RentalEvents;
  readonly today: () => CivilDate;
  readonly tr: Translate;
  // The norms, indices and interest rates the review reads, as the composition root loads them.
  readonly tables: ReviewDeps;
  // How the result is shown when a review completes; unlocked unless told otherwise.
  readonly detail?: () => Detail;
}
