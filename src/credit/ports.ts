import type { CivilDate } from '../engine/date';
import type { CreditDeps } from '../engine/credit/review';
import type { Translate } from '../i18n/client';
import type { Step } from './steps';

export type { Step } from './steps';

// What happens during a visit, for whoever listens; the review does not know who does.
export interface CreditEvents {
  stepShown(step: Step): void;
  wentBack(from: Step, to: Step): void;
}

export interface CreditSetup {
  readonly events: CreditEvents;
  readonly today: () => CivilDate;
  readonly tr: Translate;
  // The norms, sources and Bank of Spain series the review reads, as the composition root loads
  // them.
  readonly tables: CreditDeps;
}
