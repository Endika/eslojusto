import type { CivilDate } from '../engine/date';
import type { CreditDeps, CreditReview } from '../engine/credit/review';
import type { CreditInput } from '../engine/credit/types';
import type { Translate } from '../i18n/client';
import type { Step } from './steps';

export type { Step } from './steps';

// What happens during a visit, for whoever listens; the review does not know who does.
export interface CreditEvents {
  stepShown(step: Step): void;
  wentBack(from: Step, to: Step): void;
  // A review shown in the result, with the answers it was worked out from.
  reviewCompleted(r: CompletedCreditReview): void;
  // The result shows no review any more: the answers fell outside it or the person started over.
  reviewCleared(): void;
}

export interface CompletedCreditReview {
  readonly input: CreditInput;
  readonly review: CreditReview;
}

export interface CreditSetup {
  readonly events: CreditEvents;
  readonly today: () => CivilDate;
  readonly tr: Translate;
  // The norms, sources and Bank of Spain series the review reads, as the composition root loads
  // them.
  readonly tables: CreditDeps;
}
