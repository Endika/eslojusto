import type { CivilDate } from '../engine/date';
import type { EmployerFigures, Review } from '../engine/review';
import type { FinalPayInput, ItemId } from '../engine/types';
import type { BenefitEstimate } from '../engine/unemployment';
import type { Translate } from '../i18n/client';
import type { Detail, Flow } from './flow';
import type { Step } from './steps';

export type { Detail } from './flow';
export type { Step } from './steps';

export interface CompletedReview {
  readonly review: Review;
  readonly input: FinalPayInput;
  readonly figures: EmployerFigures;
  readonly benefit: BenefitEstimate;
  readonly otherContracts: number;
  readonly detail: Detail;
}

// What happens during a visit, for whoever listens; the calculator does not know who does.
export interface CalculatorEvents {
  stepShown(step: Step): void;
  stepCompleted(step: Step): void;
  wentBack(from: Step, to: Step): void;
  fieldRejected(step: Step, field: string): void;
  reviewCompleted(r: CompletedReview): void;
  helpOpened(topic: string): void;
  detailOpened(item: ItemId): void;
  startedOver(): void;
}

export interface CalculatorDeps {
  readonly events: CalculatorEvents;
  readonly today: () => CivilDate;
  readonly tr: Translate;
  // How the result is shown when a review completes; unlocked unless told otherwise.
  readonly detail?: () => Detail;
  // The walk through the sheets; the final pay's own unless the page brings another.
  readonly flow?: Flow<Step>;
  // Whether a review the person asks for shows its checks going by first; never unless told.
  readonly reveal?: RevealArm;
}

// Half of the page views see the review's own checks go by before the result; the other half see
// the result at once. With reduced motion there is no sequence, and that is said apart so it never
// counts as either half.
export type RevealArm = 'staged' | 'instant' | 'reduced';
