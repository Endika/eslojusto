import type { CivilDate } from '../date';
import {
  activeRules as lawActiveRules,
  ruleSource as lawRuleSource,
  type ActiveRule as LawActiveRule,
  type Rule as LawRule,
} from '../law/rules';
import type { NormSource } from '../law/sources';
import type { HouseholdNormId, NormTable } from './norms';

export type { RuleDoubt } from '../law/rules';

export type HouseholdRuleId =
  | 'transitional_application'
  | 'smi_monthly'
  | 'smi_hourly_external'
  | 'smi_in_kind_cap'
  | 'extra_pays'
  | 'weekly_40'
  | 'rest_between_shifts'
  | 'weekly_rest_36'
  | 'holidays_30'
  | 'holidays_stretch_15'
  | 'termination_causes'
  | 'et_termination_causes'
  | 'desistimiento_cause'
  | 'desistimiento_written'
  | 'desistimiento_severance'
  | 'desistimiento_notice'
  | 'desistimiento_leave'
  | 'notice_calendar_days'
  | 'dismissal_presumed'
  | 'live_in_night_notice'
  | 'unemployment_situation'
  | 'unemployment_contribution'
  | 'unemployment_general';

export type Rule = LawRule<HouseholdRuleId, HouseholdNormId>;

const RD1620 = 'https://www.boe.es/buscar/act.php?id=BOE-A-2011-17975';
const RDL16 = 'https://www.boe.es/buscar/act.php?id=BOE-A-2022-14680';
const ET = 'https://www.boe.es/buscar/act.php?id=BOE-A-2015-11430';
const LGSS = 'https://www.boe.es/buscar/act.php?id=BOE-A-2015-11724';
const CC = 'https://www.boe.es/buscar/act.php?id=BOE-A-1889-4763';

// The wording of RD 1620/2011 read is the one RDL 16/2022 left, in force from 09-09-2022 and
// applicable to the contracts in force that day (disposición transitoria 1.ª): no rule here looks
// at an earlier day.
const REFORM_SINCE = '2022-09-09';
// Unemployment contribution is mandatory from 01-10-2022 (disposición transitoria 2.ª); the
// legal situation of unemployment of art. 267.1.a) 8.º LGSS is in force from 09-09-2022.
const CONTRIBUTION_SINCE = '2022-10-01';

const rule = (
  id: HouseholdRuleId,
  norm: HouseholdNormId,
  article: string,
  url: string,
  from: string,
): Rule => ({ id, norm, article, url, from, until: null, supersededBy: null });

const rd1620 = (id: HouseholdRuleId, article: string, anchor: string): Rule =>
  rule(
    id,
    'rd1620_2011',
    `Real Decreto 1620/2011, art. ${article}`,
    `${RD1620}#${anchor}`,
    REFORM_SINCE,
  );

// Art. 11 as drafted by RDL 16/2022: the termination regime that law introduced.
const reform = (id: HouseholdRuleId, article: string): Rule =>
  rule(id, 'rdl16_2022', `Real Decreto 1620/2011, art. ${article}`, `${RD1620}#a11`, REFORM_SINCE);

export const RULES: Readonly<Record<HouseholdRuleId, Rule>> = {
  // Disposición transitoria 1.ª RDL 16/2022: it applies to the contracts in force on 09-09-2022.
  transitional_application: rule(
    'transitional_application',
    'rdl16_2022',
    'Real Decreto-ley 16/2022, disposición transitoria 1.ª',
    RDL16,
    REFORM_SINCE,
  ),
  // 8.1: the minimum wage applies, monthly for the 40-hour full week and in proportion below it.
  smi_monthly: rd1620('smi_monthly', '8.1', 'a8'),
  // 8.5: external workers paid by the hour, the hourly minimum of each year's decree (art. 4.2);
  // it includes every pay concept and is paid in money.
  smi_hourly_external: rd1620('smi_hourly_external', '8.5', 'a8'),
  // 8.2: board and lodging by agreement, at most 30 % of the total salary, and never lowering the
  // minimum wage in money.
  smi_in_kind_cap: rd1620('smi_in_kind_cap', '8.2', 'a8'),
  // 8.4: two extra payments a year, at the end of each half-year unless agreed otherwise.
  extra_pays: rd1620('extra_pays', '8.4', 'a8'),
  // 9: forty hours a week of effective work at most, presence time apart.
  weekly_40: rd1620('weekly_40', '9', 'a9'),
  // 9: twelve hours between shifts; a live-in worker may drop to ten, made up within four weeks.
  rest_between_shifts: rd1620('rest_between_shifts', '9', 'a9'),
  // 9: thirty-six hours of weekly rest.
  weekly_rest_36: rd1620('weekly_rest_36', '9', 'a9'),
  // 9: thirty calendar days of holidays…
  holidays_30: rd1620('holidays_30', '9', 'a9'),
  // …one stretch of at least fifteen consecutive days.
  holidays_stretch_15: rd1620('holidays_stretch_15', '9', 'a9'),
  // 11.1: the causes of art. 49.1 ET end the relationship.
  termination_causes: reform('termination_causes', '11.1'),
  // Art. 49.1 ET, which art. 11.1 sends the causes of termination to.
  et_termination_causes: rule(
    'et_termination_causes',
    'et',
    'Estatuto de los Trabajadores, art. 49.1',
    `${ET}#a49`,
    REFORM_SINCE,
  ),
  // 11.2: desistimiento needs one of three causes.
  desistimiento_cause: reform('desistimiento_cause', '11.2'),
  // 11.2: in writing, stating the cause.
  desistimiento_written: reform('desistimiento_written', '11.2'),
  // 11.2: twelve days of salary per year of service, six monthly salaries at most, made available
  // with the notice.
  desistimiento_severance: reform('desistimiento_severance', '11.2'),
  // 11.2: twenty days of notice after more than a year of service, seven otherwise, replaceable
  // by the salary of those days.
  desistimiento_notice: reform('desistimiento_notice', '11.2'),
  // 11.2: six paid hours a week to look for work during the notice of a full-time worker.
  desistimiento_leave: reform('desistimiento_leave', '11.2'),
  // Código Civil 5.1 and 5.2: days run from the day after, and rest days count.
  notice_calendar_days: rule(
    'notice_calendar_days',
    'cc',
    'Código Civil, arts. 5.1 y 5.2',
    `${CC}#art5`,
    REFORM_SINCE,
  ),
  // 11.3: no written notice or no severance made available, and the dismissal regime is presumed.
  dismissal_presumed: reform('dismissal_presumed', '11.3'),
  // 11.4: a live-in worker gets no termination notice between 17:00 and 08:00 save a very serious
  // breach of loyalty and trust.
  live_in_night_notice: reform('live_in_night_notice', '11.4'),
  // LGSS 267.1.a) 8.º: the art. 11.2 termination is a legal situation of unemployment (art. 251.d
  // was deleted).
  unemployment_situation: rule(
    'unemployment_situation',
    'lgss',
    'Ley General de la Seguridad Social, art. 267.1.a) 8.º',
    `${LGSS}#a267`,
    REFORM_SINCE,
  ),
  // RDL 16/2022, disposición transitoria 2.ª: the unemployment contribution is mandatory.
  unemployment_contribution: rule(
    'unemployment_contribution',
    'rdl16_2022',
    'Real Decreto-ley 16/2022, disposición transitoria 2.ª',
    RDL16,
    CONTRIBUTION_SINCE,
  ),
  // LGSS 266.b) (360 days contributed in the last six years), 269.2 (not used for an earlier benefit) and 270.2 (70 % then 60 %).
  unemployment_general: rule(
    'unemployment_general',
    'lgss',
    'Ley General de la Seguridad Social, arts. 266.b), 269.2 y 270.2',
    `${LGSS}#a269`,
    CONTRIBUTION_SINCE,
  ),
};

export function ruleSource(id: HouseholdRuleId, norms: NormTable): NormSource {
  return lawRuleSource(RULES, id, norms);
}

export type ActiveRule = LawActiveRule<HouseholdRuleId, HouseholdNormId>;

export function activeRules(date: CivilDate, norms: NormTable): readonly ActiveRule[] {
  return lawActiveRules(RULES, date, norms);
}
