import type { Figure } from '../calculation';

// Phrases of the employment review; the UI words each through `client.employment.calculation.<key>`.
// Each checked item adds its own keys.
export type EmploymentPhraseKey =
  | 'minimum_wage.not_published'
  | 'minimum_wage.not_loaded'
  | 'minimum_wage.pay.year'
  | 'minimum_wage.pay.month'
  | 'minimum_wage.pay.month_prorated'
  | 'minimum_wage.pay.day'
  | 'minimum_wage.pay.hour'
  | 'minimum_wage.pay.hour_weekly'
  | 'minimum_wage.pay.hour_with_paid_rest'
  | 'minimum_wage.pay.hours_unknown'
  | 'minimum_wage.pay.extra_pays_unknown'
  | 'minimum_wage.breakdown_gap'
  | 'minimum_wage.excluded'
  | 'minimum_wage.in_kind_not_counted'
  | 'minimum_wage.prorata'
  | 'minimum_wage.prorata_annual'
  | 'minimum_wage.legal_week'
  | 'minimum_wage.year.within'
  | 'minimum_wage.year.below'
  | 'minimum_wage.year.effects_unverified'
  | 'minimum_wage.year.hours_unknown'
  | 'minimum_wage.year.extra_pays_unknown'
  | 'minimum_wage.year.training_effective_work'
  | 'minimum_wage.temporary.within'
  | 'minimum_wage.temporary.below'
  | 'minimum_wage.temporary.effects_unverified'
  | 'minimum_wage.temporary.hours_unknown'
  | 'minimum_wage.temporary.extra_pays_unknown'
  | 'minimum_wage.temporary.training_effective_work'
  | 'minimum_wage.discontinuous_periods'
  | 'minimum_wage.total'
  | 'minimum_wage.agreement_may_pay_more'
  | 'minimum_wage.payslip.within'
  | 'minimum_wage.payslip.below'
  | 'minimum_wage.payslip.effects_unverified'
  | 'minimum_wage.payslip.hours_unknown'
  | 'minimum_wage.payslip.extra_pays_unknown'
  | 'minimum_wage.payslip.training_effective_work'
  | 'minimum_wage.payslip.not_compared'
  | 'minimum_wage.payslip.not_published'
  | 'minimum_wage.payslip.not_loaded'
  | 'minimum_wage.payslip.annual_decides'
  | 'minimum_wage.payslip.prorated_count_unknown'
  | 'minimum_wage.payslip.none'
  | 'minimum_wage.in_kind'
  | 'minimum_wage.in_kind_rate'
  | 'minimum_wage.agreement.within'
  | 'minimum_wage.agreement.below'
  | 'modality.before_reform';

export interface EmploymentPhrase {
  readonly key: EmploymentPhraseKey;
  readonly vars?: Readonly<Record<string, Figure | EmploymentPhrase>>;
}

export type EmploymentCalculation = readonly EmploymentPhrase[];

export const phrase = (
  key: EmploymentPhraseKey,
  vars?: EmploymentPhrase['vars'],
): EmploymentPhrase => (vars === undefined ? { key } : { key, vars });
