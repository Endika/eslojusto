import type { Figure } from '../calculation';

// A figure inside a mortgage calculation: the engine's figures plus percentages and days
// ('YYYY-MM-DD').
export type MortgageFigure = Figure | { readonly percent: number } | { readonly date: string };

// A statute key is worded in the indicative («la ley pone este gasto a cargo del banco»); a
// case-law key always names the court and the condition («según el reparto que aplica el
// Tribunal Supremo…; hace falta que el banco lo acepte o que un juez anule la cláusula»).
export type MortgagePhraseKey =
  | 'scope.company'
  | 'scope.business_purpose'
  | 'scope.developer_subrogation'
  | 'scope.multicurrency'
  | 'scope.reverse'
  | 'scope.not_mortgage'
  | 'item.not_entered'
  | 'expenses.statute'
  | 'expenses.transparency_free'
  | 'expenses.case_law'
  | 'expenses.case_law_condition'
  | 'expenses.case_law_explained'
  | 'expenses.valuation_borrower'
  | 'expenses.copy_borrower'
  | 'expenses.purchase'
  | 'expenses.cancellation'
  | 'expenses.registry_cancellation'
  | 'expenses.ajd_before_2018'
  | 'expenses.not_consumer'
  | 'expenses.consumer_unknown'
  | 'expenses.no_clause'
  | 'expenses.clause_unknown'
  | 'expenses.transparency_before_lcci'
  | 'expenses.doubtful_norm'
  | 'expenses.mixed'
  | 'expenses.paid_by_bank'
  | 'expenses.payer_unknown'
  | 'expenses.supplied_own_line'
  | 'expenses.supplied_left_out'
  | 'expenses.agreement_statute'
  | 'expenses.agreement_case_law'
  | 'expenses.agreement_ajd'
  | 'expenses.agreement_unknown'
  | 'expenses.returned'
  | 'interest.counted'
  | 'interest.not_published'
  | 'interest.estimated'
  | 'interest.explained'
  | 'interest.returned'
  | 'interest.before_table'
  | 'fees.lcci_variable'
  | 'fees.lcci_fixed_first'
  | 'fees.lcci_fixed_after'
  | 'fees.law41_first'
  | 'fees.law41_after'
  | 'fees.law41_fixed'
  | 'fees.law41_revised_less_often'
  | 'fees.before_2007'
  | 'fees.conversion'
  | 'fees.conversion_no_repayment'
  | 'fees.conversion_no_repayment_2019'
  | 'fees.after_period'
  | 'fees.window'
  | 'fees.already_fixed'
  | 'fees.earlier_deed_novation'
  | 'fees.doubtful_norm'
  | 'fees.above_cap'
  | 'fees.within_cap'
  | 'fees.financial_loss'
  | 'fees.subrogation'
  | 'fees.unused_premium'
  | 'flags.floor_statute'
  | 'flags.floor_statute_mixed'
  | 'flags.floor_fixed'
  | 'flags.floor_case_law'
  | 'flags.floor_zero'
  | 'flags.irph'
  | 'flags.default_interest_lcci'
  | 'flags.default_interest_lcci_differs'
  | 'flags.default_interest_lcci_matches'
  | 'flags.default_interest_lh114'
  | 'flags.default_interest_lh114_above'
  | 'flags.default_interest_case_law'
  | 'flags.default_interest_case_law_above'
  | 'flags.early_termination'
  | 'flags.early_termination_earlier_deed'
  | 'flags.early_termination_fewer'
  | 'flags.early_termination_case_law'
  | 'flags.rounding_up'
  | 'flags.opening_fee_amount'
  | 'flags.opening_fee_share'
  | 'flags.opening_fee_duplicate'
  | 'flags.opening_fee_case_law'
  | 'flags.insurance_tied'
  | 'flags.insurance_before_lcci'
  | 'information.fein_timing'
  | 'information.transparency_act'
  | 'information.handwritten_statement'
  | 'information.limitation_rule'
  | 'information.prior_step_439bis'
  | 'information.loan_assignment'
  | 'information.complaints_service';

// The UI words a phrase through the dictionary key `client.mortgage.calculation.<key>`.
export interface MortgagePhrase {
  readonly key: MortgagePhraseKey;
  readonly vars?: Readonly<Record<string, MortgageFigure>>;
}

// Sentences, in order; the UI joins them with a space.
export type MortgageCalculation = readonly MortgagePhrase[];

export const mortgagePhrase = (
  key: MortgagePhraseKey,
  vars?: MortgagePhrase['vars'],
): MortgagePhrase => (vars === undefined ? { key } : { key, vars });
