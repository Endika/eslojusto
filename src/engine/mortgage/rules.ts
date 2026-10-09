import { toIso, type CivilDate } from '../date';
import {
  activeRules as lawActiveRules,
  ruleSource as lawRuleSource,
  type ActiveRule as LawActiveRule,
  type Rule as LawRule,
  type RuleBase,
  type RuleOutput,
} from '../law/rules';
import type { LawSource, NormSource } from '../law/sources';
import type { MortgageNormId, MortgageSourceId, NormStatus, NormTable, SourceTable } from './norms';

// What a rule rests on: a law, or a court's criterion that depends on a judge. The two are never
// added together.
export type Basis = 'statute' | 'case_law';

export type StatuteRuleId =
  | 'binding_terms'
  | 'expenses_lcci'
  | 'transparency_act_free'
  | 'ajd_lender'
  | 'prepayment_lcci_variable'
  | 'prepayment_lcci_fixed'
  | 'conversion_cap_2019'
  | 'conversion_cap_2022'
  | 'conversion_cap_2023'
  | 'fee_free_window'
  | 'prepayment_law41'
  | 'financial_loss_cap'
  | 'unused_premium'
  | 'floor_statute'
  | 'default_interest_statute'
  | 'default_interest_lh114'
  | 'early_termination'
  | 'opening_fee_duplicate'
  | 'insurance_tied'
  | 'fein_timing'
  | 'handwritten_statement'
  | 'restitution'
  | 'prior_step_439bis'
  | 'complaints_service'
  | 'loan_assignment';

export type CaseLawRuleId =
  | 'expenses_ts_split'
  | 'expenses_interest'
  | 'ajd_borrower_before_2018'
  | 'floor_case_law'
  | 'irph'
  | 'default_interest_case_law'
  | 'early_termination_case_law'
  | 'opening_fee_case_law'
  | 'limitation_rule';

export type MortgageRuleId = StatuteRuleId | CaseLawRuleId;

export type StatuteRule = LawRule<StatuteRuleId, MortgageNormId> &
  RuleBase<MortgageSourceId> & { readonly basis: 'statute' };

// A court's criterion: no norm of its own, the rulings it rests on, and the deeds it reaches by
// their date (null: no bound).
export interface CaseLawRule extends RuleBase<MortgageSourceId> {
  readonly id: CaseLawRuleId;
  readonly norm: null;
  readonly basis: 'case_law';
  readonly from: string | null;
  readonly until: string | null;
}

export type MortgageRule = StatuteRule | CaseLawRule;

const LCCI = 'https://www.boe.es/buscar/act.php?id=BOE-A-2019-3814';
const LCCI_SINCE = '2019-06-16';
const LCCI_EVE = '2019-06-15';
const TRLITPAJD = 'https://www.boe.es/buscar/act.php?id=BOE-A-1993-25359';
const LAW41_2007 = 'https://www.boe.es/buscar/act.php?id=BOE-A-2007-21086';
const RDL19_2022 = 'https://www.boe.es/buscar/act.php?id=BOE-A-2022-19403';
const RDL19_2022_SINCE = '2022-11-24';
const RDL8_2023 = 'https://www.boe.es/buscar/act.php?id=BOE-A-2023-26452';
const RDL8_2023_SINCE = '2023-12-29';
const LH = 'https://www.boe.es/buscar/act.php?id=BOE-A-1946-2453';
const LAW1_2013 = 'https://www.boe.es/buscar/act.php?id=BOE-A-2013-5073';
const LAW1_2013_SINCE = '2013-05-15';
const CC = 'https://www.boe.es/buscar/act.php?id=BOE-A-1889-4763';
// Art. 439 bis lives in the consolidated Ley de Enjuiciamiento Civil.
const LEC = 'https://www.boe.es/buscar/act.php?id=BOE-A-2000-323';
// Art. 25 bis LCCI, added by RDL 29/2026, applies to assignments made from 08-10-2026 whatever the
// day of the loan (its final provision 11.2).
const LCCI_25BIS_SINCE = '2026-10-08';
const LAW44_2002 = 'https://www.boe.es/buscar/act.php?id=BOE-A-2002-22807';

const rule = (
  id: StatuteRuleId,
  norm: MortgageNormId,
  article: string,
  url: string,
  from: string,
  until: string | null,
  output: RuleOutput,
): StatuteRule => ({
  id,
  norm,
  article,
  url,
  from,
  until,
  supersededBy: null,
  output,
  sources: [],
  basis: 'statute',
});

// The consolidated text anchors article 1 as `#ar` and article N as `#ar-N`.
const lcciAnchor = (article: number): string => (article === 1 ? '#ar' : `#ar-${article}`);

const lcci = (id: StatuteRuleId, article: string, output: RuleOutput): StatuteRule =>
  rule(
    id,
    'lcci',
    `Ley de contratos de crédito inmobiliario, art. ${article}`,
    `${LCCI}${lcciAnchor(Number(article.split(/[.\s]/)[0]))}`,
    LCCI_SINCE,
    null,
    output,
  );

export const STATUTE_RULES: Readonly<Record<StatuteRuleId, StatuteRule>> = {
  // 3: the law binds both parties; an agreement cannot set aside what it puts on the lender.
  binding_terms: lcci('binding_terms', '3', 'info'),
  // 14.1.e: the lender pays the notary of the loan, the registry and the agency; the valuation is
  // the borrower's, and the copies are paid by whoever asks for them.
  expenses_lcci: lcci('expenses_lcci', '14.1.e', 'amount'),
  // 15.8: the notary's record of the pre-contract advice is free for the borrower.
  transparency_act_free: lcci('transparency_act_free', '15.8', 'amount'),
  // Art. 29 TRLITPAJD: the lender bears the tax on the mortgage deed from 10-11-2018.
  ajd_lender: rule(
    'ajd_lender',
    'trlitpajd29',
    'Ley del Impuesto sobre Transmisiones Patrimoniales y Actos Jurídicos Documentados, art. 29',
    `${TRLITPAJD}#a29`,
    '2018-11-10',
    null,
    'amount',
  ),
  // 23.5: the cap on early repayment of a variable rate, by the option the deed picks.
  prepayment_lcci_variable: lcci('prepayment_lcci_variable', '23.5', 'amount'),
  // 23.7: the cap on early repayment of a fixed rate.
  prepayment_lcci_fixed: lcci('prepayment_lcci_fixed', '23.7', 'amount'),
  // 23.6, the switch from variable to fixed, read against the day of the switch in each of its
  // three wordings; the first transitional provision, 3, reaches deeds of any date.
  conversion_cap_2019: {
    ...lcci('conversion_cap_2019', '23.6', 'amount'),
    until: '2022-11-23',
  },
  conversion_cap_2022: rule(
    'conversion_cap_2022',
    'rdl19_2022',
    'Ley de contratos de crédito inmobiliario, art. 23.6, en la redacción del Real Decreto-ley 19/2022',
    `${RDL19_2022}#a1-4`,
    RDL19_2022_SINCE,
    '2023-12-28',
    'amount',
  ),
  conversion_cap_2023: rule(
    'conversion_cap_2023',
    'rdl8_2023',
    'Ley de contratos de crédito inmobiliario, art. 23.6, en la redacción del Real Decreto-ley 8/2023',
    `${RDL8_2023}#a2`,
    RDL8_2023_SINCE,
    null,
    'amount',
  ),
  // Additional provision 1.ª of RDL 19/2022, as RDL 8/2023 worded it: no compensation for
  // repaying or switching a variable rate between 24-11-2022 and 31-12-2024.
  fee_free_window: rule(
    'fee_free_window',
    'rdl19_2022',
    'Real Decreto-ley 19/2022, disposición adicional primera, en la redacción del Real Decreto-ley 8/2023',
    `${RDL19_2022}#da`,
    RDL19_2022_SINCE,
    '2024-12-31',
    'amount',
  ),
  // Arts. 8 and 9: compensation caps for loans concluded from 09-12-2007 until the LCCI.
  prepayment_law41: rule(
    'prepayment_law41',
    'law41_2007',
    'Ley 41/2007, arts. 8 y 9',
    `${LAW41_2007}#a8`,
    '2007-12-09',
    LCCI_EVE,
    'amount',
  ),
  // 23.8: never more than the lender's financial loss, which the review cannot work out.
  financial_loss_cap: lcci('financial_loss_cap', '23.8', 'info'),
  // 23.3: the unused premium of an ancillary insurance on full repayment.
  unused_premium: lcci('unused_premium', '23.3', 'info'),
  // 21.3: a variable rate may not have a floor; 21.4 adds it never goes below zero.
  floor_statute: lcci('floor_statute', '21.3', 'info'),
  // 25: late interest is the ordinary rate plus three points.
  default_interest_statute: lcci('default_interest_statute', '25', 'info'),
  // Third paragraph: up to three times the legal interest for loans on the main home.
  default_interest_lh114: rule(
    'default_interest_lh114',
    'lh114',
    'Ley Hipotecaria, art. 114, párrafo tercero',
    `${LH}#a114`,
    LAW1_2013_SINCE,
    LCCI_EVE,
    'info',
  ),
  // 24: the minimum arrears for early termination; the first transitional provision, 4, applies
  // them to earlier contracts too.
  early_termination: lcci('early_termination', '24', 'info'),
  // 14.4: no fee for a service the opening fee already covers.
  opening_fee_duplicate: lcci('opening_fee_duplicate', '14.4', 'info'),
  // 17: tied and combined products.
  insurance_tied: lcci('insurance_tied', '17', 'info'),
  // 14 and 15: the FEIN and FiAE ten calendar days before, and the notary's record.
  fein_timing: lcci('fein_timing', '14 y 15', 'info'),
  // Art. 6: the handwritten statement for deeds from 15-05-2013 until the LCCI.
  handwritten_statement: rule(
    'handwritten_statement',
    'law1_2013',
    'Ley 1/2013, art. 6',
    `${LAW1_2013}#a6`,
    LAW1_2013_SINCE,
    LCCI_EVE,
    'info',
  ),
  // Art. 1303: what each party gives back, with its interest.
  restitution: rule(
    'restitution',
    'cc',
    'Código Civil, art. 1303',
    `${CC}#art1303`,
    '1889-08-16',
    null,
    'info',
  ),
  // Art. 439 bis LEC: the step before going to court over a mortgage's clauses. Only explained.
  prior_step_439bis: rule(
    'prior_step_439bis',
    'lo1_2025',
    'Ley de Enjuiciamiento Civil, art. 439 bis',
    `${LEC}#a4-5`,
    '2025-04-03',
    null,
    'info',
  ),
  // Art. 30: the Servicio de Reclamaciones del Banco de España.
  complaints_service: rule(
    'complaints_service',
    'law44_2002',
    'Ley 44/2002, art. 30',
    `${LAW44_2002}#a30`,
    '2002-11-24',
    null,
    'info',
  ),
  // Art. 25 bis: on an assignment of the loan the borrower keeps every defence against the new
  // holder, and is told of it. Pending validation by the Congress: only explained.
  loan_assignment: rule(
    'loan_assignment',
    'lcci_25bis',
    'Ley de contratos de crédito inmobiliario, art. 25 bis, añadido por el Real Decreto-ley 29/2026',
    `${LCCI}#a2`,
    LCCI_25BIS_SINCE,
    null,
    'info',
  ),
};

const criterion = (
  id: CaseLawRuleId,
  sources: readonly MortgageSourceId[],
  from: string | null,
  until: string | null,
): CaseLawRule => ({
  id,
  norm: null,
  basis: 'case_law',
  sources,
  from,
  until,
  // Information until every ruling it rests on is opened at its source; only then may the
  // engine give a figure (see amount-rules).
  output: 'info',
});

export const CASE_LAW_RULES: Readonly<Record<CaseLawRuleId, CaseLawRule>> = {
  // The Supreme Court's split of the set-up costs for consumers before the LCCI.
  expenses_ts_split: criterion(
    'expenses_ts_split',
    ['sts35_2021', 'sts816_2023', 'tjue_c224_19'],
    null,
    LCCI_EVE,
  ),
  // Legal interest on each cost from the day it was paid.
  expenses_interest: criterion('expenses_interest', ['sts725_2018'], null, LCCI_EVE),
  // The tax on the deed was the borrower's before 10-11-2018.
  ajd_borrower_before_2018: criterion(
    'ajd_borrower_before_2018',
    ['sts147_148_2018'],
    null,
    '2018-11-09',
  ),
  floor_case_law: criterion(
    'floor_case_law',
    ['tjue_c154_15', 'tjue_c452_18', 'sts241_2013'],
    null,
    LCCI_EVE,
  ),
  irph: criterion('irph', ['tjue_c125_18', 'tjue_c265_22'], null, null),
  default_interest_case_law: criterion(
    'default_interest_case_law',
    ['tjue_c96_16', 'sts364_2016'],
    null,
    LCCI_EVE,
  ),
  early_termination_case_law: criterion(
    'early_termination_case_law',
    ['tjue_c70_17', 'sts463_2019'],
    null,
    LCCI_EVE,
  ),
  opening_fee_case_law: criterion(
    'opening_fee_case_law',
    ['tjue_c565_21', 'sts816_2023'],
    null,
    null,
  ),
  // Explained as a rule with its source, never applied to a case.
  limitation_rule: criterion('limitation_rule', ['tjue_c561_21', 'sts857_2024'], null, null),
};

export const RULES: Readonly<Record<MortgageRuleId, MortgageRule>> = {
  ...STATUTE_RULES,
  ...CASE_LAW_RULES,
};

export function ruleSource(id: StatuteRuleId, norms: NormTable): NormSource<NormStatus> {
  return lawRuleSource(STATUTE_RULES, id, norms);
}

// A court's criterion gives a figure only when it is marked to and every ruling it rests on was
// read at its source.
export const criterionCounts = (rule: CaseLawRule, sources: SourceTable): boolean =>
  rule.output === 'amount' && rule.sources.every((id) => sources[id].verified);

export const caseLawSources = (id: CaseLawRuleId, sources: SourceTable): readonly LawSource[] =>
  CASE_LAW_RULES[id].sources.map((s) => sources[s]);

export type ActiveRule = LawActiveRule<StatuteRuleId, MortgageNormId>;

// The statute rules that govern `date` (the deed's, or the operation's for the fee caps).
export function activeRules(date: CivilDate, norms: NormTable): readonly ActiveRule[] {
  return lawActiveRules(STATUTE_RULES, date, norms);
}

export const ruleApplies = (id: StatuteRuleId, date: CivilDate, norms: NormTable): boolean =>
  activeRules(date, norms).some(({ rule: r }) => r.id === id);

// Whether a statute rule governs `date`, and whether its norm stands that day without doubt.
export function ruleStanding(
  id: StatuteRuleId,
  date: CivilDate,
  norms: NormTable,
): 'applies' | 'doubt' | 'no' {
  const found = activeRules(date, norms).find(({ rule: r }) => r.id === id);
  if (found === undefined) return 'no';
  return found.doubt === null ? 'applies' : 'doubt';
}

// Whether a court's criterion reaches a deed of `date`.
export function criterionReaches(id: CaseLawRuleId, date: CivilDate): boolean {
  const day = toIso(date);
  const { from, until } = CASE_LAW_RULES[id];
  return (from === null || day >= from) && (until === null || day <= until);
}
