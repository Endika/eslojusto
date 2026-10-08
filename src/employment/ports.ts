import type { Detail } from '../calculator/flow';
import type { CivilDate } from '../engine/date';
import type { EmploymentDeps, EmploymentReview } from '../engine/employment/review';
import type { EmploymentInput, Scope } from '../engine/employment/types';
import type { Translate } from '../i18n/client';
import type { Step } from './steps';

export type { Detail } from '../calculator/flow';
export type { Step } from './steps';

export type OutOfScopeReason = Extract<Scope, { inScope: false }>['reason'];

export interface CompletedEmploymentReview {
  readonly review: EmploymentReview;
  readonly input: EmploymentInput;
  readonly detail: Detail;
}

// What happens during a visit, for whoever listens; the review does not know who does.
export interface EmploymentEvents {
  stepShown(step: Step): void;
  stepCompleted(step: Step): void;
  wentBack(from: Step, to: Step): void;
  fieldRejected(step: Step, field: string): void;
  outOfScope(reason: OutOfScopeReason): void;
  reviewCompleted(r: CompletedEmploymentReview): void;
  startedOver(): void;
}

export interface EmploymentReviewDeps {
  readonly events: EmploymentEvents;
  readonly today: () => CivilDate;
  readonly tr: Translate;
  // The norms and the minimum wage table the review reads, as the composition root loads them.
  readonly tables: EmploymentDeps;
  // How the result is shown when a review completes; unlocked unless told otherwise.
  readonly detail?: () => Detail;
}
