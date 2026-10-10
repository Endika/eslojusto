import { isReadable, type ExtractedRow, type Reading } from './extraction';
import type { MortgageMerged } from './mortgage-merge';

// Whether what the documents state hangs together, and whether the deed's pages the review hangs
// on are there; never who should pay a cost or whether a clause or a fee is lawful, which is the
// site's engine's to say.
export type MortgageCheck =
  | 'invoice_parts_do_not_sum'
  | 'invoice_mixes_purchase_and_loan'
  | 'duplicate_supplied_amount'
  | 'ajd_purchase_not_loan'
  // A legible deed from before 16-06-2019, or of no known date, without its expenses clause: the
  // pages that carry it were likely not sent. From that day the law says who pays the costs
  // (art. 14.1.e Ley 5/2019), so a later deed needs no such clause.
  | 'missing_key_page';

const cents = (n: number): number => Math.round(n * 100);
// Invoices print exact amounts: anything past rounding is a misread.
const TOLERANCE_CENTS = 5;

const num = (row: ExtractedRow, name: string): number | null => {
  const v = row.values[name];
  return typeof v === 'number' ? v : null;
};

const rows = (r: Reading, kind: keyof Reading['sections'], list: string): readonly ExtractedRow[] =>
  r.sections[kind]?.lists[list] ?? [];

const near = (a: number, b: number): boolean => Math.abs(cents(a) - cents(b)) <= TOLERANCE_CENTS;

// The day Ley 5/2019 came into force, from which the law, not the deed, shares out the costs.
const LCCI_IN_FORCE = '2019-06-16';

// An invoice's base, VAT and outlays against its total; `extra` adds outlays listed apart.
function partsDoNotSum(row: ExtractedRow, baseName: string, extra = 0): boolean {
  const [total, base] = [num(row, 'total'), num(row, baseName)];
  if (total === null || base === null) return false;
  const parts =
    cents(base) + cents(num(row, 'vat') ?? 0) + cents(num(row, 'supplied') ?? 0) + cents(extra);
  return Math.abs(parts - cents(total)) > TOLERANCE_CENTS;
}

function anyInvoiceDoesNotSum(r: Reading): boolean {
  const notary = rows(r, 'notary_invoice', 'notaryInvoices');
  const registry = rows(r, 'registry_invoice', 'registryInvoices');
  const valuation = rows(r, 'valuation_invoice', 'valuationInvoices');
  if ([...notary, ...registry, ...valuation].some((row) => partsDoNotSum(row, 'base'))) return true;
  // The outlays are listed apart from the agency's invoices: they add up only against one.
  const agency = rows(r, 'agency_invoice_mortgage', 'agencyInvoices');
  const [only] = agency;
  if (agency.length !== 1 || only === undefined) return false;
  const supplied = rows(r, 'agency_invoice_mortgage', 'agencySupplied').reduce(
    (sum, row) => sum + (num(row, 'amount') ?? 0),
    0,
  );
  return partsDoNotSum(only, 'fee', supplied);
}

// An agency outlay for the tax or the registry that equals a return or a registry invoice in the
// pack: the same payment twice, once as itself and once inside the agency's total.
function suppliedTwice(r: Reading): boolean {
  const paid = [
    ...rows(r, 'ajd_form', 'ajdForms').map((row) => num(row, 'amountPaid')),
    ...rows(r, 'registry_invoice', 'registryInvoices').map((row) => num(row, 'total')),
  ].filter((v) => v !== null);
  return rows(r, 'agency_invoice_mortgage', 'agencySupplied').some((row) => {
    const amount = num(row, 'amount');
    const concept = row.values['concept'];
    return (
      amount !== null &&
      (concept === 'ajd' || concept === 'registry') &&
      paid.some((p) => near(p, amount))
    );
  });
}

export function mortgageFailedChecks(r: Reading): readonly MortgageCheck[] {
  const failed: MortgageCheck[] = [];
  if (anyInvoiceDoesNotSum(r)) failed.push('invoice_parts_do_not_sum');
  const invoices = [
    ...rows(r, 'notary_invoice', 'notaryInvoices'),
    ...rows(r, 'registry_invoice', 'registryInvoices'),
  ];
  if (invoices.some((row) => row.values['mixed'] === true))
    failed.push('invoice_mixes_purchase_and_loan');
  if (suppliedTwice(r)) failed.push('duplicate_supplied_amount');
  if (rows(r, 'ajd_form', 'ajdForms').some((row) => row.values['concept'] === 'purchase'))
    failed.push('ajd_purchase_not_loan');
  const deedRead = r.pages.some((p) => p.kind === 'mortgage_deed' && isReadable(p));
  const expenses = rows(r, 'mortgage_deed', 'clauses').some(
    (row) => row.values['label'] === 'expenses_clause',
  );
  const deedOn = r.sections['mortgage_deed']?.fields['deedOn']?.value;
  const needsClause = typeof deedOn !== 'string' || deedOn < LCCI_IN_FORCE;
  if (deedRead && !expenses && needsClause) failed.push('missing_key_page');
  return failed;
}

// A legible deed that yields neither its date nor its capital has missed what every figure hangs
// on.
export function mortgageIncomplete(reading: Reading, extraction: MortgageMerged): boolean {
  const read = reading.pages.some((p) => p.kind === 'mortgage_deed' && isReadable(p));
  return (
    read && extraction.fields.deedOn === undefined && extraction.fields.principal === undefined
  );
}
