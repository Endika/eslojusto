import type { CivilDate } from '../date';
import type { NormSource } from '../law/sources';
import type { InsuranceCalculation } from './calculation';

// `null` in any yes/no answer means «No lo sé».
export type InsuranceLine = 'home' | 'car' | 'life' | 'health' | 'funeral' | 'other';

// Whether a motor policy holds only the compulsory liability cover or voluntary covers as well.
export type CarCover = 'compulsory_only' | 'with_voluntary';

export interface RenewalNotice {
  readonly receivedOn: CivilDate;
  readonly previousPremium: number | null;
  readonly newPremium: number | null;
  // Changes to covers or excesses besides the premium.
  readonly changes: boolean | null;
}

export interface InsuranceInput {
  readonly line: InsuranceLine;
  // Motor policies only.
  readonly carCover: CarCover | null;
  // Home policies only: whether the mortgage on the home requires it.
  readonly mortgageRequired: boolean | null;
  // Whether the policy extends itself each year.
  readonly renews: boolean | null;
  // End of the current period.
  readonly expiresOn: CivilDate;
  // Null when no notice was entered.
  readonly notice: RenewalNotice | null;
  // Contracted online or by phone without meeting anyone.
  readonly distance: boolean | null;
  readonly concludedOn: CivilDate | null;
  // False while the policy has not been received; a null day counts from the conclusion. For the
  // withdrawal period it stands for the receipt of the contract terms (art. 10.1 Ley 22/2007).
  readonly policyReceived: boolean | null;
  readonly policyReceivedOn: CivilDate | null;
}

export type OutOfScopeReason = 'life' | 'health' | 'funeral' | 'other_line' | 'before_2016';

export type Scope =
  { readonly inScope: true } | { readonly inScope: false; readonly reason: OutOfScopeReason };

export type FindingId =
  | 'non_renewal'
  | 'change_notice'
  | 'premium'
  | 'distance_withdrawal'
  | 'distance_withdrawal_compulsory'
  | 'distance_withdrawal_voluntary';

// `open` and `ended` for a deadline; `on_time` and `late` for the notice of changes; `up`, `same` and `down` for the premium, as a fact with no verdict.
export type FindingStatus =
  | 'open'
  | 'ended'
  | 'not_started'
  | 'not_applicable'
  | 'review_it'
  | 'not_entered'
  | 'on_time'
  | 'late'
  | 'up'
  | 'same'
  | 'down';

export interface Finding {
  readonly id: FindingId;
  readonly status: FindingStatus;
  // 'YYYY-MM-DD' of the deadline a status refers to; null when there is none.
  readonly lastDay: string | null;
  // Calendar days from today to `lastDay` while it is open.
  readonly daysLeft: number | null;
  readonly calculation: InsuranceCalculation;
  readonly sources: readonly NormSource[];
}
