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
  | 'interest.before_table';

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
