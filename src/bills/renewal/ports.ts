import type { SectionEvents } from '../../calculator/section';
import type { CivilDate } from '../../engine/date';
import type { RenewalReview, RenewalReviewDeps } from '../../engine/bills/renewal-review';
import type { Translate } from '../../i18n/client';
import type { Step } from './steps';

export type { Step } from './steps';

// The names of the questions, as a rejected answer is reported and as the API names the fields
// it reads from the letter.
export const RENEWAL_FIELDS = [
  'letterDate',
  'renewalDate',
  'powerKwP1',
  'powerKwP2',
  'powerUnit',
  'currentPowerP1',
  'currentPowerP2',
  'nextPowerP1',
  'nextPowerP2',
  'currentEnergyPricing',
  'nextEnergyPricing',
  'currentEnergy',
  'nextEnergy',
  'currentEnergyP1',
  'currentEnergyP2',
  'currentEnergyP3',
  'nextEnergyP1',
  'nextEnergyP2',
  'nextEnergyP3',
  'annualKwh',
  'declaredWithoutTax',
  'declaredWithTax',
  'separateFromBill',
] as const;
export type RenewalFormField = (typeof RENEWAL_FIELDS)[number];

export type RenewalMethod = 'upload' | 'manual';

export interface CompletedRenewalReview {
  readonly review: RenewalReview;
}

// What happens during a visit, for whoever listens; the review does not know who does.
export interface RenewalEvents extends SectionEvents<Step> {
  // A review shown in the result.
  reviewCompleted(r: CompletedRenewalReview): void;
  // The result shows no review any more: the person started over.
  reviewCleared(): void;
}

export interface RenewalSetup {
  readonly events: RenewalEvents;
  readonly today: () => CivilDate;
  readonly tr: Translate;
  // The tables, norms and PVPC prices the review reads, as the composition root loads them.
  readonly tables: RenewalReviewDeps;
}
