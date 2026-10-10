import { isReadable, type ExtractedRow, type Reading } from './extraction';
import type { TelecomMerged } from './telecom-merge';

// Whether what the bills and the contract state hangs together; never whether a penalty or a
// charge is one the law allows, which is the site's engine's to say.
export type TelecomCheck = 'period_end_before_start' | 'lines_above_total';

const cents = (n: number): number => Math.round(n * 100);
const TOLERANCE_CENTS = 100;

const num = (row: ExtractedRow, name: string): number | null => {
  const v = row.values[name];
  return typeof v === 'number' ? v : null;
};

// ISO dates compare correctly as strings.
const endsBeforeStart = (row: ExtractedRow, from: string, to: string): boolean => {
  const [start, end] = [row.values[from], row.values[to]];
  return typeof start === 'string' && typeof end === 'string' && end < start;
};

// A bill's charges, less its discounts, can't come to more than its total, which adds VAT to them.
function linesAboveTotal(bill: ExtractedRow, lines: readonly ExtractedRow[]): boolean {
  const total = num(bill, 'total');
  const own = lines.filter((l) => l.values['document'] === bill.values['document']);
  if (total === null || own.length === 0) return false;
  const charged = own.reduce((sum, l) => {
    const amount = cents(num(l, 'amount') ?? 0);
    return sum + (l.values['kind'] === 'discount' ? -amount : amount);
  }, 0);
  return charged - cents(total) > TOLERANCE_CENTS;
}

export function telecomFailedChecks(r: Reading): readonly TelecomCheck[] {
  const failed = new Set<TelecomCheck>();
  const bills = r.sections.telecom_bill?.lists['bills'] ?? [];
  const lines = r.sections.telecom_bill?.lists['lines'] ?? [];
  if (
    bills.some((b) => endsBeforeStart(b, 'periodFrom', 'periodTo')) ||
    lines.some((l) => endsBeforeStart(l, 'from', 'to'))
  )
    failed.add('period_end_before_start');
  if (bills.some((b) => linesAboveTotal(b, lines))) failed.add('lines_above_total');
  return [...failed];
}

// A legible contract with neither its commitment nor its penalty, or a legible bill that yields
// no bill, is worth a second look.
export function telecomIncomplete(reading: Reading, extraction: TelecomMerged): boolean {
  const read = (kind: string) => reading.pages.some((p) => p.kind === kind && isReadable(p));
  const { commitmentMonths, agreedPenalty, priceReviewIndex } = extraction.fields;
  const contract =
    read('telecom_contract') &&
    commitmentMonths === undefined &&
    agreedPenalty === undefined &&
    priceReviewIndex === undefined;
  const bill = read('telecom_bill') && (extraction.lists.bills ?? []).length === 0;
  return contract || bill;
}
