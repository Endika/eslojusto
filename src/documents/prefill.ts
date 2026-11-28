import { daysInMonth, parseDate, toIso, type CivilDate } from '../engine/date';
import { formatAmountInput } from '../calculator/number';
import type { Confidence, Extraction, ExtractedField } from './contract';

// One form control to set: its name, the value as the form writes it, and how sure the reading is.
export interface PrefilledField {
  readonly name: string;
  readonly value: string;
  readonly confidence: Confidence;
  // A value the page worked out from what was read (the salary from a payslip), not read as such.
  readonly derived?: true;
}

export interface PrefilledContract {
  readonly startDate: string;
  readonly endDate: string;
  readonly confidence: Confidence;
}

export interface Prefill {
  readonly fields: readonly PrefilledField[];
  // Rows for «Otros trabajos»; null when the document says nothing about other jobs.
  readonly otherContracts: readonly PrefilledContract[] | null;
}

const ITEM_IDS = [
  'pending_salary',
  'holiday_pay',
  'extra_pay',
  'severance',
  'employer_notice',
  'notice_deduction',
] as const;

const HOLIDAY_FIELDS = ['annualHolidayDays', 'holidayDaysTaken'] as const;

const RANK: Record<Confidence, number> = { high: 2, medium: 1, low: 0 };
const lowest = (...fields: (Typed<unknown> | false | null)[]): Confidence =>
  fields.reduce<Confidence>(
    // Stryker disable next-line EqualityOperator: equal ranks are the same confidence, so which one stays does not matter
    (a, f) => (f && RANK[f.confidence] < RANK[a] ? f.confidence : a),
    'high',
  );

// A field read as one kind of value, or nothing when the reading gave another.
interface Typed<T> {
  readonly value: T;
  readonly confidence: Confidence;
}
const typed =
  <T extends string | number | boolean>(kind: 'string' | 'number' | 'boolean') =>
  (f: ExtractedField | undefined): Typed<T> | null =>
    f && typeof f.value === kind ? { value: f.value as T, confidence: f.confidence } : null;
const num = typed<number>('number');
const text = typed<string>('string');
const bool = typed<boolean>('boolean');

function safeDate(iso: string | null): CivilDate | null {
  // Stryker disable next-line ConditionalExpression: parseDate(null) throws, and the catch below answers the same null
  if (iso === null) return null;
  try {
    return parseDate(iso);
  } catch {
    return null;
  }
}

// A payslip's total stands for a month's salary only when its period is a whole calendar month.
function wholeMonth(start: string | null, end: string | null): boolean {
  const a = safeDate(start);
  const b = safeDate(end);
  return (
    a !== null &&
    b !== null &&
    a.d === 1 &&
    a.y === b.y &&
    a.m === b.m &&
    b.d === daysInMonth(b.y, b.m)
  );
}

type Fields = Extraction['fields'];

// The values the documents state as such.
function stated(fields: Fields): PrefilledField[] {
  const out: PrefilledField[] = [];
  const push = (name: string, f: Typed<unknown>, value: string, confidence = f.confidence) =>
    out.push({ name, value, confidence });
  for (const name of ['startDate', 'endDate', 'cause'] as const) {
    const f = text(fields[name]);
    if (f) push(name, f, f.value);
  }
  const fixedTerm = text(fields.fixedTermType);
  if (fixedTerm && text(fields.cause)?.value === 'fixed_term_end')
    push('fixedTermType', fixedTerm, fixedTerm.value);
  const salary = num(fields.monthlySalary);
  if (salary) push('monthlySalary', salary, formatAmountInput(salary.value));
  for (const name of HOLIDAY_FIELDS) {
    const f = num(fields[name]);
    // The reading gives no unit, and the form's one may not be the document's: always checked.
    if (f && Number.isInteger(f.value)) push(name, f, String(f.value), 'low');
  }
  const notice = num(fields.noticeDaysReceived);
  if (notice && Number.isInteger(notice.value))
    push('noticeDaysReceived', notice, String(notice.value));
  for (const id of ITEM_IDS) {
    const f = num(fields[id]);
    if (f) push(`figure_${id}`, f, formatAmountInput(f.value));
  }
  return out;
}

// What the latest ordinary payslip says about extra pay, and the salary worked out from it.
function payslip(fields: Fields, salaryStated: boolean): PrefilledField[] {
  const out: PrefilledField[] = [];
  const prorated = bool(fields.extraPayProrated);
  if (prorated)
    out.push({
      name: 'extraPayProrated',
      value: prorated.value ? 'yes' : 'no',
      confidence: prorated.confidence,
    });
  const extra = num(fields.extraPayAmount);
  if (extra && prorated?.value === false)
    out.push({
      name: 'extraPayAmount',
      value: formatAmountInput(extra.value),
      confidence: extra.confidence,
    });
  if (salaryStated) return out;

  // The form's salary, only for a payslip of one whole calendar month: with proration, the
  // month's total; without it, the total less the full extra payment when one was paid that
  // month, and the total otherwise. Without the proration answer the total can't be read either
  // way, so no salary is proposed. The person sees it as worked out and confirms it.
  const total = num(fields.payslipTotalAccrued);
  const paid = bool(fields.extraPayPaid);
  const period = [text(fields.payslipPeriodStart), text(fields.payslipPeriodEnd)] as const;
  if (!total || !prorated || !wholeMonth(period[0]?.value ?? null, period[1]?.value ?? null))
    return out;
  const takesExtra = !prorated.value && paid?.value === true;
  if (takesExtra && !extra) return out;
  const taken = takesExtra ? extra : null;
  const salary = Math.round((total.value - (taken?.value ?? 0)) * 100) / 100;
  if (salary > 0)
    out.push({
      name: 'monthlySalary',
      value: formatAmountInput(salary),
      confidence: lowest(
        total,
        prorated,
        !prorated.value && paid,
        taken && taken.value > 0 && taken,
      ),
      derived: true,
    });
  return out;
}

// The other jobs of the last 6 years: every row with both dates, but not the job being reviewed.
function workHistory(
  rows: Extraction['contracts'],
  current: { startDate?: string; endDate?: string },
) {
  const end = safeDate(current.endDate ?? null);
  const since = end ? toIso({ ...end, y: end.y - 6 }) : '';
  return rows.flatMap((row): PrefilledContract[] => {
    const { startDate, endDate } = row.values;
    if (typeof startDate !== 'string' || typeof endDate !== 'string') return [];
    if (startDate === current.startDate) return [];
    if (endDate < since) return [];
    if (current.endDate && endDate > current.endDate) return [];
    return [{ startDate, endDate, confidence: row.confidence }];
  });
}

// What a reading puts into the form. Nothing here calculates the final pay: it only fills fields,
// and the person goes through every sheet before anything is reviewed. The job's own dates come
// from the documents when they state them, otherwise from what the form already has.
export function prefillFrom(
  e: Extraction,
  current: { startDate?: string; endDate?: string } = {},
): Prefill {
  const own = stated(e.fields);
  const fields = [
    ...own,
    ...payslip(
      e.fields,
      own.some((f) => f.name === 'monthlySalary'),
    ),
  ];
  const startDate = text(e.fields.startDate);
  const endDate = text(e.fields.endDate);
  const dates = {
    ...current,
    ...(startDate && { startDate: startDate.value }),
    ...(endDate && { endDate: endDate.value }),
  };
  return {
    fields,
    otherContracts: e.contracts.length > 0 ? workHistory(e.contracts, dates) : null,
  };
}

export const prefilledCount = (p: Prefill): number =>
  p.fields.length + (p.otherContracts?.length ?? 0);

export const hasHolidayDays = (p: Prefill): boolean =>
  p.fields.some((f) => (HOLIDAY_FIELDS as readonly string[]).includes(f.name));

export const hasLowConfidence = (p: Prefill): boolean => {
  const low = (f: { readonly confidence: Confidence }) => f.confidence === 'low';
  return p.fields.some(low) || (p.otherContracts?.some(low) ?? false);
};
