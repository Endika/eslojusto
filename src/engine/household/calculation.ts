import type { Figure } from '../calculation';

// Phrases of the household review; the UI words each through
// `client.household.calculation.<key>`. Each checked item adds its own keys.
export type HouseholdPhraseKey =
  | MinimumWagePhraseKey
  | WorkingTimePhraseKey
  | TerminationPhraseKey
  | SeverancePhraseKey
  | NoticePhraseKey
  | UnemploymentPhraseKey;

export interface HouseholdPhrase {
  readonly key: HouseholdPhraseKey;
  // A bare string is a time of day, written as is.
  readonly vars?: Readonly<Record<string, Figure | string | HouseholdPhrase>>;
}

export type HouseholdCalculation = readonly HouseholdPhrase[];

export const phrase = (key: HouseholdPhraseKey, vars?: HouseholdPhrase['vars']): HouseholdPhrase =>
  vars === undefined ? { key } : { key, vars };

type MinimumWagePhraseKey =
  | 'minimum_wage.not_published'
  | 'minimum_wage.not_loaded'
  | 'minimum_wage.minimum'
  | 'minimum_wage.twelve_payments_enough'
  | 'minimum_wage.extra_pays_unknown'
  | 'minimum_wage.paid_prorated'
  | 'minimum_wage.paid_apart'
  | 'minimum_wage.shortfall'
  | 'minimum_wage.hourly'
  | 'minimum_wage.hourly_includes_everything'
  | 'minimum_wage.hourly_shortfall'
  | 'in_kind.share'
  | 'in_kind.share_annual'
  | 'in_kind.extra_pays_unknown'
  | 'in_kind.cash_only'
  | 'extra_pays.prorated'
  | 'extra_pays.fewer_than_two'
  | 'extra_pays.once_a_year'
  | 'extra_pays.two_or_more';

// Warnings: they carry no amount.
type WorkingTimePhraseKey =
  | 'working_time.weekly_hours'
  | 'working_time.presence_apart'
  | 'working_time.rest'
  | 'working_time.rest_live_in'
  | 'working_time.rest_made_up'
  | 'working_time.rest_not_made_up'
  | 'working_time.rest_made_up_unknown'
  | 'working_time.rest_below'
  | 'working_time.rest_below_live_in'
  | 'working_time.weekly_rest'
  | 'holidays.days'
  | 'holidays.stretch';

type TerminationPhraseKey =
  | 'termination.et_cause'
  | 'termination.cause.income_drop_or_expense_rise'
  | 'termination.cause.family_needs_change'
  | 'termination.cause.loss_of_trust'
  | 'termination.cause_truth_not_judged'
  | 'termination.cause_none'
  | 'termination.cause_other'
  | 'termination.not_in_writing'
  | 'termination.cause_not_in_writing'
  | 'termination.in_writing'
  | 'termination.writing_unknown'
  | 'dismissal.no_written_notice'
  | 'dismissal.no_severance'
  | 'dismissal.unknown'
  | 'dismissal.none_of_the_two'
  | 'dismissal.none_of_the_two_no_severance_due'
  | 'dismissal.short_notice'
  | 'dismissal.figure_difference'
  | 'night.notice_time'
  | 'night.on_the_hour'
  | 'night.serious_breach_alleged'
  | 'night.inside';

type SeverancePhraseKey =
  | 'severance.figure'
  | 'severance.capped'
  | 'severance.not_made_available'
  | 'severance.shortfall'
  | 'severance.offered_unknown'
  | 'severance.salary_unknown'
  | 'severance.prorated_note';

type NoticePhraseKey =
  | 'notice.days'
  | 'notice.salary_unknown'
  | 'notice.substitute'
  | 'notice.substitute_paid'
  | 'notice.substitute_short'
  | 'notice.leave';

type UnemploymentPhraseKey = 'unemployment.situation' | 'unemployment.general_rules';
