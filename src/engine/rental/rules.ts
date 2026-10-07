import type { CivilDate } from '../date';
import {
  activeRules as lawActiveRules,
  ruleSource as lawRuleSource,
  type ActiveRule as LawActiveRule,
  type Rule as LawRule,
} from '../law/rules';
import type { NormSource } from '../law/sources';
import type { NormId, NormTable } from './norms';

export type { RuleDoubt } from '../law/rules';

export type RuleId =
  | 'fees_2019'
  | 'fees_2023'
  | 'fees_2026'
  | 'deposit_one_month'
  | 'guarantee_cap'
  | 'insurance_ban'
  | 'advance_cap'
  | 'update_clause'
  | 'update_clause_rdl26'
  | 'update_clause_rdl29'
  | 'update_notice'
  | 'cap_ipc'
  | 'igc_clamp'
  | 'cap_igc_2022'
  | 'cap_igc_2022_extended'
  | 'cap_igc_2023'
  | 'cap_3_2024'
  | 'cap_irav'
  | 'cap_2_rdl8'
  | 'cap_2_rdl26'
  | 'cap_2_rdl29'
  | 'irav_all_contracts_rdl26'
  | 'irav_all_contracts'
  | 'charges_pact'
  | 'charges_increase'
  | 'charges_meters'
  | 'taxes_ban'
  | 'deposit_interest'
  | 'legal_interest_rate'
  | 'term_minimum'
  | 'term_tacit'
  | 'term_rdl28'
  | 'extension_rdl29'
  | 'stressed_zone'
  | 'deposit_lodging'
  | 'closing_document';

export type Rule = LawRule<RuleId, NormId>;

const LAU = 'https://www.boe.es/buscar/act.php?id=BOE-A-1994-26003';
const LAU_2019 = `${LAU}&tn=1&p=20190305`;
const LAU_2023 = `${LAU}&tn=1&p=20230525`;
const RDL6_2022 = 'https://www.boe.es/buscar/act.php?id=BOE-A-2022-4972';
const LAW12_2023 = 'https://www.boe.es/buscar/act.php?id=BOE-A-2023-12203';
const RDL8_2026 = 'https://www.boe.es/buscar/act.php?id=BOE-A-2026-6545';
const RDL26_2026 = 'https://www.boe.es/buscar/doc.php?id=BOE-A-2026-20266';
const RDL29_2026 = 'https://www.boe.es/buscar/doc.php?id=BOE-A-2026-20823';
const RDL28_2026 = 'https://www.boe.es/buscar/doc.php?id=BOE-A-2026-20822';

const rule = (
  id: RuleId,
  norm: NormId,
  article: string,
  url: string,
  from: string,
  until: string | null = null,
  supersededBy: RuleId | null = null,
): Rule => ({ id, norm, article, url, from, until, supersededBy });

export const RULES: Readonly<Record<RuleId, Rule>> = {
  // Contracts signed from 06-03-2019: agency fees fall on a landlord that is a company.
  fees_2019: rule(
    'fees_2019',
    'rdl7_2019',
    'LAU, art. 20.1, último párrafo',
    `${LAU_2019}#a20`,
    '2019-03-06',
    null,
    'fees_2023',
  ),
  fees_2023: rule(
    'fees_2023',
    'law12_2023',
    'LAU, art. 20.1, último párrafo',
    `${LAU_2023}#a20`,
    '2023-05-26',
    null,
    'fees_2026',
  ),
  fees_2026: rule(
    'fees_2026',
    'rdl29_2026',
    'art. 3.Doce, que reforma el art. 20 de la LAU',
    RDL29_2026,
    '2026-10-08',
  ),
  deposit_one_month: rule('deposit_one_month', 'lau', 'LAU, art. 36.1', `${LAU}#a36`, '1995-01-01'),
  guarantee_cap: rule('guarantee_cap', 'rdl7_2019', 'LAU, art. 36.5', `${LAU}#a36`, '2019-03-06'),
  insurance_ban: rule(
    'insurance_ban',
    'rdl29_2026',
    'art. 3.Diecisiete, que reforma el art. 36.5 de la LAU',
    RDL29_2026,
    '2026-10-08',
  ),
  advance_cap: rule('advance_cap', 'lau', 'LAU, art. 17.2', `${LAU}#a17`, '1995-01-01'),
  update_clause: rule(
    'update_clause',
    'rdl7_2019',
    'LAU, art. 18.1',
    `${LAU}#a18`,
    '2019-03-06',
    null,
    'update_clause_rdl29',
  ),
  // A clause naming no index follows the IRAV instead of the IGC, and the IRAV replaces the CPI
  // as the cap; RDL 26/2026 said the same on its one day in force.
  update_clause_rdl26: rule(
    'update_clause_rdl26',
    'rdl26_2026',
    'art. 3.Once, que reforma el art. 18.1 de la LAU',
    RDL26_2026,
    '2026-10-01',
  ),
  update_clause_rdl29: rule(
    'update_clause_rdl29',
    'rdl29_2026',
    'art. 3.Once, que reforma el art. 18.1 de la LAU',
    RDL29_2026,
    '2026-10-08',
  ),
  update_notice: rule('update_notice', 'lau', 'LAU, art. 18.2', `${LAU}#a18`, '1995-01-01'),
  cap_ipc: rule(
    'cap_ipc',
    'rdl7_2019',
    'LAU, art. 18.1, párrafo tercero',
    `${LAU_2019}#a18`,
    '2019-03-06',
    null,
    'irav_all_contracts',
  ),
  // The IGC rate a revision uses is never below 0 nor above 2 %.
  igc_clamp: rule(
    'igc_clamp',
    'law2_2015',
    'anexo',
    'https://www.boe.es/buscar/act.php?id=BOE-A-2015-3443#an',
    '2015-04-01',
  ),
  cap_igc_2022: rule(
    'cap_igc_2022',
    'rdl6_2022',
    'art. 46',
    `${RDL6_2022}&tn=1&p=20220330`,
    '2022-03-31',
    '2022-06-30',
  ),
  cap_igc_2022_extended: rule(
    'cap_igc_2022_extended',
    'rdl11_2022',
    'art. 1.13, que prorroga el art. 46 del RDL 6/2022',
    `${RDL6_2022}&tn=1&p=20220626`,
    '2022-07-01',
    '2022-12-31',
  ),
  cap_igc_2023: rule(
    'cap_igc_2023',
    'rdl20_2022',
    'art. 67, que prorroga el art. 46 del RDL 6/2022',
    `${RDL6_2022}&tn=1&p=20221228`,
    '2023-01-01',
    '2023-12-31',
  ),
  cap_3_2024: rule(
    'cap_3_2024',
    'law12_2023',
    'disposición final 6.ª, que reforma el art. 46 del RDL 6/2022',
    LAW12_2023,
    '2024-01-01',
    '2024-12-31',
  ),
  cap_irav: rule(
    'cap_irav',
    'ineIravResolution',
    'apartado tercero, en desarrollo de la disposición adicional 11.ª de la LAU',
    'https://www.boe.es/diario_boe/txt.php?id=BOE-A-2024-26685',
    '2025-01-01',
  ),
  cap_2_rdl8: rule('cap_2_rdl8', 'rdl8_2026', 'art. 2', RDL8_2026, '2026-03-22', '2027-12-31'),
  cap_2_rdl26: rule(
    'cap_2_rdl26',
    'rdl26_2026',
    'disposición final 6.ª',
    RDL26_2026,
    '2026-10-01',
    '2027-12-31',
  ),
  cap_2_rdl29: rule(
    'cap_2_rdl29',
    'rdl29_2026',
    'disposición final 6.ª',
    RDL29_2026,
    '2026-10-08',
    '2027-12-31',
  ),
  irav_all_contracts_rdl26: rule(
    'irav_all_contracts_rdl26',
    'rdl26_2026',
    'art. 4.Dos, que reforma la disposición transitoria 4.ª de la Ley 12/2023',
    RDL26_2026,
    '2026-10-01',
  ),
  irav_all_contracts: rule(
    'irav_all_contracts',
    'rdl29_2026',
    'art. 4.Dos, que reforma la disposición transitoria 4.ª de la Ley 12/2023',
    RDL29_2026,
    '2026-10-08',
  ),
  charges_pact: rule('charges_pact', 'lau', 'LAU, art. 20.1', `${LAU}#a20`, '1995-01-01'),
  charges_increase: rule(
    'charges_increase',
    'rdl7_2019',
    'LAU, art. 20.2',
    `${LAU}#a20`,
    '2019-03-06',
  ),
  charges_meters: rule('charges_meters', 'lau', 'LAU, art. 20.3', `${LAU}#a20`, '1995-01-01'),
  taxes_ban: rule(
    'taxes_ban',
    'rdl29_2026',
    'art. 3.Doce, que reforma el art. 20.1 de la LAU',
    RDL29_2026,
    '2026-10-08',
  ),
  deposit_interest: rule('deposit_interest', 'lau', 'LAU, art. 36.4', `${LAU}#a36`, '1995-01-01'),
  legal_interest_rate: rule(
    'legal_interest_rate',
    'pge2023',
    'disposición adicional 42.ª',
    'https://www.boe.es/buscar/act.php?id=BOE-A-2022-22128',
    '2023-01-01',
  ),
  term_minimum: rule('term_minimum', 'rdl7_2019', 'LAU, art. 9.1', `${LAU}#a9`, '2019-03-06'),
  // The 4 and 2 months' notice and the three yearly extensions come from RDL 7/2019, art. 1.5.
  term_tacit: rule(
    'term_tacit',
    'rdl7_2019',
    'LAU, art. 10.1',
    `${LAU_2019}#a10`,
    '2019-03-06',
    null,
    'term_rdl28',
  ),
  term_rdl28: rule(
    'term_rdl28',
    'rdl28_2026',
    'art. 10 de la LAU en su nueva redacción',
    RDL28_2026,
    '2026-11-15',
  ),
  extension_rdl29: rule(
    'extension_rdl29',
    'rdl29_2026',
    'disposición final 5.ª',
    RDL29_2026,
    '2026-10-08',
  ),
  stressed_zone: rule(
    'stressed_zone',
    'law12_2023',
    'LAU, art. 17.6 y 17.7',
    `${LAU}#a17`,
    '2023-05-26',
  ),
  deposit_lodging: rule(
    'deposit_lodging',
    'lau',
    'LAU, disposición adicional 3.ª',
    `${LAU}#datercera`,
    '1995-01-01',
  ),
  closing_document: rule(
    'closing_document',
    'rdl29_2026',
    'art. 3.Dieciocho, que añade el art. 36.7 a la LAU',
    RDL29_2026,
    '2026-10-08',
  ),
};

export type RentalSource = NormSource;

export function ruleSource(id: RuleId, norms: NormTable): RentalSource {
  return lawRuleSource(RULES, id, norms);
}

export type ActiveRule = LawActiveRule<RuleId, NormId>;

export function activeRules(date: CivilDate, norms: NormTable): readonly ActiveRule[] {
  return lawActiveRules(RULES, date, norms);
}
