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
import type { BillsNormId, BillsSourceId, NormStatus, NormTable } from './norms';

export type BillsRuleId =
  | 'billing'
  | 'tolls'
  | 'charges'
  | 'pvpc_eligibility'
  | 'pvpc_margin'
  | 'social_bonus_funding_until_june'
  | 'social_bonus_funding'
  | 'meter_rent'
  | 'commitment_proportional';

export type BillsRule = LawRule<BillsRuleId, BillsNormId> & RuleBase<BillsSourceId>;

const rule = (
  id: BillsRuleId,
  norm: BillsNormId,
  article: string,
  url: string,
  from: string,
  until: string | null,
  output: RuleOutput,
): BillsRule => ({
  id,
  norm,
  article,
  url,
  from,
  until,
  supersededBy: null,
  output,
  sources: [],
});

// Where each table row's link already points.
const TOLLS_URL = 'https://www.boe.es/diario_boe/txt.php?id=BOE-A-2025-26348';
const CHARGES_URL = 'https://www.boe.es/diario_boe/txt.php?id=BOE-A-2025-26705';
const FUNDING_URL = 'https://www.boe.es/diario_boe/txt.php?id=BOE-A-2026-13759';
const MARGIN_URL = 'https://www.boe.es/buscar/act.php?id=BOE-A-2016-12274#ai-2';
const METER_URL = 'https://www.boe.es/buscar/act.php?id=BOE-A-2013-8561#dt';
// The block of arts. 43 to 45 in the consolidated text has not been read: the link opens on the
// whole regulation.
const RD88_URL = 'https://www.boe.es/buscar/act.php?id=BOE-A-2026-3212';
const RD216_URL = 'https://www.boe.es/buscar/act.php?id=BOE-A-2014-3376#a5';
// Art. 62.5 in the wording of Real Decreto-ley 7/2021, in force from 01-01-2022.
const TRLGDCU_URL = 'https://www.boe.es/buscar/act.php?id=BOE-A-2007-20555#a62';

export const RULES: Readonly<Record<BillsRuleId, BillsRule>> = {
  // Arts. 43 to 45: reading and billing, and what was charged wrong is settled in the next bill.
  // In force with the decree on 12-02-2026, they take effect on 12-06-2026 (final provision
  // 9.ª.4). Bills issued before it are left out of the review.
  billing: rule(
    'billing',
    'rd88_2026',
    'Real Decreto 88/2026, arts. 43 a 45',
    RD88_URL,
    '2026-06-12',
    null,
    'info',
  ),
  // The 2026 tolls of the 2.0TD tariff.
  tolls: rule(
    'tolls',
    'cnmc_tolls_2026',
    'Resolución de la CNMC de 18 de diciembre de 2025, peajes 2.0TD',
    TOLLS_URL,
    '2026-01-01',
    '2026-12-31',
    'amount',
  ),
  // The 2026 charges of consumer segment 1.
  charges: rule(
    'charges',
    'order_ted1524_2025',
    'Orden TED/1524/2025, cargos del segmento 1',
    CHARGES_URL,
    '2026-01-01',
    '2026-12-31',
    'amount',
  ),
  // Art. 5.3: the PVPC is for power up to 10 kW and holders who are natural persons or micro
  // enterprises, in the wording of BOE-A-2023-14048, in force from 15-06-2023.
  pvpc_eligibility: rule(
    'pvpc_eligibility',
    'rd216_2014',
    'Real Decreto 216/2014, art. 5.3',
    RD216_URL,
    '2023-06-15',
    null,
    'info',
  ),
  // The fixed PVPC retail margin, a 2016 figure no 2026 norm confirms: never an amount.
  pvpc_margin: rule(
    'pvpc_margin',
    'order_etu1948_2016',
    'Orden ETU/1948/2016, anexo II',
    MARGIN_URL,
    '2026-01-01',
    '2026-12-31',
    'info',
  ),
  social_bonus_funding_until_june: rule(
    'social_bonus_funding_until_june',
    'order_ted1524_2025',
    'Orden TED/1524/2025, financiación del bono social',
    CHARGES_URL,
    '2026-01-01',
    '2026-06-25',
    'amount',
  ),
  social_bonus_funding: rule(
    'social_bonus_funding',
    'order_ted634_2026',
    'Orden TED/634/2026, financiación del bono social',
    FUNDING_URL,
    '2026-06-26',
    '2026-12-31',
    'amount',
  ),
  // Transitional provision: the regulated monthly rent of a meter.
  meter_rent: rule(
    'meter_rent',
    'order_iet1491_2013',
    'Orden IET/1491/2013, disposición transitoria única',
    METER_URL,
    '2026-01-01',
    null,
    'amount',
  ),
  // Art. 62.5: a penalty for leaving a commitment early, in proportion to the days left.
  commitment_proportional: rule(
    'commitment_proportional',
    'trlgdcu',
    'Texto refundido de la Ley General para la Defensa de los Consumidores y Usuarios, art. 62.5',
    TRLGDCU_URL,
    '2022-01-01',
    null,
    'amount',
  ),
};

export function ruleSource(id: BillsRuleId, norms: NormTable): NormSource<NormStatus> {
  return lawRuleSource(RULES, id, norms);
}

export type ActiveRule = LawActiveRule<BillsRuleId, BillsNormId, NormStatus>;

// The rules that govern a bill on `date`.
export function activeRules(date: CivilDate, norms: NormTable): readonly ActiveRule[] {
  return lawActiveRules(RULES, date, norms);
}
