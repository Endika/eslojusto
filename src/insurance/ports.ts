import type { CivilDate } from '../engine/date';
import type { InsuranceDeps } from '../engine/insurance/review';
import type { Translate } from '../i18n/client';
import type { Step } from './steps';

export type { Step } from './steps';

// What happens during a visit, for whoever listens; the review does not know who does.
export interface InsuranceEvents {
  stepShown(step: Step): void;
  wentBack(from: Step, to: Step): void;
}

export interface InsuranceSetup {
  readonly events: InsuranceEvents;
  readonly today: () => CivilDate;
  readonly tr: Translate;
  // The norms the review reads, as the composition root loads them.
  readonly tables: InsuranceDeps;
}
