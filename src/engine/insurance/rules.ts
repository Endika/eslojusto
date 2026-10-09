import type { CivilDate } from '../date';
import {
  activeRules as lawActiveRules,
  ruleSource as lawRuleSource,
  type ActiveRule as LawActiveRule,
  type Rule as LawRule,
  type RuleBase,
  type RuleOutput,
} from '../law/rules';
import type { NormSource } from '../law/sources';
import type { InsuranceNormId, NormTable } from './norms';

export type InsuranceRuleId =
  | 'non_renewal'
  | 'change_notice'
  | 'policy_correction'
  | 'questionnaire'
  | 'proportional_rule'
  | 'overinsurance'
  | 'distance_withdrawal'
  | 'distance_withdrawal_excluded';

// No insurance rule yields euros: the review gives dates and information, resting on its norms
// alone.
export type Rule = LawRule<InsuranceRuleId, InsuranceNormId> & RuleBase;

const LCS = 'https://www.boe.es/buscar/act.php?id=BOE-A-1980-22501';
const LAW22_2007 = 'https://www.boe.es/buscar/act.php?id=BOE-A-2007-13411';
const LCS_SINCE = '1981-04-17';
const LAW22_2007_SINCE = '2007-10-12';
// Art. 22 LCS as worded by Ley 20/2015, in force from 01-01-2016.
const ART22_SINCE = '2016-01-01';

const rule = (
  id: InsuranceRuleId,
  norm: InsuranceNormId,
  article: string,
  url: string,
  from: string,
  output: RuleOutput,
): Rule => ({ id, norm, article, url, from, until: null, supersededBy: null, output, sources: [] });

const lcs = (id: InsuranceRuleId, article: string, anchor: string, output: RuleOutput): Rule =>
  rule(
    id,
    'lcs',
    `Ley de Contrato de Seguro, art. ${article}`,
    `${LCS}#${anchor}`,
    LCS_SINCE,
    output,
  );

export const RULES: Readonly<Record<InsuranceRuleId, Rule>> = {
  // 22.2: the policyholder who opposes the extension gives notice at least one month before the
  // current period ends.
  non_renewal: { ...lcs('non_renewal', '22.2', 'aveintidos', 'date'), from: ART22_SINCE },
  // 22.3: the insurer gives notice of any change to the contract at least two months before the
  // current period ends.
  change_notice: { ...lcs('change_notice', '22.3', 'aveintidos', 'date'), from: ART22_SINCE },
  // 8: one month from the delivery of the policy to ask the insurer to correct a divergence from
  // the proposal or the agreed clauses.
  policy_correction: lcs('policy_correction', '8', 'aoctavo', 'info'),
  // 10: the policyholder declares what the insurer's questionnaire asks.
  questionnaire: lcs('questionnaire', '10', 'adiez', 'info'),
  // 30: a sum insured below the value of the insured interest is paid in the same proportion.
  proportional_rule: lcs('proportional_rule', '30', 'atreinta', 'info'),
  // 31: a sum insured notably above that value may be reduced, with the premium.
  overinsurance: lcs('overinsurance', '31', 'atreintayuno', 'info'),
  // 10.1: fourteen calendar days to withdraw from a contract concluded at a distance.
  distance_withdrawal: rule(
    'distance_withdrawal',
    'law22_2007',
    'art. 10.1',
    `${LAW22_2007}#a10`,
    LAW22_2007_SINCE,
    'date',
  ),
  // 10.2.b.4.º: no withdrawal from a policy that meets a duty of the policyholder to insure, such
  // as the compulsory motor liability insurance.
  distance_withdrawal_excluded: rule(
    'distance_withdrawal_excluded',
    'law22_2007',
    'art. 10.2.b.4.º',
    `${LAW22_2007}#a10`,
    LAW22_2007_SINCE,
    'info',
  ),
};

export function ruleSource(id: InsuranceRuleId, norms: NormTable): NormSource {
  return lawRuleSource(RULES, id, norms);
}

export type ActiveRule = LawActiveRule<InsuranceRuleId, InsuranceNormId>;

export function activeRules(date: CivilDate, norms: NormTable): readonly ActiveRule[] {
  return lawActiveRules(RULES, date, norms);
}

export const ruleApplies = (id: InsuranceRuleId, date: CivilDate, norms: NormTable): boolean =>
  activeRules(date, norms).some(({ rule: r }) => r.id === id);
