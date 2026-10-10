import { round2 } from '../money';
import { assessAcross, type Across } from '../law/readings';
import type { NormSource } from '../law/sources';
import { billsPhrase, type BillsCalculation } from './calculation';
import type { BillsNormId, NormStatus, NormTable } from './norms';
import { officialValues, type OfficialFigure, type RowCitation } from './period';
import { ruleSource, type BillsRuleId } from './rules';

export type BillsItemId =
  | 'days'
  | 'power'
  | 'energy'
  | 'total'
  | 'tolls_and_charges_power'
  | 'tolls_and_charges_energy'
  | 'pvpc_eligibility'
  | 'pvpc_power_p1'
  | 'pvpc_power_p2'
  | 'social_bonus_funding'
  | 'meter'
  | 'social_bonus'
  | 'electricity_tax'
  | 'vat'
  | 'excess_power'
  | 'service'
  | 'exit_penalty'
  | 'power_used'
  | 'commitment_length'
  | 'commitment_penalty'
  | 'change_exit'
  | 'charge_after_exit';

// `does_not_add_up` is the bill against its own figures; `differs_from_official` and
// `above_regulated_price` against a table; `pending_official_data` a day no row covers;
// `information` a figure shown with no verdict.
export type BillsStatus =
  | 'matches'
  | 'does_not_add_up'
  | 'differs_from_official'
  | 'not_on_bill'
  | 'tariff_not_allowed'
  | 'above_regulated_price'
  | 'wrong_rate_for_date'
  | 'different_base'
  | 'discount_lower'
  | 'not_allowed_in_pvpc'
  | 'not_allowed'
  | 'paid_over'
  | 'above_legal_maximum'
  | 'within_limit'
  | 'charged_after_exit'
  | 'not_applicable'
  | 'review_it'
  | 'not_checkable'
  | 'pending_official_data'
  | 'information';

export interface BillFinding {
  readonly id: BillsItemId;
  // Position of the line among the bill's lines of its kind; null for an item of the whole bill.
  readonly line: number | null;
  readonly status: BillsStatus;
  // Euros of difference, always positive; null for a result that carries no figure.
  readonly amount: number | null;
  // Whether the bill charges more or less than the figure it is checked against.
  readonly direction: 'over' | 'under' | null;
  // The same difference comes back in every bill while nothing changes.
  readonly recurring: boolean;
  readonly calculation: BillsCalculation;
  readonly sources: readonly NormSource<NormStatus>[];
  // The table rows the official figure rests on, with their days and status.
  readonly rows: readonly RowCitation[];
  // Norms the official figure rests on that are not settled yet: nothing it gives is counted.
  readonly pendingOn: readonly BillsNormId[];
  // Norms not settled yet that choose between readings which each have their figure, as a tax
  // rate does: the lowest reading counts.
  readonly dependsOn: readonly BillsNormId[];
}

// While a norm a figure rests on is not settled, the lowest and the highest official value.
export type OfficialQuestion = 'official_value';
export type OfficialReading = 'lower_value' | 'higher_value';

// A subsidised handset kept after leaving over a change of conditions: whether its whole value is
// still owed, or only the share of the commitment left.
export type HandsetQuestion = 'handset_share';
export type HandsetReading = 'whole_value' | 'prorated_value';

export type BillItem = Across<
  OfficialQuestion | HandsetQuestion,
  OfficialReading | HandsetReading,
  BillFinding
>;

// No norm fixes how a bill rounds: a line within a cent and a total within two cents match.
export const LINE_TOLERANCE = 0.01;
export const TOTAL_TOLERANCE = 0.02;

const EPSILON = 1e-9;

export interface Comparison {
  readonly matches: boolean;
  // Billed less the nearest figure it is checked against, rounded to the cent.
  readonly difference: number;
}

// The billed amount against every figure that may hold (365 or 366 days a year), each rounded to
// the cent as a bill prints it: it matches if it matches any, otherwise its difference is to the
// nearest.
export function compare(
  billed: number,
  expected: readonly number[],
  tolerance: number,
): Comparison {
  const differences = expected.map((e) => billed - round2(e));
  const nearest = differences.reduce((a, b) => (Math.abs(b) < Math.abs(a) ? b : a));
  return {
    matches: Math.abs(nearest) <= tolerance + EPSILON,
    difference: round2(nearest),
  };
}

// A charge up to a legal cap, within a cent of it, is within the limit.
export function withinCap(charged: number, cap: number): boolean {
  const { matches, difference } = compare(charged, [cap], LINE_TOLERANCE);
  return matches || difference < 0;
}

export const directionOf = (difference: number): 'over' | 'under' =>
  difference > 0 ? 'over' : 'under';

interface FindingParts {
  readonly line?: number | null;
  readonly amount?: number | null;
  readonly direction?: 'over' | 'under' | null;
  readonly recurring?: boolean;
  readonly rows?: readonly RowCitation[];
  readonly dependsOn?: readonly BillsNormId[];
}

export const billFinding = (
  id: BillsItemId,
  status: BillsStatus,
  calculation: BillsCalculation,
  rules: readonly BillsRuleId[],
  norms: NormTable,
  parts: FindingParts = {},
): BillFinding => ({
  id,
  line: parts.line ?? null,
  status,
  amount: parts.amount ?? null,
  direction: parts.direction ?? null,
  recurring: parts.recurring ?? false,
  calculation,
  sources: [...new Set(rules)].map((rule) => ruleSource(rule, norms)),
  rows: parts.rows ?? [],
  pendingOn: [],
  dependsOn: parts.dependsOn ?? [],
});

// A day of the period no row covers: no figure, never the one before in its place.
export const pendingOfficial = (
  id: BillsItemId,
  day: string,
  rules: readonly BillsRuleId[],
  norms: NormTable,
): BillItem =>
  single(
    billFinding(
      id,
      'pending_official_data',
      [billsPhrase('official.missing', { day: { date: day } })],
      rules,
      norms,
    ),
  );

export const single = (finding: BillFinding): BillItem => ({ kind: 'single', finding });

export const findingsOf = (item: BillItem): readonly BillFinding[] =>
  item.kind === 'single' ? [item.finding] : item.readings.map((r) => r.finding);

const sameValues = (a: readonly number[], b: readonly number[]): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i]);

// One finding for each value the norms leave open, a single one when they agree, each with the
// rows its figure rests on.
export function acrossOfficial(
  official: OfficialFigure,
  assess: (expected: readonly number[]) => BillFinding,
): BillItem {
  const { low, high } = officialValues(official.byBase);
  const pending = official.deciding.length > 0;
  const withBasis = (f: BillFinding): BillFinding => ({
    ...f,
    calculation: pending ? [...f.calculation, billsPhrase('official.pending')] : f.calculation,
    rows: official.rows,
    pendingOn: official.deciding,
  });
  if (sameValues(low, high)) return single(withBasis(assess(low)));
  return assessAcross<OfficialQuestion, OfficialReading, BillFinding>(
    'official_value',
    ['lower_value', 'higher_value'],
    (reading) => withBasis(assess(reading === 'lower_value' ? low : high)),
  );
}

// The statuses whose euros reach what the person pays over.
export const COUNTED: ReadonlySet<BillsStatus> = new Set([
  'above_regulated_price',
  'wrong_rate_for_date',
  'different_base',
  'discount_lower',
  'not_allowed_in_pvpc',
  'not_allowed',
  'paid_over',
  'charged_after_exit',
]);

// What an item counts: only what holds in every reading, so the lowest; nothing charged under, and
// nothing that is shown without a figure the norms back.
export function countedAmount(item: BillItem): number {
  const amounts = findingsOf(item).map((f) =>
    COUNTED.has(f.status) && f.direction === 'over' && f.pendingOn.length === 0
      ? (f.amount ?? 0)
      : 0,
  );
  return round2(Math.min(...amounts));
}

export interface BillTotals {
  // What the person pays over in every reading: the lowest.
  readonly counted: number;
  // The most any reading gives, for «y hasta … si …».
  readonly upTo: number;
  // Charged short, in every reading: shown as plainly and never set against what is paid over.
  readonly under: number;
}

// The total repeats its lines, and tolls and charges are a breakdown within the power and energy
// terms: neither is money charged short of its own.
const NOT_UNDER: ReadonlySet<BillsItemId> = new Set([
  'total',
  'tolls_and_charges_power',
  'tolls_and_charges_energy',
]);

const overAmount = (f: BillFinding): number =>
  COUNTED.has(f.status) && f.direction === 'over' && f.pendingOn.length === 0 ? (f.amount ?? 0) : 0;

const underAmount = (f: BillFinding): number =>
  f.direction === 'under' && !NOT_UNDER.has(f.id) && f.pendingOn.length === 0 ? (f.amount ?? 0) : 0;

export function totalsOf(items: readonly BillItem[]): BillTotals {
  let counted = 0;
  let upTo = 0;
  let under = 0;
  for (const item of items) {
    const findings = findingsOf(item);
    counted += countedAmount(item);
    upTo += Math.max(...findings.map(overAmount));
    under += Math.min(...findings.map(underAmount));
  }
  return { counted: round2(counted), upTo: round2(upTo), under: round2(under) };
}
