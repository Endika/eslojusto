import type { BillsNormId } from '../norms';
import type { Table, TableRow, VatRate } from '../tables';
import { BILLS_NORMS } from './norms';

// Read on the day the bill falls due (art. 75). Each year closes on 31 December: the next one is
// loaded when its rates are known.
const GENERAL_URL = `${BILLS_NORMS.law37_1992.url}#a90`;
const GENERAL: VatRate = { kind: 'general', percent: 21 };
// Every reduction also reaches holders of the social bonus as severely vulnerable, or severely
// vulnerable at risk of social exclusion, whatever their power.
const REDUCED_UNDER_10: VatRate = {
  kind: 'reduced',
  percent: 10,
  generalPercent: 21,
  powerLimitKw: 10,
  powerLimitIncluded: false,
  severeVulnerable: true,
};
// «Inferior o igual a 10 kW»: art. 42.a RDL 7/2026 as rewritten by RDL 10/2026 from 30-04-2026,
// arts. 10 and 11 RDL 18/2026 and arts. 18.1 and 19.1 RDL 25/2026.
const REDUCED_UP_TO_10: VatRate = { ...REDUCED_UNDER_10, powerLimitIncluded: true };

const general = (from: string, until: string): TableRow<VatRate> => ({
  from,
  until,
  value: GENERAL,
  norm: 'law37_1992',
  url: GENERAL_URL,
});

// A month whose reduction turns on a CPI figure: the reduced rate where the month's condition is
// met and the norms holding it stand, the general rate otherwise.
const conditionalMonth = (
  from: string,
  until: string,
  month: BillsNormId,
  decrees: readonly BillsNormId[],
  url: string,
): readonly TableRow<VatRate>[] => [
  { from, until, value: REDUCED_UP_TO_10, norm: month, alsoRestsOn: decrees, url },
  { ...general(from, until), unless: [month, ...decrees] },
];

const RDL7 = BILLS_NORMS.rdl7_2026.url;
const RDL18 = BILLS_NORMS.rdl18_2026.url;
const RDL25 = BILLS_NORMS.rdl25_2026.url;

export const VAT: Table<VatRate> = [
  general('2026-01-01', '2026-03-21'),
  // Art. 42.a RDL 7/2026: «inferior a» 10 kW.
  {
    from: '2026-03-22',
    until: '2026-04-29',
    value: REDUCED_UNDER_10,
    norm: 'rdl7_2026',
    url: `${RDL7}#a4-4`,
  },
  {
    from: '2026-04-30',
    until: '2026-05-31',
    value: REDUCED_UP_TO_10,
    norm: 'rdl7_2026',
    alsoRestsOn: ['rdl10_2026'],
    url: `${RDL7}#a4-4`,
  },
  ...conditionalMonth(
    '2026-06-01',
    '2026-06-30',
    'rdl7_2026_june',
    ['rdl7_2026', 'rdl10_2026'],
    `${RDL7}#a4-4`,
  ),
  general('2026-07-01', '2026-07-31'),
  ...conditionalMonth(
    '2026-08-01',
    '2026-08-31',
    'rdl18_2026_august',
    ['rdl18_2026'],
    `${RDL18}#a1-2`,
  ),
  ...conditionalMonth(
    '2026-09-01',
    '2026-09-30',
    'rdl18_2026_september',
    ['rdl18_2026'],
    `${RDL18}#a1-3`,
  ),
  general('2026-10-01', '2026-10-31'),
  ...conditionalMonth(
    '2026-11-01',
    '2026-11-30',
    'rdl25_2026_november',
    ['rdl25_2026'],
    `${RDL25}#a1-10`,
  ),
  ...conditionalMonth(
    '2026-12-01',
    '2026-12-31',
    'rdl25_2026_december',
    ['rdl25_2026'],
    `${RDL25}#a1-11`,
  ),
];
