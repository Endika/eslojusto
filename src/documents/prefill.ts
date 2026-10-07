import { daysInMonth, parseDate, type CivilDate } from '../engine/date';
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
export const lowest = (...cs: Confidence[]): Confidence =>
  cs.reduce((a, b) => (RANK[b] < RANK[a] ? b : a), 'high');

const num = (f: ExtractedField | undefined): number | null =>
  f && typeof f.value === 'number' ? f.value : null;
const text = (f: ExtractedField | undefined): string | null =>
  f && typeof f.value === 'string' ? f.value : null;

function safeDate(iso: string | null): CivilDate | null {
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
  for (const name of ['startDate', 'endDate', 'cause'] as const) {
    const f = fields[name];
    const v = text(f);
    if (f && v !== null) out.push({ name, value: v, confidence: f.confidence });
  }
  const fixedTerm = fields.fixedTermType;
  if (fixedTerm && text(fixedTerm) !== null && text(fields.cause) === 'fixed_term_end')
    out.push({
      name: 'fixedTermType',
      value: String(fixedTerm.value),
      confidence: fixedTerm.confidence,
    });
  const salary = fields.monthlySalary;
  const salaryAmount = num(salary);
  if (salary && salaryAmount !== null)
    out.push({
      name: 'monthlySalary',
      value: formatAmountInput(salaryAmount),
      confidence: salary.confidence,
    });
  for (const name of HOLIDAY_FIELDS) {
    const f = fields[name];
    const v = num(f);
    // The reading gives no unit, and the form's one may not be the document's: always checked.
    if (f && v !== null && Number.isInteger(v))
      out.push({ name, value: String(v), confidence: 'low' });
  }
  const notice = fields.noticeDaysReceived;
  const noticeDays = num(notice);
  if (notice && noticeDays !== null && Number.isInteger(noticeDays))
    out.push({
      name: 'noticeDaysReceived',
      value: String(noticeDays),
      confidence: notice.confidence,
    });
  for (const id of ITEM_IDS) {
    const f = fields[id];
    const v = num(f);
    if (f && v !== null)
      out.push({ name: `figure_${id}`, value: formatAmountInput(v), confidence: f.confidence });
  }
  return out;
}

// What the latest ordinary payslip says about extra pay, and the salary worked out from it.
function payslip(fields: Fields, salaryStated: boolean): PrefilledField[] {
  const out: PrefilledField[] = [];
  const prorated = fields.extraPayProrated;
  const isProrated = prorated && typeof prorated.value === 'boolean' ? prorated.value : null;
  if (prorated && isProrated !== null)
    out.push({
      name: 'extraPayProrated',
      value: isProrated ? 'yes' : 'no',
      confidence: prorated.confidence,
    });
  const extra = fields.extraPayAmount;
  const extraAmount = num(extra);
  if (extra && extraAmount !== null && isProrated === false)
    out.push({
      name: 'extraPayAmount',
      value: formatAmountInput(extraAmount),
      confidence: extra.confidence,
    });
  if (salaryStated) return out;

  // The form's salary, only for a payslip of one whole calendar month: with proration, the
  // month's total; without it, the total less the full extra payment when one was paid that
  // month, and the total otherwise. Without the proration answer the total can't be read either
  // way, so no salary is proposed. The person sees it as worked out and confirms it.
  const total = fields.payslipTotalAccrued;
  const totalAmount = num(total);
  const paid = fields.extraPayPaid;
  const extraPaid = paid && typeof paid.value === 'boolean' ? paid.value : false;
  const period = [text(fields.payslipPeriodStart), text(fields.payslipPeriodEnd)] as const;
  const known = isProrated === true || !extraPaid || extraAmount !== null;
  if (
    total &&
    totalAmount !== null &&
    prorated &&
    isProrated !== null &&
    known &&
    wholeMonth(...period)
  ) {
    const minus = !isProrated && extraPaid ? (extraAmount ?? 0) : 0;
    const salary = Math.round((totalAmount - minus) * 100) / 100;
    if (salary > 0)
      out.push({
        name: 'monthlySalary',
        value: formatAmountInput(salary),
        confidence: lowest(
          total.confidence,
          prorated.confidence,
          ...(!isProrated && paid ? [paid.confidence] : []),
          ...(minus > 0 && extra ? [extra.confidence] : []),
        ),
        derived: true,
      });
  }
  return out;
}

// The other jobs of the last 6 years: every row with both dates, but not the job being reviewed.
function workHistory(
  rows: Extraction['contracts'],
  current: { startDate?: string; endDate?: string },
) {
  const end = safeDate(current.endDate ?? null);
  const since = end ? `${String(end.y - 6).padStart(4, '0')}${current.endDate?.slice(4)}` : null;
  return rows.flatMap((row): PrefilledContract[] => {
    const { startDate, endDate } = row.values;
    if (typeof startDate !== 'string' || typeof endDate !== 'string') return [];
    if (startDate === current.startDate) return [];
    if (since !== null && endDate < since) return [];
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
  const dates = {
    ...current,
    ...(text(e.fields.startDate) !== null && { startDate: text(e.fields.startDate) as string }),
    ...(text(e.fields.endDate) !== null && { endDate: text(e.fields.endDate) as string }),
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

export const hasLowConfidence = (p: Prefill): boolean =>
  [...p.fields, ...(p.otherContracts ?? [])].some((f) => f.confidence === 'low');
