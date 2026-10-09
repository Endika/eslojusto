import type { CivilDate } from '../date';
import {
  activeRules as lawActiveRules,
  ruleSource as lawRuleSource,
  type ActiveRule as LawActiveRule,
  type Rule as LawRule,
  type RuleBase,
  type RuleOutput,
} from '../law/rules';
import type { LawSource, NormSource } from '../law/sources';
import type { CreditNormId, CreditSourceId, NormStatus, NormTable, SourceTable } from './norms';

export type StatuteRuleId =
  | 'consumer'
  | 'exclusions'
  | 'tae_formula'
  | 'tae_missing'
  | 'tae_inexact'
  | 'contract_mentions'
  | 'cash_option'
  | 'withdrawal'
  | 'early_repayment_cap'
  | 'early_repayment_none'
  | 'early_repayment_losses'
  | 'early_repayment_interest_cap'
  | 'unused_premium'
  | 'tae_assumptions'
  | 'revolving_info'
  | 'usury_law'
  | 'period_count'
  | 'directive_notice'
  | 'repayment_under_500'
  | 'withdrawal_cap_12m'
  | 'tae_caps';

// Rules that rest on a court's criterion rather than on a norm.
export type CriterionRuleId = 'usury_indicator_revolving' | 'usury_indicator_loan';

export type CreditRuleId = StatuteRuleId | CriterionRuleId;

export type StatuteRule = LawRule<StatuteRuleId, CreditNormId> & RuleBase<CreditSourceId>;

// A criterion reaches contracts of any date; its source carries the day it was decided.
export interface CriterionRule extends RuleBase<CreditSourceId> {
  readonly id: CriterionRuleId;
  readonly norm: null;
  readonly source: CreditSourceId;
  readonly output: 'indicator';
}

const LCC = 'https://www.boe.es/buscar/act.php?id=BOE-A-2011-10970';
const LCC_SINCE = '2011-09-25';
const CC = 'https://www.boe.es/buscar/act.php?id=BOE-A-1889-4763';
const LCC_ANNEX_2013 = 'https://www.boe.es/buscar/doc.php?id=BOE-A-2013-1338';
const LRU = 'https://www.boe.es/buscar/act.php?id=BOE-A-1908-5579';
const OEHA = 'https://www.boe.es/buscar/act.php?id=BOE-A-2011-17015';
const DCC_2023 = 'https://eur-lex.europa.eu/legal-content/ES/TXT/HTML/?uri=CELEX:32023L2225';
const CONSUMER_CREDIT_BILL =
  'https://portal.mineco.gob.es/RecursosArticulo/mineco/ministerio/participacion_publica/audiencia/ficheros/ECO_TES_20260108_AP_APL_Credito_Consumo.pdf';
const BILL_SINCE = '2026-01-07';

const rule = (
  id: StatuteRuleId,
  norm: CreditNormId,
  article: string,
  url: string,
  from: string,
  output: RuleOutput,
): StatuteRule => ({
  id,
  norm,
  article,
  url,
  from,
  until: null,
  supersededBy: null,
  output,
  sources: [],
});

const lcc = (id: StatuteRuleId, article: string, output: RuleOutput): StatuteRule =>
  rule(
    id,
    'lcc',
    `Ley de contratos de crédito al consumo, art. ${article}`,
    `${LCC}#a${article.split(/[.\s]/)[0]}`,
    LCC_SINCE,
    output,
  );

export const STATUTE_RULES: Readonly<Record<StatuteRuleId, StatuteRule>> = {
  // 2: the consumer is a natural person acting outside a trade or profession.
  consumer: lcc('consumer', '2', 'info'),
  // 3: credits secured by a mortgage, under 200 € and leases without an obligation to buy are
  // left out.
  exclusions: lcc('exclusions', '3', 'info'),
  // 32 and annex I: the APR equation and its assumptions.
  tae_formula: lcc('tae_formula', '32 y anexo I', 'indicator'),
  // 21.2: a contract that does not state the APR.
  tae_missing: lcc('tae_missing', '21.2', 'info'),
  // 21.4: an APR stated lower than the real one; its consequences are modulated.
  tae_inexact: lcc('tae_inexact', '21.4', 'info'),
  // 16.2: what the contract must state.
  contract_mentions: lcc('contract_mentions', '16.2', 'info'),
  // 26.3: whoever finances a purchase may always choose not to take the credit and pay as agreed
  // with the seller.
  cash_option: lcc('cash_option', '26.3', 'info'),
  // 28: fourteen calendar days to withdraw, from the contract or the later receipt of its terms.
  withdrawal: lcc('withdrawal', '28', 'date'),
  // 30.2: compensation up to 1 % of the amount repaid with over a year left, 0,5 % otherwise.
  early_repayment_cap: lcc('early_repayment_cap', '30.2', 'amount'),
  // 30.3: no compensation for a variable rate period or a repayment paid by an insurance.
  early_repayment_none: lcc('early_repayment_none', '30.3', 'amount'),
  // 30.4: more only if the lender proves a higher loss.
  early_repayment_losses: lcc('early_repayment_losses', '30.4', 'info'),
  // 30.5: never more than the interest left to pay.
  early_repayment_interest_cap: lcc('early_repayment_interest_cap', '30.5', 'amount'),
  // 30.6: the unused premium of a linked insurance.
  unused_premium: lcc('unused_premium', '30.6', 'info'),
  // Annex I, part II: the extra assumptions of the APR as rewritten from 09-02-2013.
  tae_assumptions: rule(
    'tae_assumptions',
    'lcc_annex_2013',
    'Ley de contratos de crédito al consumo, anexo I, parte II',
    LCC_ANNEX_2013,
    '2013-02-09',
    'indicator',
  ),
  // 33 quinquies and 33 sexies: the statement a revolving card owes at least every quarter, and
  // the breakdown and repayment table on request within 5 working days.
  revolving_info: rule(
    'revolving_info',
    'oeha',
    'Orden de transparencia bancaria, arts. 33 quinquies y 33 sexies',
    `${OEHA}#a3-17`,
    '2021-01-27',
    'info',
  ),
  // 1: a loan at an interest notably higher than the normal one and manifestly disproportionate is
  // void. The average-rate criteria read it; the law itself fixes no threshold.
  usury_law: rule(
    'usury_law',
    'lru',
    'Ley de 23 de julio de 1908, art. 1',
    `${LRU}#a1`,
    '1908-08-13',
    'info',
  ),
  // Código Civil 5.1: days run from the day after; months run date to date.
  period_count: rule(
    'period_count',
    'cc',
    'Código Civil, art. 5.1',
    `${CC}#art5`,
    LCC_SINCE,
    'date',
  ),
  // The new consumer credit directive, not yet transposed: a notice, never a rule applied.
  directive_notice: rule(
    'directive_notice',
    'dcc_2023',
    'pendiente de transposición',
    DCC_2023,
    '2026-11-20',
    'info',
  ),
  // The bill, never applied while it is a draft. 49.3.c: no compensation for early repayments under
  // 500 € in 12 months.
  repayment_under_500: rule(
    'repayment_under_500',
    'consumer_credit_bill',
    'Anteproyecto de ley de contratos de crédito al consumo, art. 49.3.c',
    CONSUMER_CREDIT_BILL,
    BILL_SINCE,
    'info',
  ),
  // 47: withdrawal ends 12 months and 14 days on when the information was never given.
  withdrawal_cap_12m: rule(
    'withdrawal_cap_12m',
    'consumer_credit_bill',
    'Anteproyecto de ley de contratos de crédito al consumo, art. 47',
    CONSUMER_CREDIT_BILL,
    BILL_SINCE,
    'date',
  ),
  // 70 to 72: APR caps set by quarter and segment. The bill leaves the figures to a royal decree, so
  // there is no table of caps and nothing is compared with one.
  tae_caps: rule(
    'tae_caps',
    'consumer_credit_bill',
    'Anteproyecto de ley de contratos de crédito al consumo, arts. 70 a 72',
    CONSUMER_CREDIT_BILL,
    BILL_SINCE,
    'info',
  ),
};

const criterion = (id: CriterionRuleId, source: CreditSourceId): CriterionRule => ({
  id,
  norm: null,
  source,
  output: 'indicator',
  sources: [source, 'bde_be1904'],
});

export const CRITERION_RULES: Readonly<Record<CriterionRuleId, CriterionRule>> = {
  // The APR of a revolving card against the BdE average of its month (STS 258/2023).
  usury_indicator_revolving: criterion('usury_indicator_revolving', 'sts258_2023'),
  // The APR of a loan against the BdE average of its month and term (STS 366/2026).
  usury_indicator_loan: criterion('usury_indicator_loan', 'sts366_2026'),
};

export const RULES: Readonly<Record<CreditRuleId, StatuteRule | CriterionRule>> = {
  ...STATUTE_RULES,
  ...CRITERION_RULES,
};

export function ruleSource(id: StatuteRuleId, norms: NormTable): NormSource<NormStatus> {
  return lawRuleSource(STATUTE_RULES, id, norms);
}

export const criterionSource = (id: CriterionRuleId, sources: SourceTable): LawSource =>
  sources[CRITERION_RULES[id].source];

export type ActiveRule = LawActiveRule<StatuteRuleId, CreditNormId, NormStatus>;

// The statute rules that govern a contract concluded on `date`.
export function activeRules(date: CivilDate, norms: NormTable): readonly ActiveRule[] {
  return lawActiveRules(STATUTE_RULES, date, norms);
}

export const ruleApplies = (id: StatuteRuleId, date: CivilDate, norms: NormTable): boolean =>
  activeRules(date, norms).some(({ rule: r }) => r.id === id);
