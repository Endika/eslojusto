import type { SectionEvents } from '../../calculator/section';
import type { CivilDate } from '../../engine/date';
import type { Basket } from '../../engine/bills/basket';
import type { ElectricityDeps, ElectricityReview } from '../../engine/bills/electricity-review';
import type { ElectricityBillInput, ElectricityOutOfScope } from '../../engine/bills/types';
import type { Translate } from '../../i18n/client';
import type { Step } from './steps';

export type { Step } from './steps';
export type { ElectricityOutOfScope } from '../../engine/bills/types';

// The names of the questions, as a rejected answer is reported.
export const ELECTRICITY_FIELDS = [
  'postcode',
  'accessTariff',
  'selfConsumption',
  'powerP1',
  'powerP2',
  'issuedOn',
  'dueOn',
  'readingFrom',
  'readingTo',
  'billedDays',
  'market',
  'retailer',
  'holder',
  'powerUnit',
  'priceChange',
  'powerPriceP1',
  'powerAmountP1',
  'powerPriceP2',
  'powerAmountP2',
  'maxUsedP1',
  'maxUsedP2',
  'energyPricing',
  'kwhAll',
  'energyPriceAll',
  'energyAmountAll',
  'kwhP1',
  'energyPriceP1',
  'energyAmountP1',
  'kwhP2',
  'energyPriceP2',
  'energyAmountP2',
  'kwhP3',
  'energyPriceP3',
  'energyAmountP3',
  'tollsShown',
  'tollsPower',
  'tollsEnergy',
  'fundingShown',
  'funding',
  'hasBonus',
  'bonusCategory',
  'bonusAmount',
  'bonusKwhSoFar',
  'bonusDiscountedKwh',
  'meterCharged',
  'meterAmount',
  'meterPhase',
  'meterOwned',
  'serviceCount',
  'serviceLabel1',
  'serviceAmount1',
  'serviceRequested1',
  'serviceLabel2',
  'serviceAmount2',
  'serviceRequested2',
  'hasExcess',
  'excessAmount',
  'maximeter',
  'hasPenalty',
  'penaltyAmount',
  'priceType',
  'firstRenewalPassed',
  'discount',
  'regularization',
  'regularizationAmount',
  'taxAmount',
  'taxPercent',
  'vatAmount',
  'vatPercent',
  'total',
] as const;
export type ElectricityFormField = (typeof ELECTRICITY_FIELDS)[number];

export interface CompletedElectricityReview {
  readonly review: ElectricityReview;
  readonly input: ElectricityBillInput;
}

// What happens during a visit, for whoever listens; the review does not know who does.
export interface ElectricityEvents extends SectionEvents<Step> {
  outOfScope(reason: ElectricityOutOfScope): void;
  // A review shown in the result, with the answers it was worked out from.
  reviewCompleted(r: CompletedElectricityReview): void;
  // The result shows no review any more: the answers fell outside it or the person started over.
  reviewCleared(): void;
}

// «Tu año» once no bill read waits its turn any more, for whoever listens.
export interface YearEvents {
  basketCompleted(basket: Basket): void;
}

export interface ElectricitySetup {
  readonly events: ElectricityEvents;
  readonly today: () => CivilDate;
  readonly tr: Translate;
  // The norms and the tables the review reads, as the composition root loads them.
  readonly tables: ElectricityDeps;
}
