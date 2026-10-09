import type { ElectricityTaxRate, Table, TableRow } from '../tables';
import type { BillsNormId } from '../norms';
import { BILLS_NORMS } from './norms';

// Read on the day the bill falls due (art. 95), never on the days of consumption. The rate
// applies to the base of art. 97 with a floor of 1 € per MWh (art. 99). Each year closes on
// 31 December: the next one is loaded when its rates are known.
const RATE = `${BILLS_NORMS.law38_1992.url}#a99`;
const GENERAL: ElectricityTaxRate = { percent: 5.11269632, minimumPerMwh: 1 };
const REDUCED: ElectricityTaxRate = { percent: 0.5, minimumPerMwh: 1 };

const general = (from: string, until: string): TableRow<ElectricityTaxRate> => ({
  from,
  until,
  value: GENERAL,
  norm: 'law38_1992',
  url: RATE,
});

// A month whose reduction turns on a CPI figure: the reduced rate where the month's condition is
// met and its decree stands, the general rate otherwise.
const conditionalMonth = (
  from: string,
  until: string,
  month: BillsNormId,
  decree: BillsNormId,
  url: string,
): readonly TableRow<ElectricityTaxRate>[] => [
  { from, until, value: REDUCED, norm: month, alsoRestsOn: [decree], url },
  { ...general(from, until), unless: [month, decree] },
];

const RDL7 = BILLS_NORMS.rdl7_2026.url;
const RDL18 = BILLS_NORMS.rdl18_2026.url;
const RDL25 = BILLS_NORMS.rdl25_2026.url;

export const ELECTRICITY_TAX: Table<ElectricityTaxRate> = [
  general('2026-01-01', '2026-03-21'),
  // Art. 40.Uno RDL 7/2026.
  {
    from: '2026-03-22',
    until: '2026-05-31',
    value: REDUCED,
    norm: 'rdl7_2026',
    url: `${RDL7}#a4-2`,
  },
  ...conditionalMonth('2026-06-01', '2026-06-30', 'rdl7_2026_june', 'rdl7_2026', `${RDL7}#a4-2`),
  general('2026-07-01', '2026-07-31'),
  // Arts. 12 and 13 RDL 18/2026.
  ...conditionalMonth(
    '2026-08-01',
    '2026-08-31',
    'rdl18_2026_august',
    'rdl18_2026',
    `${RDL18}#a1-4`,
  ),
  ...conditionalMonth(
    '2026-09-01',
    '2026-09-30',
    'rdl18_2026_september',
    'rdl18_2026',
    `${RDL18}#a1-5`,
  ),
  general('2026-10-01', '2026-10-31'),
  // Arts. 20 and 21 RDL 25/2026.
  ...conditionalMonth(
    '2026-11-01',
    '2026-11-30',
    'rdl25_2026_november',
    'rdl25_2026',
    `${RDL25}#a2-2`,
  ),
  ...conditionalMonth(
    '2026-12-01',
    '2026-12-31',
    'rdl25_2026_december',
    'rdl25_2026',
    `${RDL25}#a2-3`,
  ),
];
