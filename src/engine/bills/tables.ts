import type { HolidayCalendar } from '../law/calendar';
import { normStanding, type BillsNormId, type NormStanding, type NormTable } from './norms';

export type { HolidayCalendar, HolidayYear } from '../law/calendar';

// What the sources leave open about a row: an amount resting on it is never shown as certain.
export type RowDoubt =
  // The fixed PVPC retail margin of Orden ETU/1948/2016, not confirmed by any 2026 norm.
  'ccf_not_updated_since_2016';

// One value of a table over the days it covers. A table holds no value for a day no row covers:
// the engine never reaches for the one before.
export interface TableRow<V> {
  readonly from: string;
  // Last day it covers; null while no end is known.
  readonly until: string | null;
  readonly value: V;
  readonly norm: BillsNormId;
  // Other norms the row needs as well: a conditional measure stands only while the decree that
  // holds it does.
  readonly alsoRestsOn?: readonly BillsNormId[];
  // The norm reaches back to `from`, before it came into force: its status is read from the day it
  // came into force.
  readonly appliesBack?: true;
  // The article or provision, as a link under the norm's own.
  readonly url: string;
  // The row gives way wherever all these norms apply: the general rate a conditional reduction
  // replaces.
  readonly unless?: readonly BillsNormId[];
  readonly doubt?: RowDoubt;
}

export type Table<V> = readonly TableRow<V>[];

export type Lookup<V> =
  | { readonly kind: 'ok'; readonly row: TableRow<V> }
  // The value depends on a norm not yet settled that day; every row that may hold, and the norms
  // that decide between them.
  | {
      readonly kind: 'conditional';
      readonly rows: readonly TableRow<V>[];
      readonly norms: readonly BillsNormId[];
    }
  // No row covers the day: the figure is not loaded, or not yet published.
  | { readonly kind: 'missing' };

type Hold = 'holds' | 'open' | 'never';

const fromStanding = (s: NormStanding): Hold =>
  s === 'in_force' ? 'holds' : s === 'not_in_force' ? 'never' : 'open';

// All of `ids` together: never if one never applies, holds if all do, open otherwise.
function allOf(ids: readonly BillsNormId[], day: string, norms: NormTable): Hold {
  const holds = ids.map((id) => {
    const norm = norms[id];
    return fromStanding(normStanding(norm, day));
  });
  if (holds.includes('never')) return 'never';
  return holds.every((h) => h === 'holds') ? 'holds' : 'open';
}

const restsOn = (row: TableRow<unknown>): readonly BillsNormId[] => [
  row.norm,
  ...(row.alsoRestsOn ?? []),
];

// The value of `table` on `day` (ISO), following the status of the norms each row rests on.
export function valueOn<V>(table: Table<V>, day: string, norms: NormTable): Lookup<V> {
  const firm: TableRow<V>[] = [];
  const open: TableRow<V>[] = [];
  const deciding = new Set<BillsNormId>();
  for (const row of table) {
    if (day < row.from || (row.until !== null && day > row.until)) continue;
    const since = norms[row.norm].inForceSince;
    const own = allOf(restsOn(row), row.appliesBack === true && day < since ? since : day, norms);
    const displaced = row.unless === undefined ? 'never' : allOf(row.unless, day, norms);
    if (own === 'never' || displaced === 'holds') continue;
    if (own === 'holds' && displaced === 'never') {
      firm.push(row);
      continue;
    }
    open.push(row);
    const doubtful = [...(own === 'open' ? restsOn(row) : []), ...(row.unless ?? [])];
    for (const id of doubtful)
      if (fromStanding(normStanding(norms[id], day)) === 'open') deciding.add(id);
  }
  if (firm.length + open.length === 0) return { kind: 'missing' };
  if (open.length > 0)
    return { kind: 'conditional', rows: [...firm, ...open], norms: [...deciding] };
  const [row, ...more] = firm;
  if (row === undefined || more.length > 0)
    throw new RangeError(`${firm.length} rows cover ${day} in the same table`);
  return { kind: 'ok', row };
}

// €/kW and year for the two power periods of the 2.0TD tariff, €/kWh for its three energy periods.
export interface PowerEnergyPrices {
  readonly power: { readonly p1: number; readonly p2: number };
  readonly energy: { readonly p1: number; readonly p2: number; readonly p3: number };
}

// Rate of the electricity tax, in percent of its base, and its floor in € per MWh consumed.
export interface ElectricityTaxRate {
  readonly percent: number;
  readonly minimumPerMwh: number;
}

export type VatRate =
  | { readonly kind: 'general'; readonly percent: number }
  // A reduced rate for supplies whose contracted power stays under a threshold, which each decree
  // words its own way («inferior a» or «inferior o igual a»); the rest pay `generalPercent`.
  | {
      readonly kind: 'reduced';
      readonly percent: number;
      readonly generalPercent: number;
      readonly powerLimitKw: number;
      readonly powerLimitIncluded: boolean;
      // Whether severely vulnerable consumers on the social bonus pay it whatever their power;
      // null when the sources do not say.
      readonly severeVulnerable: boolean | null;
    };

// Regulated monthly rent of a meter, in €.
export interface MeterRent {
  readonly singlePhase: number;
  readonly threePhase: number;
}

// Discount of the social bonus on the PVPC, in percent.
export interface SocialBonusDiscount {
  readonly vulnerable: number;
  readonly severe: number;
}

// Every table a review reads, as loaded in the repo; a composition root passes it in.
export interface BillsTables {
  // Transmission and distribution tolls of the 2.0TD tariff.
  readonly tolls: Table<PowerEnergyPrices>;
  // Charges of the electricity system, consumer segment 1.
  readonly charges: Table<PowerEnergyPrices>;
  // Fixed PVPC retail margin, €/kW and year on P1 only.
  readonly pvpcMargin: Table<number>;
  // Funding of the social bonus, € per supply and year.
  readonly socialBonusFunding: Table<number>;
  // By the day the bill falls due.
  readonly electricityTax: Table<ElectricityTaxRate>;
  readonly vat: Table<VatRate>;
  readonly meter: Table<MeterRent>;
  readonly socialBonusDiscount: Table<SocialBonusDiscount>;
  // kWh a year with the discount, in the order of annex I of Real Decreto 897/2017; which
  // household each one belongs to is set by the rule that reads them.
  readonly socialBonusCaps: Table<readonly number[]>;
  readonly holidays: HolidayCalendar;
}

// The tables a month of bills needs, with the names the maintenance lists use.
export type TableName = Exclude<keyof BillsTables, 'holidays'>;

export const TABLE_NAMES: readonly TableName[] = [
  'tolls',
  'charges',
  'pvpcMargin',
  'socialBonusFunding',
  'electricityTax',
  'vat',
  'meter',
  'socialBonusDiscount',
  'socialBonusCaps',
];
