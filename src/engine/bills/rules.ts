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
  | 'electricity_tax'
  | 'vat'
  | 'social_bonus_discount'
  | 'social_bonus_cap'
  | 'services_pvpc'
  | 'additional_services'
  | 'unsolicited_services'
  | 'exit_penalty'
  | 'power_change'
  | 'commitment_proportional'
  | 'commitment_maximum'
  | 'change_exit'
  | 'handset_after_change'
  | 'indexed_price_rise'
  | 'exit_effective';

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
const ELECTRICITY_TAX_URL = 'https://www.boe.es/buscar/act.php?id=BOE-A-1992-28741#a99';
const VAT_URL = 'https://www.boe.es/buscar/act.php?id=BOE-A-1992-28740#a90';
const SOCIAL_BONUS_URL = 'https://www.boe.es/buscar/act.php?id=BOE-A-2026-6544#a1';
const SOCIAL_BONUS_CAP_URL = 'https://www.boe.es/buscar/act.php?id=BOE-A-2017-11505#ai';
// No block of the consolidated text has been read: the link opens on the whole regulation.
const RD88_URL = 'https://www.boe.es/buscar/act.php?id=BOE-A-2026-3212';
const RD216_URL = 'https://www.boe.es/buscar/act.php?id=BOE-A-2014-3376#a5';
// Art. 62.5 in the wording of Real Decreto-ley 7/2021, in force from 01-01-2022.
const TRLGDCU_URL = 'https://www.boe.es/buscar/act.php?id=BOE-A-2007-20555#a62';
// The blocks of arts. 60 bis and 66 quáter have not been read: the link opens on the whole text.
const TRLGDCU_TEXT_URL = 'https://www.boe.es/buscar/act.php?id=BOE-A-2007-20555';
// Neither consolidated text's blocks have been read: the links open on the whole text.
const LGTEL_URL = 'https://www.boe.es/buscar/act.php?id=BOE-A-2022-10757';
const RD899_URL = 'https://www.boe.es/buscar/act.php?id=BOE-A-2009-8961';

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
  // Arts. 95, 97 and 99: the electricity tax falls due with the bill, on the supply's
  // consideration, at the rate of that day and never under its floor per MWh. Rates by day live in
  // the table, each row with its own decree.
  electricity_tax: rule(
    'electricity_tax',
    'law38_1992',
    'Ley 38/1992, arts. 95, 97 y 99',
    ELECTRICITY_TAX_URL,
    '2026-01-01',
    null,
    'amount',
  ),
  // Arts. 75, 78 and 90: VAT falls due with the bill, on everything charged including the
  // electricity tax, at the rate of that day.
  vat: rule(
    'vat',
    'law37_1992',
    'Ley 37/1992, arts. 75, 78 y 90',
    VAT_URL,
    '2026-01-01',
    null,
    'amount',
  ),
  // Art. 1: the social bonus discounts of 2026 on the PVPC of a reference retailer.
  social_bonus_discount: rule(
    'social_bonus_discount',
    'rdl7_2026',
    'Real Decreto-ley 7/2026, art. 1',
    SOCIAL_BONUS_URL,
    '2026-03-22',
    '2026-12-31',
    'amount',
  ),
  // Annex I: the kWh a year with the discount.
  social_bonus_cap: rule(
    'social_bonus_cap',
    'rd897_2017',
    'Real Decreto 897/2017, anexo I',
    SOCIAL_BONUS_CAP_URL,
    '2026-01-01',
    null,
    'amount',
  ),
  // Art. 5.6: a PVPC bill carries the supply and nothing else.
  services_pvpc: rule(
    'services_pvpc',
    'rd216_2014',
    'Real Decreto 216/2014, art. 5.6',
    RD216_URL,
    '2026-01-01',
    null,
    'amount',
  ),
  // Art. 18.7: services besides the supply only when the person asked for them, which the retailer
  // has to prove. In force with the decree.
  additional_services: rule(
    'additional_services',
    'rd88_2026',
    'Real Decreto 88/2026, art. 18.7',
    RD88_URL,
    '2026-02-12',
    null,
    'amount',
  ),
  // Arts. 60 bis and 66 quáter: no extra payment without express consent, and nothing supplied
  // that was not asked for.
  unsolicited_services: rule(
    'unsolicited_services',
    'trlgdcu',
    'Texto refundido de la Ley General para la Defensa de los Consumidores y Usuarios, arts. 60 bis y 66 quáter',
    TRLGDCU_TEXT_URL,
    '2026-01-01',
    null,
    'amount',
  ),
  // Art. 28.3: a natural person on the 2.0TD tariff pays for leaving only on a fixed price before
  // the first renewal. Takes effect on 12-06-2026 (final provision 9.ª.4).
  exit_penalty: rule(
    'exit_penalty',
    'rd88_2026',
    'Real Decreto 88/2026, art. 28.3',
    RD88_URL,
    '2026-06-12',
    null,
    'amount',
  ),
  // Art. 38: the contracted power may change once every 12 months. In force with the decree.
  power_change: rule(
    'power_change',
    'rd88_2026',
    'Real Decreto 88/2026, art. 38',
    RD88_URL,
    '2026-02-12',
    null,
    'info',
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
  // Art. 67.7: a consumer's commitment lasts 24 months at most. Shown without a figure.
  commitment_maximum: rule(
    'commitment_maximum',
    'lgtel',
    'Ley 11/2022, art. 67.7',
    LGTEL_URL,
    '2022-06-30',
    null,
    'info',
  ),
  // Art. 67.8: a change of conditions is notified a month ahead, and the subscriber may leave
  // within the month after without paying for it.
  change_exit: rule(
    'change_exit',
    'lgtel',
    'Ley 11/2022, art. 67.8',
    LGTEL_URL,
    '2022-06-30',
    null,
    'amount',
  ),
  // Art. 67.10: leaving that way, what is still owed is the subsidised handset the subscriber keeps.
  handset_after_change: rule(
    'handset_after_change',
    'lgtel',
    'Ley 11/2022, art. 67.10',
    LGTEL_URL,
    '2022-06-30',
    null,
    'amount',
  ),
  // A rise under a clause tied to a public price index, which the Court of Justice did not take
  // as a change of conditions. Never an amount: not read against the current law.
  indexed_price_rise: {
    ...rule(
      'indexed_price_rise',
      'lgtel',
      'Ley 11/2022, art. 67.8',
      LGTEL_URL,
      '2022-06-30',
      null,
      'info',
    ),
    sources: ['tjue_c326_14'],
  },
  // Art. 7: an exit takes effect within two working days of the request; nothing that accrues
  // later for a cause not the subscriber's may be billed.
  exit_effective: rule(
    'exit_effective',
    'rd899_2009',
    'Real Decreto 899/2009, art. 7',
    RD899_URL,
    '2009-08-30',
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
