import { isReadable, type ExtractedRow, type Reading, type Section } from './extraction';
import type { RentalMerged } from './rental-merge';

// Whether what the documents state hangs together; never whether anything was charged lawfully,
// which is the site's engine's to say.
export type RentalCheck =
  | 'return_before_keys'
  | 'receipt_parts_do_not_sum'
  | 'invoice_total_mismatch'
  | 'notice_rent_mismatch'
  | 'start_long_before_signing';

const cents = (n: number): number => Math.round(n * 100);
const RECEIPT_TOLERANCE_CENTS = 100;
const INVOICE_TOLERANCE_CENTS = 5;
const NOTICE_TOLERANCE_CENTS = 100;
// A lease can start before it is put in writing, but not by more than a month.
export const START_BEFORE_SIGNING_DAYS = 31;

const RECEIPT_PARTS = ['rent', 'community', 'propertyTax', 'waste', 'utilities', 'other'];

const num = (row: ExtractedRow, name: string): number | null => {
  const v = row.values[name];
  return typeof v === 'number' ? v : null;
};

function str(s: Section | undefined, name: string): string | null {
  const v = s?.fields[name]?.value;
  return typeof v === 'string' ? v : null;
}

const rows = (s: Section | undefined, list: string): readonly ExtractedRow[] =>
  s?.lists[list] ?? [];

const days = (iso: string): number => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;

function receiptPartsDoNotSum(row: ExtractedRow): boolean {
  const total = num(row, 'total');
  const parts = RECEIPT_PARTS.map((p) => num(row, p)).filter((v) => v !== null);
  if (total === null || parts.length === 0) return false;
  const sum = parts.reduce((s, v) => s + cents(v), 0);
  return Math.abs(sum - cents(total)) > RECEIPT_TOLERANCE_CENTS;
}

function invoiceTotalMismatch(row: ExtractedRow): boolean {
  const [base, vat, total] = [num(row, 'base'), num(row, 'vat'), num(row, 'total')];
  if (base === null || vat === null || total === null) return false;
  return Math.abs(cents(base) + cents(vat) - cents(total)) > INVOICE_TOLERANCE_CENTS;
}

function noticeRentMismatch(row: ExtractedRow): boolean {
  const [previous, percent, next] = [
    num(row, 'previousRent'),
    num(row, 'percent'),
    num(row, 'newRent'),
  ];
  if (previous === null || percent === null || next === null) return false;
  const expected = previous * (1 + percent / 100);
  return Math.abs(cents(expected) - cents(next)) > NOTICE_TOLERANCE_CENTS;
}

export function rentalFailedChecks(r: Reading): readonly RentalCheck[] {
  const failed: RentalCheck[] = [];
  const { lease, deposit_return: deposit } = r.sections;
  // ISO dates compare correctly as strings.
  const keys = str(deposit, 'keysReturnedOn');
  if (
    keys !== null &&
    rows(deposit, 'returns').some(
      (row) => typeof row.values['on'] === 'string' && row.values['on'] < keys,
    )
  )
    failed.push('return_before_keys');
  if (rows(r.sections.rent_receipt, 'receipts').some(receiptPartsDoNotSum))
    failed.push('receipt_parts_do_not_sum');
  if (rows(r.sections.agency_invoice, 'invoices').some(invoiceTotalMismatch))
    failed.push('invoice_total_mismatch');
  if (rows(r.sections.rent_update_notice, 'notices').some(noticeRentMismatch))
    failed.push('notice_rent_mismatch');
  const [signed, start] = [str(lease, 'signedOn'), str(lease, 'startDate')];
  if (signed !== null && start !== null && days(signed) - days(start) > START_BEFORE_SIGNING_DAYS)
    failed.push('start_long_before_signing');
  return failed;
}

// A legible lease that yields neither its rent nor its date is worth a second look.
export function rentalIncomplete(reading: Reading, extraction: RentalMerged): boolean {
  const leaseRead = reading.pages.some((p) => p.kind === 'lease' && isReadable(p));
  return (
    leaseRead &&
    extraction.fields.initialRent === undefined &&
    extraction.fields.signedOn === undefined
  );
}
