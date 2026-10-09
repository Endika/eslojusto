import type { SectionEvents } from '../calculator/section';
import type { CivilDate } from '../engine/date';
import type { CreditDeps, CreditReview } from '../engine/credit/review';
import type { CreditInput, OutOfScopeReason } from '../engine/credit/types';
import type { Translate } from '../i18n/client';
import type { Step } from './steps';

export type { Step } from './steps';
export type { OutOfScopeReason } from '../engine/credit/types';

// The names of the questions, as a rejected answer is reported.
export const CREDIT_FIELDS = [
  'product',
  'purpose',
  'principal',
  'cardLimit',
  'agreedOn',
  'drawnOn',
  'nominalRate',
  'rateType',
  'aprStated',
  'declaredApr',
  'declaredTotalPayable',
  'instalmentCount',
  'instalmentAmount',
  'firstDueOn',
  'hasBalloon',
  'balloonAmount',
  'balloonDueOn',
  'openingFee',
  'openingHow',
  'otherFee',
  'otherHow',
  'hasInsurance',
  'premium',
  'premiumKind',
  'premiumFinanced',
  'insuranceRequired',
  'annualFee',
  'monthlyPayment',
  'balance',
  'confirmedApr',
  'repaid',
  'repaidOn',
  'principalRepaid',
  'compensation',
  'interestSettled',
  'agreedEndOn',
  'remainingInterest',
  'paidByInsurance',
  'discountLost',
  'infoReceived',
  'infoReceivedOn',
] as const;
export type CreditFormField = (typeof CREDIT_FIELDS)[number];

export interface CompletedCreditReview {
  readonly review: CreditReview;
  readonly input: CreditInput;
}

// What happens during a visit, for whoever listens; the review does not know who does.
export interface CreditEvents extends SectionEvents<Step> {
  outOfScope(reason: OutOfScopeReason): void;
  // A review shown in the result, with the answers it was worked out from.
  reviewCompleted(r: CompletedCreditReview): void;
  // The result shows no review any more: the answers fell outside it or the person started over.
  reviewCleared(): void;
}

export interface CreditSetup {
  readonly events: CreditEvents;
  readonly today: () => CivilDate;
  readonly tr: Translate;
  // The norms, sources and Bank of Spain series the review reads, as the composition root loads
  // them.
  readonly tables: CreditDeps;
}
