import type { PageKind, SourceKind } from './documents';
import { SECTIONS, type Confidence, type SectionKind } from './extraction-schema';
import {
  withLineTotals,
  withinTolerance,
  type ExtractedRow,
  type ExtractedValue,
  type Reading,
} from './extraction';

type From = readonly [SectionKind, string];

const ITEM_SOURCES: readonly SectionKind[] = [
  'settlement_proposal',
  'final_payslip',
  'dismissal_letter',
];

const own = (...sections: readonly SectionKind[]) => sections.map((s): From => [s, '']);

// For each field the response carries, where it may come from, preferred first. An empty field
// name means the field's own name. The settlement proposal is the employer's own account of the
// final pay, so it comes first for its figures; an agreement that settles the dispute comes first
// for the cause, since it can acknowledge a dismissal as unfair.
export const MERGE_RULES = {
  startDate: own('settlement_proposal', 'final_payslip', 'monthly_payslip', 'company_certificate'),
  endDate: own(
    'settlement_proposal',
    'dismissal_letter',
    'company_certificate',
    'settlement_agreement',
  ),
  cause: own(
    'settlement_agreement',
    'settlement_proposal',
    'dismissal_letter',
    'company_certificate',
  ),
  fixedTermType: own('settlement_proposal', 'company_certificate', 'dismissal_letter'),
  monthlySalary: own('settlement_proposal'),
  // The final payslip's salary lines, added up in code, come before a settlement's figure,
  // which often names the concept without an amount of its own.
  pending_salary: own('final_payslip', 'settlement_proposal', 'dismissal_letter'),
  holiday_pay: own(...ITEM_SOURCES),
  extra_pay: own(...ITEM_SOURCES),
  severance: own(...ITEM_SOURCES),
  employer_notice: own(...ITEM_SOURCES),
  notice_deduction: own(...ITEM_SOURCES),
  annualHolidayDays: own('settlement_proposal', 'final_payslip'),
  holidayDaysTaken: own('settlement_proposal', 'final_payslip'),
  noticeDaysReceived: own('dismissal_letter'),
  noticeDaysPaid: own('dismissal_letter'),
  // What an agreement offers is not what the final pay states, so it stays a field of its own.
  agreementSeveranceTotal: [['settlement_agreement', 'severanceTotal']],
  payslipPeriodStart: [['monthly_payslip', 'periodStart']],
  payslipPeriodEnd: [['monthly_payslip', 'periodEnd']],
  payslipTotalAccrued: [['monthly_payslip', 'totalAccrued']],
  extraPayProrated: own('monthly_payslip'),
  extraPayProratedAmount: own('monthly_payslip'),
  extraPayPaid: own('monthly_payslip'),
  extraPayAmount: own('monthly_payslip'),
} as const satisfies Readonly<Record<string, readonly From[]>>;

export type MergedFieldName = keyof typeof MERGE_RULES;
export const MERGED_FIELDS = Object.keys(MERGE_RULES) as readonly MergedFieldName[];

export interface MergedField {
  readonly value: ExtractedValue;
  readonly confidence: Confidence;
  readonly source: SourceKind;
}

export interface MergedRow extends ExtractedRow {
  readonly source: SourceKind;
}

// Two documents that state different values for one field: the first source is the one kept.
export interface Conflict {
  readonly field: MergedFieldName;
  readonly sources: readonly SourceKind[];
}

export interface RecognisedDocument {
  readonly kind: PageKind;
  // 1-based page numbers, consecutive.
  readonly pages: readonly number[];
  readonly month?: string;
}

export interface Merged {
  readonly pages: Reading['pages'];
  readonly documents: readonly RecognisedDocument[];
  readonly fields: Readonly<Partial<Record<MergedFieldName, MergedField>>>;
  readonly lists: { readonly contracts?: readonly MergedRow[] };
  readonly conflicts: readonly Conflict[];
  // Values that lost to a preferred source without being sure of themselves: dropped, not shown.
  readonly discarded: number;
}

const same = (a: ExtractedValue, b: ExtractedValue): boolean =>
  typeof a === 'number' && typeof b === 'number' ? withinTolerance(a, b) : a === b;

// Consecutive pages of one kind that the model numbered as one document.
export function groupDocuments(pages: Reading['pages']): readonly RecognisedDocument[] {
  const documents: { kind: PageKind; pages: number[]; document: number; month?: string }[] = [];
  for (const p of pages) {
    const last = documents.at(-1);
    if (
      last &&
      last.kind === p.kind &&
      last.document === p.document &&
      last.pages.at(-1) === p.page - 1
    ) {
      last.pages.push(p.page);
      last.month ??= p.month;
    } else
      documents.push({
        kind: p.kind,
        pages: [p.page],
        document: p.document,
        ...(p.month !== undefined && { month: p.month }),
      });
  }
  return documents.map(({ kind, pages: numbers, month }) => ({
    kind,
    pages: numbers,
    ...(month !== undefined && { month }),
  }));
}

// One value per field, from the preferred document that states it. Another document that states
// something else with high confidence is a conflict, kept as field and sources only; a less sure
// value that loses is dropped, so a stray amount the model was unsure of shows no disagreement.
export function merge(read: Reading): Merged {
  const reading = withLineTotals(read);
  const fields: Partial<Record<MergedFieldName, MergedField>> = {};
  const conflicts: Conflict[] = [];
  let discarded = 0;
  for (const name of MERGED_FIELDS) {
    let kept: MergedField | null = null;
    const disagreeing: SourceKind[] = [];
    for (const [section, own] of MERGE_RULES[name] as readonly From[]) {
      const field = reading.sections[section]?.fields[own || name];
      if (!field) continue;
      const source = SECTIONS[section].source;
      if (kept === null) kept = { ...field, source };
      else if (same(kept.value, field.value)) continue;
      else if (field.confidence !== 'high') discarded += 1;
      else if (!disagreeing.includes(source)) disagreeing.push(source);
    }
    if (kept === null) continue;
    fields[name] = kept;
    // Two payslips that disagree are one kind of document: nothing to tell the person apart.
    const others = disagreeing.filter((s) => s !== kept.source);
    if (others.length > 0) conflicts.push({ field: name, sources: [kept.source, ...others] });
  }
  const contracts = reading.sections.work_history?.lists['contracts'];
  return {
    pages: reading.pages,
    documents: groupDocuments(reading.pages),
    fields,
    lists: contracts
      ? { contracts: contracts.map((row) => ({ ...row, source: 'work_history' as const })) }
      : {},
    conflicts,
    discarded,
  };
}
