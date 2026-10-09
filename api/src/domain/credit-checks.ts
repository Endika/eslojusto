import type { CreditMerged } from './credit-merge';
import { isReadable, type ExtractedRow, type Reading, type Section } from './extraction';

// Whether what the documents state hangs together; never what the APR is, how it stands against
// any average rate or whether a charge is lawful, which is the site's engine's to say.
export type CreditCheck =
  | 'net_above_principal'
  | 'declared_total_mismatch'
  | 'schedule_rows_do_not_sum'
  | 'schedule_balance_jump'
  | 'repayment_after_end'
  | 'statement_total_below_balance';

const cents = (n: number): number => Math.round(n * 100);
const TOLERANCE_CENTS = 100;

const num = (values: Readonly<Record<string, unknown>>, name: string): number | null => {
  const v = values[name];
  return typeof v === 'number' ? v : null;
};

const fieldValues = (s: Section | undefined): Readonly<Record<string, unknown>> =>
  Object.fromEntries(Object.entries(s?.fields ?? {}).map(([name, f]) => [name, f.value]));

const rows = (s: Section | undefined, list: string): readonly ExtractedRow[] =>
  s?.lists[list] ?? [];

// What the instalments and the last payment add up to is part of the total payable: a total
// below it can't be right. A total above it may hold charges paid apart.
function totalBelowInstalments(contract: Readonly<Record<string, unknown>>): boolean {
  const [count, amount, total] = [
    num(contract, 'instalmentCount'),
    num(contract, 'instalmentAmount'),
    num(contract, 'declaredTotalPayable'),
  ];
  if (count === null || amount === null || total === null) return false;
  const paid = count * cents(amount) + cents(num(contract, 'balloonAmount') ?? 0);
  return paid - cents(total) > TOLERANCE_CENTS;
}

// A row's interest, capital and charges against its instalment.
function rowDoesNotSum({ values }: ExtractedRow): boolean {
  const [amount, interest, principal] = [
    num(values, 'amount'),
    num(values, 'interest'),
    num(values, 'principal'),
  ];
  if (amount === null || interest === null || principal === null) return false;
  const parts = cents(interest) + cents(principal) + cents(num(values, 'fees') ?? 0);
  return Math.abs(parts - cents(amount)) > TOLERANCE_CENTS;
}

// Each row's outstanding capital is the previous one's less the capital the row repays.
function balanceJumps(schedule: readonly ExtractedRow[]): boolean {
  return schedule.some(({ values }, i) => {
    const previous = i === 0 ? null : num(schedule[i - 1]?.values ?? {}, 'balance');
    const [balance, principal] = [num(values, 'balance'), num(values, 'principal')];
    if (previous === null || balance === null || principal === null) return false;
    return Math.abs(cents(previous) - cents(principal) - cents(balance)) > TOLERANCE_CENTS;
  });
}

function statementTotalBelowBalance({ values }: ExtractedRow): boolean {
  const [balance, total] = [num(values, 'balance'), num(values, 'totalToPay')];
  return balance !== null && total !== null && cents(balance) - cents(total) > TOLERANCE_CENTS;
}

export function creditFailedChecks(r: Reading): readonly CreditCheck[] {
  const failed: CreditCheck[] = [];
  const contract = fieldValues(r.sections.credit_agreement);
  const [principal, net] = [num(contract, 'principal'), num(contract, 'netDisbursed')];
  if (principal !== null && net !== null && net > principal) failed.push('net_above_principal');
  if (totalBelowInstalments(contract)) failed.push('declared_total_mismatch');
  const schedule = rows(r.sections.amortization_schedule, 'schedule');
  if (schedule.some(rowDoesNotSum)) failed.push('schedule_rows_do_not_sum');
  if (balanceJumps(schedule)) failed.push('schedule_balance_jump');
  // ISO dates compare correctly as strings.
  const repayment = fieldValues(r.sections.early_repayment_statement);
  const [on, end] = [repayment['repaidOn'], repayment['agreedEndOn'] ?? contract['agreedEndOn']];
  if (typeof on === 'string' && typeof end === 'string' && on > end)
    failed.push('repayment_after_end');
  if (rows(r.sections.card_statement, 'statements').some(statementTotalBelowBalance))
    failed.push('statement_total_below_balance');
  return failed;
}

// A legible contract that yields neither its amount nor its instalments, or a card contract
// without its limit or its rate, is worth a second look.
export function creditIncomplete(reading: Reading, extraction: CreditMerged): boolean {
  const read = (kind: string) => reading.pages.some((p) => p.kind === kind && isReadable(p));
  const { principal, instalmentCount, instalmentAmount, creditLimit, nominalRate } =
    extraction.fields;
  const loan =
    read('credit_agreement') &&
    principal === undefined &&
    instalmentCount === undefined &&
    instalmentAmount === undefined;
  const card =
    read('revolving_agreement') && creditLimit === undefined && nominalRate === undefined;
  return loan || card;
}
