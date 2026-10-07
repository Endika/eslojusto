import type { CivilDate } from '../date';
import {
  activeRules as lawActiveRules,
  ruleSource as lawRuleSource,
  type ActiveRule as LawActiveRule,
  type Rule as LawRule,
} from '../law/rules';
import type { NormSource } from '../law/sources';
import { ET } from '../sources';
import type { EmploymentNormId, NormTable } from './norms';

export type { RuleDoubt } from '../law/rules';

export type EmploymentRuleId =
  | 'smi_annual'
  | 'smi_prorata'
  | 'smi_in_kind_cap'
  | 'smi_temporary_120'
  | 'smi_absorption'
  | 'fixed_term_presumption'
  | 'production_6_months'
  | 'production_1_year'
  | 'production_one_extension'
  | 'production_occasional_90'
  | 'production_occasional_agrifood_120'
  | 'replacement_name_cause'
  | 'replacement_selection_3_months'
  | 'abolished_modalities'
  | 'permanent_on_breach'
  | 'chaining_18_in_24'
  | 'temporary_certificate'
  | 'discontinuous_essentials'
  | 'training_alternance_duration'
  | 'training_alternance_effective_work'
  | 'training_alternance_no_overtime'
  | 'training_alternance_no_trial'
  | 'training_alternance_pay'
  | 'training_practice_window'
  | 'training_practice_duration'
  | 'training_practice_trial'
  | 'training_practice_no_overtime'
  | 'training_practice_pay'
  | 'training_plan_attached'
  | 'training_no_new_trial'
  | 'written_form'
  | 'trial_limits'
  | 'trial_temporary_1_month'
  | 'trial_void_same_duties'
  | 'weekly_40'
  | 'daily_9'
  | 'rest_12'
  | 'weekly_rest_36'
  | 'break_15'
  | 'night_limits'
  | 'overtime_cap_80'
  | 'overtime_voluntary'
  | 'overtime_value'
  | 'time_record'
  | 'part_time_contents'
  | 'part_time_no_overtime'
  | 'complementary_hours'
  | 'voluntary_complementary'
  | 'holidays_30'
  | 'holidays_not_paid_out'
  | 'extra_pays'
  | 'non_compete'
  | 'exclusivity'
  | 'retention'
  | 'waiver'
  | 'partial_nullity'
  | 'remote_costs'
  | 'info_elements'
  | 'info_before_start'
  | 'info_on_request'
  | 'info_short_relations'
  | 'late_payment_interest'
  | 'limitation';

export type Rule = LawRule<EmploymentRuleId, EmploymentNormId>;

const ET_SINCE = '2015-11-13';
const REFORM_SINCE = '2022-03-30';
const RDL32_2021 = 'https://www.boe.es/buscar/act.php?id=BOE-A-2021-21788';
const LAW10_2021 = 'https://www.boe.es/buscar/act.php?id=BOE-A-2021-11472';
const RD723_2026 = 'https://www.boe.es/buscar/act.php?id=BOE-A-2026-19200';
const RD723_SINCE = '2026-10-05';

const rule = (
  id: EmploymentRuleId,
  norm: EmploymentNormId,
  article: string,
  url: string,
  from: string,
): Rule => ({ id, norm, article, url, from, until: null, supersededBy: null });

const et = (id: EmploymentRuleId, article: string, anchor: string): Rule =>
  rule(id, 'et', `Estatuto de los Trabajadores, art. ${article}`, `${ET}#${anchor}`, ET_SINCE);

// Wording given to arts. 11, 15 and 16 ET by RDL 32/2021, in force from 30-03-2022.
const reform = (id: EmploymentRuleId, article: string, anchor: string): Rule =>
  rule(
    id,
    'rdl32_2021',
    `Estatuto de los Trabajadores, art. ${article}`,
    `${ET}#${anchor}`,
    REFORM_SINCE,
  );

const rd723 = (id: EmploymentRuleId, article: string, anchor: string): Rule =>
  rule(id, 'rd723_2026', article, `${RD723_2026}#${anchor}`, RD723_SINCE);

// The yearly amounts come from the decree of each year in the minimum wage table; these rules cite
// the articles of the Estatuto that make them binding.
export const RULES: Readonly<Record<EmploymentRuleId, Rule>> = {
  // 27.1: the Government sets the minimum wage every year.
  smi_annual: et('smi_annual', '27.1', 'a27'),
  // 12.1: a part-time worker is compared with a comparable full-time one, else the agreement or the legal maximum.
  smi_prorata: et('smi_prorata', '12.1', 'a12'),
  // 26.1: pay in kind at most 30 %, never lowering the minimum wage in money.
  smi_in_kind_cap: et('smi_in_kind_cap', '26.1', 'a26'),
  // 27.1, as set by art. 4.1 of each year's decree for contracts of up to 120 days.
  smi_temporary_120: et('smi_temporary_120', '27.1', 'a27'),
  // 27.1, last paragraph: the minimum wage is compared yearly and absorbs higher professional pay.
  smi_absorption: et('smi_absorption', '27.1', 'a27'),
  // 15.1: a contract is presumed open-ended; fixed term only for production or replacement.
  fixed_term_presumption: reform('fixed_term_presumption', '15.1', 'a15'),
  // 15.2: production contracts last up to six months…
  production_6_months: reform('production_6_months', '15.2', 'a15'),
  // …or up to one year if a sectoral agreement extends it.
  production_1_year: reform('production_1_year', '15.2', 'a15'),
  // 15.2: one extension only, within the maximum.
  production_one_extension: reform('production_one_extension', '15.2', 'a15'),
  // 15.2: occasional, foreseeable situations, up to 90 days a calendar year.
  production_occasional_90: reform('production_occasional_90', '15.2', 'a15'),
  // 15.2 as amended by Ley 1/2025: 120 days in the agricultural and agri-food sector.
  production_occasional_agrifood_120: rule(
    'production_occasional_agrifood_120',
    'law1_2025',
    'Estatuto de los Trabajadores, art. 15.2',
    `${ET}#a15`,
    '2025-01-02',
  ),
  // 15.3: the contract names the person replaced and the cause.
  replacement_name_cause: reform('replacement_name_cause', '15.3', 'a15'),
  // 15.3: covering a post during selection or promotion, up to three months.
  replacement_selection_3_months: reform('replacement_selection_3_months', '15.3', 'a15'),
  // 15.1 and transitional provisions 3.ª and 4.ª: work-or-service and eventual contracts end.
  abolished_modalities: rule(
    'abolished_modalities',
    'rdl32_2021',
    'Estatuto de los Trabajadores, art. 15.1, y disposiciones transitorias 3.ª y 4.ª del Real Decreto-ley 32/2021',
    RDL32_2021,
    REFORM_SINCE,
  ),
  // 15.4: a person hired in breach of art. 15 acquires the status of permanent.
  permanent_on_breach: reform('permanent_on_breach', '15.4', 'a15'),
  // 15.5 and transitional provision 5.ª: over 18 months within 24 in production contracts.
  chaining_18_in_24: reform('chaining_18_in_24', '15.5', 'a15'),
  // 15.9: the public employment service certifies the temporary contracts.
  temporary_certificate: reform('temporary_certificate', '15.9', 'a15'),
  // 16.2: a fixed-discontinuous contract states the activity period, hours and their distribution.
  discontinuous_essentials: reform('discontinuous_essentials', '16.2', 'a16'),
  // 11.2.g: alternance training lasts between three months and two years.
  training_alternance_duration: reform('training_alternance_duration', '11.2.g', 'a11'),
  // 11.2.i: effective work at most 65 % the first year and 85 % the second.
  training_alternance_effective_work: reform('training_alternance_effective_work', '11.2.i', 'a11'),
  // 11.2.k: no overtime, complementary hours, night work or shifts.
  training_alternance_no_overtime: reform('training_alternance_no_overtime', '11.2.k', 'a11'),
  // 11.2.l: no trial period.
  training_alternance_no_trial: reform('training_alternance_no_trial', '11.2.l', 'a11'),
  // 11.2.m: never under the minimum wage in proportion to effective work.
  training_alternance_pay: reform('training_alternance_pay', '11.2.m', 'a11'),
  // 11.3.b: signed within three years of finishing studies, five with a disability.
  training_practice_window: reform('training_practice_window', '11.3.b', 'a11'),
  // 11.3.c: between six months and one year.
  training_practice_duration: reform('training_practice_duration', '11.3.c', 'a11'),
  // 11.3.e: a trial period of one month at most, unless the agreement says otherwise.
  training_practice_trial: reform('training_practice_trial', '11.3.e', 'a11'),
  // 11.3.h: no overtime.
  training_practice_no_overtime: reform('training_practice_no_overtime', '11.3.h', 'a11'),
  // 11.3.i: never under the minimum wage in proportion to effective work.
  training_practice_pay: reform('training_practice_pay', '11.3.i', 'a11'),
  // 11.4.c: written, with the individual training plan attached.
  training_plan_attached: reform('training_plan_attached', '11.4.c', 'a11'),
  // 11.4.g: staying on after a training contract allows no new trial period.
  training_no_new_trial: reform('training_no_new_trial', '11.4.g', 'a11'),
  // 8.2: contracts that must be written are presumed full-time and open-ended otherwise.
  written_form: et('written_form', '8.2', 'a8'),
  // 14.1: six months for qualified technicians, two otherwise, three in companies under 25.
  trial_limits: et('trial_limits', '14.1', 'a14'),
  // 14.1: one month in fixed-term contracts of up to six months.
  trial_temporary_1_month: et('trial_temporary_1_month', '14.1', 'a14'),
  // 14.1: void when the same duties were already performed in the company.
  trial_void_same_duties: et('trial_void_same_duties', '14.1', 'a14'),
  // 34.1: forty hours a week on average over the year.
  weekly_40: et('weekly_40', '34.1', 'a34'),
  // 34.3: nine ordinary hours a day unless an agreement distributes them otherwise.
  daily_9: et('daily_9', '34.3', 'a34'),
  // 34.3: twelve hours between the end of one day and the start of the next.
  rest_12: et('rest_12', '34.3', 'a34'),
  // 37.1: a day and a half of uninterrupted weekly rest.
  weekly_rest_36: et('weekly_rest_36', '37.1', 'a37'),
  // 34.4: fifteen minutes of break in a continuous day over six hours.
  break_15: et('break_15', '34.4', 'a34'),
  // 36.1: night workers, eight hours a day on average over fifteen days and no overtime.
  night_limits: et('night_limits', '36.1', 'a36'),
  // 35.2: eighty hours of overtime a year at most.
  overtime_cap_80: et('overtime_cap_80', '35.2', 'a35'),
  // 35.4: overtime is voluntary unless agreed in the agreement or the contract.
  overtime_voluntary: et('overtime_voluntary', '35.4', 'a35'),
  // 35.1: overtime paid at no less than an ordinary hour, or rested.
  overtime_value: et('overtime_value', '35.1', 'a35'),
  // 34.9: daily time record, applicable from 12-05-2019 (RDL 8/2019, DF 6.ª.4).
  time_record: rule(
    'time_record',
    'rdl8_2019',
    'Estatuto de los Trabajadores, art. 34.9',
    `${ET}#a34`,
    '2019-05-12',
  ),
  // 12.4.a: the contract states the hours and their distribution.
  part_time_contents: et('part_time_contents', '12.4.a', 'a12'),
  // 12.4.c: part-time workers do no overtime except in the cases of art. 35.3.
  part_time_no_overtime: et('part_time_no_overtime', '12.4.c', 'a12'),
  // 12.5.b, c and d: complementary hours, agreed in writing, within their cap and notice.
  complementary_hours: et('complementary_hours', '12.5', 'a12'),
  // 12.5.g: voluntary complementary hours offered by the company.
  voluntary_complementary: et('voluntary_complementary', '12.5.g', 'a12'),
  // 38.1: thirty calendar days of paid holidays a year…
  holidays_30: et('holidays_30', '38.1', 'a38'),
  // …never replaced by money.
  holidays_not_paid_out: et('holidays_not_paid_out', '38.1', 'a38'),
  // 31: two extraordinary payments a year.
  extra_pays: et('extra_pays', '31', 'a31'),
  // 21.2: post-contract non-compete, two years for technicians and six months for others, paid.
  non_compete: et('non_compete', '21.2', 'a21'),
  // 21.1: full exclusivity only with express compensation.
  exclusivity: et('exclusivity', '21.1', 'a21'),
  // 21.4: staying commitment after paid specialised training, two years at most, in writing.
  retention: et('retention', '21.4', 'a21'),
  // 3.5: rights recognised by law cannot be waived.
  waiver: et('waiver', '3.5', 'a3'),
  // 9.1: a void clause is replaced by the legal rule and the rest of the contract stands.
  partial_nullity: et('partial_nullity', '9.1', 'a9'),
  // 12.1: the company bears the costs of regular remote work.
  remote_costs: rule('remote_costs', 'law10_2021', 'art. 12.1', `${LAW10_2021}#a12`, '2021-07-11'),
  // 3.2: the essential elements the company must give in writing.
  info_elements: rd723('info_elements', 'art. 3.2', 'a3'),
  // 7.1: before the employment relationship starts.
  info_before_start: rd723('info_before_start', 'art. 7.1', 'a7'),
  // Transitional provision: contracts already running get it on request, within thirty working days.
  info_on_request: rd723('info_on_request', 'disposición transitoria única', 'dt'),
  // 2.2: chapter II only for relationships of over four weeks.
  info_short_relations: rd723('info_short_relations', 'art. 2.2', 'a2'),
  // 29.3: late wages carry ten per cent of the amount owed.
  late_payment_interest: et('late_payment_interest', '29.3', 'a29'),
  // 59: one year to claim.
  limitation: et('limitation', '59', 'a59'),
};

export function ruleSource(id: EmploymentRuleId, norms: NormTable): NormSource {
  return lawRuleSource(RULES, id, norms);
}

export type ActiveRule = LawActiveRule<EmploymentRuleId, EmploymentNormId>;

export function activeRules(date: CivilDate, norms: NormTable): readonly ActiveRule[] {
  return lawActiveRules(RULES, date, norms);
}
