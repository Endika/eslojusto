import type { Figure } from '../calculation';

// A figure inside a credit calculation: the engine's figures plus percentages, percentage points,
// days ('YYYY-MM-DD') and months ('YYYY-MM').
export type CreditFigure =
  | Figure
  | { readonly percent: number }
  | { readonly points: number }
  | { readonly date: string }
  | { readonly month: string };

export type CreditPhraseKey =
  | 'scope.mortgage'
  | 'scope.lease_without_purchase'
  | 'scope.business'
  | 'scope.under_200'
  | 'scope.before_lcc'
  | 'scope.indicator_only'
  | 'item.not_entered'
  | 'apr.recomputed'
  | 'apr.matches'
  | 'apr.contract_lower'
  | 'apr.contract_higher'
  | 'apr.contract_missing'
  | 'apr.unsolvable'
  | 'apr.one_decimal'
  | 'apr.revolving_assumption'
  | 'apr.revolving_before_2013'
  | 'apr.insurance_counted'
  | 'apr.insurance_left_out'
  | 'apr.balloon_with_last'
  | 'apr.balloon_month_after'
  | 'apr.total_payable'
  | 'apr.total_cost'
  | 'apr.declared_total'
  | 'apr.contribution.opening'
  | 'apr.contribution.study'
  | 'apr.contribution.management'
  | 'apr.contribution.other'
  | 'apr.contribution.insurance'
  | 'indicator.not_entered'
  | 'indicator.term_unknown'
  | 'indicator.not_published'
  | 'indicator.no_data'
  | 'indicator.apr_recalculated'
  | 'indicator.apr_declared'
  | 'indicator.reference_revolving'
  | 'indicator.reference_loan'
  | 'indicator.reference_2010'
  | 'indicator.variable_rate_series'
  | 'indicator.above'
  | 'indicator.edge'
  | 'indicator.below'
  | 'indicator.distance'
  | 'indicator.loan_criterion_unread'
  | 'indicator.revolving_criterion'
  | 'indicator.edge_reason'
  | 'indicator.judge'
  | 'indicator.channels'
  | 'early_repayment.paid_by_insurance'
  | 'early_repayment.variable_rate'
  | 'early_repayment.nothing_charged'
  | 'early_repayment.charged_without_basis'
  | 'early_repayment.over_a_year'
  | 'early_repayment.up_to_a_year'
  | 'early_repayment.base_with_interest'
  | 'early_repayment.base_principal'
  | 'early_repayment.interest_cap'
  | 'early_repayment.above_general_cap'
  | 'early_repayment.losses'
  | 'early_repayment.within_cap'
  | 'dealer_discount.review_it'
  | 'withdrawal.start'
  | 'withdrawal.start_on_terms'
  | 'withdrawal.days_left'
  | 'withdrawal.ended'
  | 'withdrawal.not_started'
  | 'withdrawal.receipt_unknown'
  | 'withdrawal.send_by'
  | 'withdrawal.effects'
  | 'information.contract_mentions'
  | 'information.contract_mentions.missing'
  | 'information.contract_mentions.consequences'
  | 'information.linked_insurance.apr'
  | 'information.linked_insurance.withdrawal'
  | 'information.linked_insurance.unused_premium'
  | 'information.unused_premium.guide'
  | 'information.cash_price'
  | 'information.cash_option'
  | 'information.revolving_info'
  | 'information.card_payoff.months'
  | 'information.card_payoff.never'
  | 'information.law_change';

// The UI words a phrase through the dictionary key `client.credit.calculation.<key>`.
export interface CreditPhrase {
  readonly key: CreditPhraseKey;
  readonly vars?: Readonly<Record<string, CreditFigure>>;
}

// Sentences, in order; the UI joins them with a space.
export type CreditCalculation = readonly CreditPhrase[];

export const creditPhrase = (key: CreditPhraseKey, vars?: CreditPhrase['vars']): CreditPhrase =>
  vars === undefined ? { key } : { key, vars };
