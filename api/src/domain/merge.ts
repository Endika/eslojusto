import type { PageKind, SourceKind } from './documents';
import {
  ALL_SECTIONS,
  type Confidence,
  type SectionKind,
  type SectionSchema,
} from './extraction-schema';
import { hasIdentifier } from './identifiers';
import {
  withLineTotals,
  withinTolerance,
  type ExtractedRow,
  type ExtractedValue,
  type Reading,
  type Section,
} from './extraction';

export type From = readonly [SectionKind, string];

const ITEM_SOURCES: readonly SectionKind[] = [
  'settlement_proposal',
  'final_payslip',
  'dismissal_letter',
];

export const own = (...sections: readonly SectionKind[]) => sections.map((s): From => [s, '']);

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
export interface Conflict<N extends string = MergedFieldName> {
  readonly field: N;
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
      if (p.month !== undefined) last.month ??= p.month;
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
export function mergeFields<N extends string>(
  reading: Reading,
  rules: Readonly<Record<N, readonly From[]>>,
): {
  readonly fields: Partial<Record<N, MergedField>>;
  readonly conflicts: readonly Conflict<N>[];
  readonly discarded: number;
} {
  const fields: Partial<Record<N, MergedField>> = {};
  const conflicts: Conflict<N>[] = [];
  let discarded = 0;
  for (const name of Object.keys(rules) as N[]) {
    let kept: MergedField | null = null;
    const disagreeing: SourceKind[] = [];
    for (const [section, own] of rules[name]) {
      const field = reading.sections[section]?.fields[own || name];
      if (!field) continue;
      const source = ALL_SECTIONS[section].source;
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
  return { fields, conflicts, discarded };
}

// A text copied from a document that still holds an identifier is dropped: the text alone, never
// the figures beside it. `fields` and `items` name the copied texts of the section and its rows.
export function withoutIdentifiers(
  section: Section,
  texts: { readonly fields: readonly string[]; readonly items: readonly string[] },
  leaks: (text: string) => boolean = hasIdentifier,
): { readonly section: Section; readonly dropped: number } {
  const carries = (v: unknown): boolean => typeof v === 'string' && leaks(v);
  let dropped = 0;
  const fields = Object.fromEntries(
    Object.entries(section.fields).filter(([name, field]) => {
      const leaking = texts.fields.includes(name) && carries(field.value);
      if (leaking) dropped += 1;
      return !leaking;
    }),
  );
  const lists = Object.fromEntries(
    Object.entries(section.lists).map(([name, rows]) => [
      name,
      rows.map((row) => {
        const values = Object.fromEntries(
          Object.entries(row.values).filter(([item, v]) => {
            const leaking = texts.items.includes(item) && carries(v);
            if (leaking) dropped += 1;
            return !leaking;
          }),
        );
        return { ...row, values };
      }),
    ]),
  );
  return { section: { fields, lists }, dropped };
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

// Whether the model filled a list of a section it read up to the list's maximum. Counted on what
// it sent, before rows that failed validation were left out.
export function listsReachedMaximum(
  toolInput: unknown,
  reading: Reading,
  sections: Readonly<Partial<Record<SectionKind, SectionSchema>>>,
): boolean {
  if (!isRecord(toolInput)) return false;
  return (Object.entries(sections) as [SectionKind, SectionSchema][]).some(([kind, schema]) => {
    const raw = toolInput[kind];
    if (!reading.sections[kind] || !isRecord(raw)) return false;
    return Object.entries(schema.lists).some(
      ([name, list]) => Array.isArray(raw[name]) && raw[name].length >= list.maxItems,
    );
  });
}

// Every list of the sections read, each row with the kind of document it came from.
export function sourcedLists<L extends string>(
  reading: Reading,
  sections: Readonly<Partial<Record<SectionKind, SectionSchema>>>,
): Partial<Record<L, readonly MergedRow[]>> {
  const lists: Partial<Record<L, MergedRow[]>> = {};
  for (const [kind, schema] of Object.entries(sections) as [SectionKind, SectionSchema][]) {
    const section = reading.sections[kind];
    if (!section) continue;
    for (const name of Object.keys(schema.lists) as L[]) {
      const rows = section.lists[name];
      if (rows && rows.length > 0)
        lists[name] = [
          ...(lists[name] ?? []),
          ...rows.map((row) => ({ ...row, source: schema.source })),
        ];
    }
  }
  return lists;
}

export function merge(read: Reading): Merged {
  const reading = withLineTotals(read);
  const { fields, conflicts, discarded } = mergeFields(reading, MERGE_RULES);
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
