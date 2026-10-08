import type { EmploymentMerged } from './employment-merge';
import { isReadable, type ExtractedRow, type Reading, type Section } from './extraction';

// Whether what the documents state hangs together; never whether anything in the contract is
// lawful, which is the site's engine's to say.
export type EmploymentCheck =
  | 'end_before_start'
  | 'payslip_not_whole_month'
  | 'payslip_lines_do_not_sum'
  | 'hours_over_week'
  | 'salary_period_mismatch';

const cents = (n: number): number => Math.round(n * 100);
const LINES_TOLERANCE_CENTS = 100;
// Weekly hours above this are taken for a misreading, not a long week.
export const MAX_PLAUSIBLE_WEEKLY_HOURS = 80;
// Monthly pay times the payments a year against the annual figure the contract prints.
export const SALARY_PERIOD_TOLERANCE = 0.05;

function num(values: Readonly<Record<string, unknown>>, name: string): number | null {
  const v = values[name];
  return typeof v === 'number' ? v : null;
}

function str(values: Readonly<Record<string, unknown>>, name: string): string | null {
  const v = values[name];
  return typeof v === 'string' ? v : null;
}

const fieldValues = (s: Section | undefined): Readonly<Record<string, unknown>> =>
  Object.fromEntries(Object.entries(s?.fields ?? {}).map(([name, f]) => [name, f.value]));

const rows = (s: Section | undefined, list: string): readonly ExtractedRow[] =>
  s?.lists[list] ?? [];

// ISO dates compare correctly as strings.
function endsBeforeStart(
  values: Readonly<Record<string, unknown>>,
  start: string,
  end: string,
): boolean {
  const [from, to] = [str(values, start), str(values, end)];
  return from !== null && to !== null && to < from;
}

const lastDayOf = (month: string): string => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
};

// A payslip whose period is not the whole calendar month it is for: it can't be set against a
// monthly minimum as it stands.
function notWholeMonth({ values }: ExtractedRow): boolean {
  const [month, start, end] = [
    str(values, 'month'),
    str(values, 'periodStart'),
    str(values, 'periodEnd'),
  ];
  if (month === null || start === null || end === null) return false;
  return start !== `${month}-01` || end !== lastDayOf(month);
}

// The earnings lines of a month against the gross totals of that month's payslips, when every
// one of them prints its total.
function linesDoNotSum(payslips: Section | undefined): boolean {
  const totals = new Map<string, number | null>();
  for (const { values } of rows(payslips, 'payslips')) {
    const month = str(values, 'month');
    if (month === null) continue;
    const total = num(values, 'totalAccrued');
    const sum = totals.get(month);
    totals.set(month, total === null || sum === null ? null : (sum ?? 0) + cents(total));
  }
  const lines = new Map<string, number>();
  for (const { values } of rows(payslips, 'lines')) {
    const [month, amount] = [str(values, 'month'), num(values, 'amount')];
    if (month !== null && amount !== null)
      lines.set(month, (lines.get(month) ?? 0) + cents(amount));
  }
  return [...lines].some(([month, sum]) => {
    const total = totals.get(month);
    return total !== undefined && total !== null && Math.abs(sum - total) > LINES_TOLERANCE_CENTS;
  });
}

function salaryPeriodMismatch(contract: Readonly<Record<string, unknown>>): boolean {
  const [amount, payments, annual] = [
    num(contract, 'salaryAmount'),
    num(contract, 'payments'),
    num(contract, 'annualSalaryAmount'),
  ];
  if (contract['salaryPeriod'] !== 'month' || amount === null || payments === null || !annual)
    return false;
  return Math.abs(amount * payments - annual) > SALARY_PERIOD_TOLERANCE * annual;
}

export function employmentFailedChecks(r: Reading): readonly EmploymentCheck[] {
  const failed: EmploymentCheck[] = [];
  const contract = fieldValues(r.sections.employment_contract);
  const offer = fieldValues(r.sections.job_offer);
  const payslips = r.sections.employment_payslips;
  if (
    endsBeforeStart(contract, 'startDate', 'endDate') ||
    rows(payslips, 'payslips').some((p) => endsBeforeStart(p.values, 'periodStart', 'periodEnd')) ||
    rows(r.sections.employment_work_history, 'contracts').some((c) =>
      endsBeforeStart(c.values, 'startDate', 'endDate'),
    )
  )
    failed.push('end_before_start');
  if (rows(payslips, 'payslips').some(notWholeMonth)) failed.push('payslip_not_whole_month');
  if (linesDoNotSum(payslips)) failed.push('payslip_lines_do_not_sum');
  if ([contract, offer].some((s) => (num(s, 'weeklyHours') ?? 0) > MAX_PLAUSIBLE_WEEKLY_HOURS))
    failed.push('hours_over_week');
  if (salaryPeriodMismatch(contract)) failed.push('salary_period_mismatch');
  return failed;
}

// A legible contract that yields neither its start nor its salary is worth a second look.
export function employmentIncomplete(reading: Reading, extraction: EmploymentMerged): boolean {
  const contractRead = reading.pages.some((p) => p.kind === 'employment_contract' && isReadable(p));
  return (
    contractRead &&
    extraction.fields.startDate === undefined &&
    extraction.fields.salaryAmount === undefined
  );
}
