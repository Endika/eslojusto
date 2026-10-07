import type { CivilDate } from '../engine/date';
import type { EmployerFigures, Review } from '../engine/review';
import type { FinalPayInput, ItemId } from '../engine/types';
import type { BenefitEstimate } from '../engine/unemployment';
import type { Translate } from '../i18n/client';
import type { Step } from './steps';

export type { Step } from './steps';

export interface CompletedReview {
  readonly review: Review;
  readonly input: FinalPayInput;
  readonly figures: EmployerFigures;
  readonly benefit: BenefitEstimate;
  readonly otherContracts: number;
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
}
