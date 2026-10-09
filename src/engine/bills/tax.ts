import { assessAcross } from '../law/readings';
import { billsPhrase, type BillsCalculation, type BillsPhraseKey } from './calculation';
import { differenceNote, sum } from './electricity-arithmetic';
import {
  billFinding,
  compare,
  directionOf,
  LINE_TOLERANCE,
  single,
  type BillFinding,
  type BillItem,
  type OfficialQuestion,
  type OfficialReading,
} from './finding';
import type { BillsNormId, NormTable } from './norms';
import type { RowCitation } from './period';
import type { BillsRuleId } from './rules';
import type { ElectricityBillInput } from './types';

export const powerAndEnergy = (input: ElectricityBillInput): number =>
  sum(input.power.map((l) => l.amount)) + sum(input.energy.map((l) => l.amount));

export const kwhBilled = (input: ElectricityBillInput): number =>
  sum(input.energy.map((l) => l.kwh));

export const discountsOf = (input: ElectricityBillInput): number => sum(input.discounts);

// Every sum a tax may come to: `certain`, plus one of the options of each part whose place in the
// base no norm read settles. The first option of each part comes first, so the first sum is the
// one shown.
export function possibleSums(
  certain: number,
  parts: readonly (readonly number[])[],
): readonly number[] {
  let sums = [certain];
  for (const options of parts) sums = sums.flatMap((s) => options.map((o) => s + o));
  return [...new Set(sums.map((s) => Math.round(s * 1e9) / 1e9))];
}

// One rate that may apply on the day the bill falls due, and what the tax comes to at it.
export interface TaxReading {
  readonly percent: number;
  // For every base the bill may use.
  readonly expected: readonly number[];
  // What it comes to if the only difference is a treatment no primary source read settles: sent to
  // review with no figure, never a difference.
  readonly unsettled: readonly number[];
  readonly unsettledPhrase: BillsPhraseKey;
  // What it would come to at every other rate the table holds.
  readonly atOtherRates: readonly number[];
  readonly calculation: BillsCalculation;
}

export interface TaxLine {
  readonly id: 'electricity_tax' | 'vat';
  readonly billed: number;
  // The rate the bill prints; null when it does not.
  readonly printedPercent: number | null;
  readonly rules: readonly BillsRuleId[];
  readonly rows: readonly RowCitation[];
  readonly dependsOn: readonly BillsNormId[];
}

// A bill may print a rate rounded to two decimals, as 5,11 % for 5,11269632 %.
const PRINTED_RATE_TOLERANCE = 0.005;

function assess(line: TaxLine, reading: TaxReading, norms: NormTable): BillFinding {
  const parts = { rows: line.rows, dependsOn: line.dependsOn };
  const calculation = [
    ...reading.calculation,
    billsPhrase('arithmetic.billed', { euros: { euros: line.billed } }),
    billsPhrase('tolerance.line'),
    ...(line.dependsOn.length > 0 ? [billsPhrase('tax.rate_depends')] : []),
  ];
  const { matches, difference } = compare(line.billed, reading.expected, LINE_TOLERANCE);
  if (matches) return billFinding(line.id, 'matches', calculation, line.rules, norms, parts);
  if (
    reading.unsettled.length > 0 &&
    compare(line.billed, reading.unsettled, LINE_TOLERANCE).matches
  )
    return billFinding(
      line.id,
      'review_it',
      [...calculation, billsPhrase(reading.unsettledPhrase)],
      line.rules,
      norms,
      parts,
    );
  const otherRate =
    line.printedPercent === null
      ? reading.atOtherRates.length > 0 &&
        compare(line.billed, reading.atOtherRates, LINE_TOLERANCE).matches
      : Math.abs(line.printedPercent - reading.percent) > PRINTED_RATE_TOLERANCE;
  // A difference never rests on a treatment no primary source settles: it is to the nearest
  // figure, the unsettled ones included.
  const nearest =
    reading.unsettled.length > 0
      ? compare(line.billed, [...reading.expected, ...reading.unsettled], LINE_TOLERANCE).difference
      : difference;
  const why = otherRate
    ? billsPhrase(
        'tax.wrong_rate',
        line.printedPercent === null ? undefined : { percent: { percent: line.printedPercent } },
      )
    : billsPhrase('tax.different_base');
  return billFinding(
    line.id,
    otherRate ? 'wrong_rate_for_date' : 'different_base',
    [...calculation, why, ...differenceNote(nearest)],
    [...line.rules, 'billing'],
    norms,
    { ...parts, amount: Math.abs(nearest), direction: directionOf(nearest) },
  );
}

// The lowest and the highest rate that may apply, each its own reading; one when they agree. Each
// reading has its figure, so the lowest counts.
export function acrossRates(
  line: TaxLine,
  low: TaxReading,
  high: TaxReading,
  norms: NormTable,
): BillItem {
  if (low.percent === high.percent) return single(assess(line, low, norms));
  return assessAcross<OfficialQuestion, OfficialReading, BillFinding>(
    'official_value',
    ['lower_value', 'higher_value'],
    (reading) => assess(line, reading === 'lower_value' ? low : high, norms),
  );
}

// The rates a table holds over all its days, to tell a bill charged at another day's rate.
export const distinct = (values: readonly number[]): readonly number[] => [...new Set(values)];
