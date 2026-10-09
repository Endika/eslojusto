import type { Figure } from '../calculation';

// A figure inside an insurance calculation: the engine's figures plus percentages and days
// ('YYYY-MM-DD').
export type InsuranceFigure = Figure | { readonly percent: number } | { readonly date: string };

export type InsurancePhraseKey =
  | 'item.not_entered'
  | 'non_renewal.last_day'
  | 'non_renewal.days_left'
  | 'non_renewal.ended'
  | 'non_renewal.arrive_by'
  | 'non_renewal.midnight'
  | 'non_renewal.month_end'
  | 'non_renewal.extension_assumed'
  | 'non_renewal.no_extension'
  | 'change_notice.deadline'
  | 'change_notice.on_time'
  | 'change_notice.late'
  | 'change_notice.month_end'
  | 'change_notice.any_change'
  | 'change_notice.premium_only'
  | 'premium.up'
  | 'premium.same'
  | 'premium.down'
  | 'withdrawal.not_distance'
  | 'withdrawal.channel_unknown'
  | 'withdrawal.before_law'
  | 'withdrawal.start'
  | 'withdrawal.start_on_terms'
  | 'withdrawal.receipt_unknown'
  | 'withdrawal.days_left'
  | 'withdrawal.ended'
  | 'withdrawal.not_started'
  | 'withdrawal.compulsory_excluded'
  | 'withdrawal.voluntary_unverified'
  | 'withdrawal.mortgage_unverified'
  | 'information.policy_correction'
  | 'information.policy_correction.until'
  | 'information.policy_correction.no_policy'
  | 'information.policy_correction.delivery_unknown'
  | 'information.questionnaire'
  | 'information.proportional_rule'
  | 'information.proportional_rule.example'
  | 'information.overinsurance'
  | 'information.out_of_scope.life'
  | 'information.out_of_scope.health'
  | 'information.out_of_scope.funeral'
  | 'information.out_of_scope.other_line'
  | 'information.out_of_scope.before_2016';

// The UI words a phrase through the dictionary key `client.insurance.calculation.<key>`.
export interface InsurancePhrase {
  readonly key: InsurancePhraseKey;
  readonly vars?: Readonly<Record<string, InsuranceFigure>>;
}

// Sentences, in order; the UI joins them with a space.
export type InsuranceCalculation = readonly InsurancePhrase[];

export const insurancePhrase = (
  key: InsurancePhraseKey,
  vars?: InsurancePhrase['vars'],
): InsurancePhrase => (vars === undefined ? { key } : { key, vars });
