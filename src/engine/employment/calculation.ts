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
  | 'modality.before_reform'
  | ModalityPhraseKey
  | ChainingPhraseKey;

// Art. 15.4 and 15.5 ET are quoted, never asserted: «permanent_on_breach» and
// «chaining.permanent» say the article states that, in a case like this one, the person acquires
// permanent status.
type ModalityPhraseKey =
  | 'modality.permanent'
  | 'modality.unknown'
  | 'modality.abolished'
  | 'modality.outdated_label'
  | 'modality.permanent_on_breach'
  | 'modality.rule_in_doubt'
  | 'modality.cause_stated'
  | 'modality.cause_missing'
  | 'modality.cause_unknown'
  | 'modality.duration'
  | 'modality.duration_so_far'
  | 'modality.no_end_date'
  | 'modality.production_within'
  | 'modality.production_agreement_year'
  | 'modality.production_over_year'
  | 'modality.extensions'
  | 'modality.occasional_days'
  | 'modality.occasional_agrifood'
  | 'modality.replacement_stated'
  | 'modality.replacement_missing'
  | 'modality.replacement_unknown'
  | 'modality.selection_within'
  | 'modality.selection_over'
  | 'modality.training_too_short'
  | 'modality.training_too_long'
  | 'modality.training_within'
  | 'modality.training_max_disability'
  | 'modality.practice_window'
  | 'modality.practice_window_disability_unknown'
  | 'modality.effective_work'
  | 'modality.effective_work_unknown'
  | 'modality.alternance_shifts_or_night'
  | 'modality.plan_attached'
  | 'modality.plan_missing'
  | 'modality.plan_unknown'
  | 'modality.studies_end_unknown'
  | 'modality.written_missing'
  | 'modality.written_unknown'
  | 'modality.discontinuous_stated'
  | 'modality.discontinuous_missing'
  | 'modality.discontinuous_unknown';

type ChainingPhraseKey =
  | 'chaining.no_history'
  | 'chaining.within'
  | 'chaining.near_limit'
  | 'chaining.exceeds'
  | 'chaining.permanent'
  | 'chaining.depends_on_cutoff'
  | 'chaining.depends_on_group'
  | 'chaining.same_group_not_counted'
  | 'chaining.kind_unknown_not_counted';

export interface EmploymentPhrase {
  readonly key: EmploymentPhraseKey;
  readonly vars?: Readonly<Record<string, Figure | EmploymentPhrase>>;
}

export type EmploymentCalculation = readonly EmploymentPhrase[];

export const phrase = (
  key: EmploymentPhraseKey,
  vars?: EmploymentPhrase['vars'],
): EmploymentPhrase => (vars === undefined ? { key } : { key, vars });
