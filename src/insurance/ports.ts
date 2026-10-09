import type { SectionEvents } from '../calculator/section';
import type { CivilDate } from '../engine/date';
import type { InsuranceDeps, InsuranceReview } from '../engine/insurance/review';
import type { InsuranceInput, OutOfScopeReason } from '../engine/insurance/types';
import type { Translate } from '../i18n/client';
import type { Step } from './steps';

export type { Step } from './steps';
export type { OutOfScopeReason } from '../engine/insurance/types';

// The names of the questions, as a rejected answer is reported.
export const INSURANCE_FIELDS = [
  'line',
  'carCover',
  'mortgageRequired',
  'renews',
  'expiresOn',
  'distance',
  'concludedOn',
  'policyReceived',
  'policyReceivedOn',
  'hasNotice',
  'noticeReceivedOn',
  'previousPremium',
  'newPremium',
  'changes',
] as const;
export type InsuranceFormField = (typeof INSURANCE_FIELDS)[number];

export interface CompletedInsuranceReview {
  readonly review: InsuranceReview;
  readonly input: InsuranceInput;
}

// What happens during a visit, for whoever listens; the review does not know who does.
export interface InsuranceEvents extends SectionEvents<Step> {
  outOfScope(reason: OutOfScopeReason): void;
  // A review shown in the result, with the answers it was worked out from.
  reviewCompleted(r: CompletedInsuranceReview): void;
  // The result shows no review any more: the answers fell outside it or the person started over.
  reviewCleared(): void;
}

export interface InsuranceSetup {
  readonly events: InsuranceEvents;
  readonly today: () => CivilDate;
  readonly tr: Translate;
  // The norms the review reads, as the composition root loads them.
  readonly tables: InsuranceDeps;
}
