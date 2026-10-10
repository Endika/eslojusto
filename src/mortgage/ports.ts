import type { SectionEvents } from '../calculator/section';
import type { CivilDate } from '../engine/date';
import type { MortgageDeps } from '../engine/mortgage/types';
import type { Translate } from '../i18n/client';
import type { Step } from './steps';

export type { Step } from './steps';

// What happens during a visit, for whoever listens; the review does not know who does.
export type MortgageEvents = SectionEvents<Step>;

export interface MortgageSetup {
  readonly events: MortgageEvents;
  readonly today: () => CivilDate;
  readonly tr: Translate;
  // The norms, rulings, court criteria and legal interest table the review reads, as the
  // composition root loads them.
  readonly tables: MortgageDeps;
}
