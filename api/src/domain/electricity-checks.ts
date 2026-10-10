import type { ElectricityMerged } from './electricity-merge';
import { isReadable, type ExtractedRow, type Reading } from './extraction';

// Whether what the bills state hangs together; never whether a price, a tax or a charge is the
// one the law sets, which is the site's engine's to say.
export type ElectricityCheck =
  | 'period_end_before_start'
  | 'days_mismatch'
  | 'lines_do_not_sum'
  | 'vat_base_mismatch'
  | 'duplicate_bill';

// About what the person sent, not about how it was read: a second read finds it all the same, so
// it never makes a read doubtful.
export const PACK_CHECKS: ReadonlySet<string> = new Set<ElectricityCheck>(['duplicate_bill']);

const cents = (n: number): number => Math.round(n * 100);
const TOLERANCE_CENTS = 100;
const DAY_MS = 86_400_000;

const num = (row: ExtractedRow, name: string): number | null => {
  const v = row.values[name];
  return typeof v === 'number' ? v : null;
};

const str = (row: ExtractedRow, name: string): string | null => {
  const v = row.values[name];
  return typeof v === 'string' ? v : null;
};

// Days from the first reading, which is not billed, to the last, which is.
const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

const ofBill = (rows: readonly ExtractedRow[], document: unknown): readonly ExtractedRow[] =>
  rows.filter((r) => r.values['document'] === document);

const sum = (rows: readonly ExtractedRow[]): number =>
  rows.reduce((total, r) => total + cents(num(r, 'amount') ?? 0), 0);

const SUBTRACTED = new Set(['discount', 'regularization_refund']);

// A bill's power and energy lines, the social bonus funding and its discount, the excess power,
// the electricity tax, the meter and every other line make up its VAT base. A bill with a penalty
// for leaving is left alone: whether the penalty bears VAT is no fact the bill has to print.
function linesDoNotSum(
  bill: ExtractedRow,
  power: readonly ExtractedRow[],
  energy: readonly ExtractedRow[],
  other: readonly ExtractedRow[],
): boolean {
  const base = num(bill, 'vatBase');
  if (base === null || power.length === 0 || energy.length === 0) return false;
  if (num(bill, 'exitPenaltyAmount') !== null) return false;
  const added = ['socialBonusFunding', 'excessPowerAmount', 'electricityTaxAmount', 'meterAmount'];
  const others = other.reduce((total, r) => {
    const amount = cents(num(r, 'amount') ?? 0);
    return total + (SUBTRACTED.has(String(r.values['kind'])) ? -amount : amount);
  }, 0);
  const lines =
    sum(power) +
    sum(energy) +
    added.reduce((total, name) => total + cents(num(bill, name) ?? 0), 0) -
    cents(num(bill, 'socialBonusAmount') ?? 0) +
    others;
  return Math.abs(lines - cents(base)) > TOLERANCE_CENTS;
}

// The total can hold amounts outside VAT, never less than the base and its VAT.
function vatBaseMismatch(bill: ExtractedRow): boolean {
  const [base, vat, total] = [num(bill, 'vatBase'), num(bill, 'vatAmount'), num(bill, 'total')];
  if (base === null || vat === null || total === null) return false;
  return cents(base) + cents(vat) - cents(total) > TOLERANCE_CENTS;
}

export function electricityFailedChecks(r: Reading): readonly ElectricityCheck[] {
  const failed = new Set<ElectricityCheck>();
  const section = r.sections.electricity_bill;
  const bills = section?.lists['bills'] ?? [];
  const [power, energy, other] = ['powerLines', 'energyLines', 'otherLines'].map(
    (name) => section?.lists[name] ?? [],
  ) as [readonly ExtractedRow[], readonly ExtractedRow[], readonly ExtractedRow[]];
  const seen = new Set<string>();
  for (const bill of bills) {
    const [from, to] = [str(bill, 'readingFrom'), str(bill, 'readingTo')];
    // ISO dates compare correctly as strings.
    if (from !== null && to !== null && to <= from) failed.add('period_end_before_start');
    const days = num(bill, 'billedDays');
    if (from !== null && to !== null && days !== null && daysBetween(from, to) !== days)
      failed.add('days_mismatch');
    const document = bill.values['document'];
    if (
      linesDoNotSum(
        bill,
        ofBill(power, document),
        ofBill(energy, document),
        ofBill(other, document),
      )
    )
      failed.add('lines_do_not_sum');
    if (vatBaseMismatch(bill)) failed.add('vat_base_mismatch');
    // The same supply and period twice is one bill read twice, or a copy.
    const supply = str(bill, 'supplyFingerprint');
    if (supply !== null && from !== null && to !== null) {
      const key = `${supply}|${from}|${to}`;
      if (seen.has(key)) failed.add('duplicate_bill');
      seen.add(key);
    }
  }
  return [...failed];
}

// A legible bill that yields no bill with its total, or a legible contract that yields neither its
// price type nor any agreed price, is worth a second look.
export function electricityIncomplete(reading: Reading, extraction: ElectricityMerged): boolean {
  const read = (kind: string) => reading.pages.some((p) => p.kind === kind && isReadable(p));
  const totals = (extraction.lists.bills ?? []).some((b) => typeof b.values['total'] === 'number');
  const bill = read('electricity_bill') && !totals;
  const contract =
    read('electricity_contract') &&
    extraction.fields.priceType === undefined &&
    (extraction.lists.agreedPrices ?? []).length === 0;
  return bill || contract;
}
