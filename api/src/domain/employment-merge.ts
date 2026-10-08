import { EMPLOYMENT_SECTIONS, type EmploymentSectionKind } from './employment-schema';
import type { ExtractedField, ExtractedRow, Reading, Section } from './extraction';
import type { SectionKind } from './extraction-schema';
import { hasIdentifier, hasSocialSecurityNumber } from './identifiers';
import {
  groupDocuments,
  mergeFields,
  own,
  withoutIdentifiers,
  type Conflict,
  type From,
  type MergedField,
  type MergedRow,
  type RecognisedDocument,
} from './merge';

type ContractField = keyof (typeof EMPLOYMENT_SECTIONS)['employment_contract']['fields'];
type OfferField = keyof (typeof EMPLOYMENT_SECTIONS)['job_offer']['fields'];

function rules<K extends string>(
  entries: readonly (readonly [K, readonly From[]])[],
): Readonly<Record<K, readonly From[]>> {
  const out = {} as Record<K, readonly From[]>;
  for (const [name, from] of entries) out[name] = from;
  return out;
}

const CONTRACT_FIELDS = Object.keys(
  EMPLOYMENT_SECTIONS.employment_contract.fields,
) as ContractField[];
const OFFER_FIELDS = Object.keys(EMPLOYMENT_SECTIONS.job_offer.fields) as OfferField[];

// Prefixed: an offer's salary or hours are not the contract's.
type OfferFieldName = `offer${Capitalize<OfferField>}`;
const offerName = (name: OfferField): OfferFieldName =>
  `offer${name.charAt(0).toUpperCase()}${name.slice(1)}` as OfferFieldName;

const CONTRACT_RULES = rules(CONTRACT_FIELDS.map((f) => [f, own('employment_contract')] as const));
const OFFER_RULES = rules(OFFER_FIELDS.map((f) => [offerName(f), [['job_offer', f]]] as const));

// For each field the response carries, where it may come from, preferred first. The agreement and
// the category fall back on the most recent payslip that prints them.
export const EMPLOYMENT_MERGE_RULES = {
  ...CONTRACT_RULES,
  agreementName: own('employment_contract', 'employment_payslips'),
  category: own('employment_contract', 'employment_payslips'),
  ...OFFER_RULES,
} as const satisfies Readonly<Record<string, readonly From[]>>;

export type EmploymentFieldName = keyof typeof EMPLOYMENT_MERGE_RULES;

type ListsOf<K extends EmploymentSectionKind> = keyof (typeof EMPLOYMENT_SECTIONS)[K]['lists'];
export type EmploymentListName = {
  [K in EmploymentSectionKind]: ListsOf<K>;
}[EmploymentSectionKind] &
  string;

export interface EmploymentMerged {
  readonly pages: Reading['pages'];
  readonly documents: readonly RecognisedDocument[];
  readonly fields: Readonly<Partial<Record<EmploymentFieldName, MergedField>>>;
  readonly lists: Readonly<Partial<Record<EmploymentListName, readonly MergedRow[]>>>;
  readonly conflicts: readonly Conflict<EmploymentFieldName>[];
  // Some list came back at its maximum, so the documents may hold rows beyond it: the site says so.
  readonly truncated: boolean;
  // Values that lost to a preferred source without being sure of themselves, and names or
  // identifiers the API would not keep: dropped, not shown.
  readonly discarded: number;
}

// Texts copied from the documents. The worker never appears in them: anything that still looks
// like an identifier takes the text with it.
const FREE_TEXTS = {
  fields: [
    'causeText',
    'scheduleText',
    'modalityText',
    'companyName',
    'category',
    'agreementName',
    'position',
  ],
  items: ['literal', 'concept', 'employerName', 'agreementName', 'category'],
};

const leaks = (text: string): boolean => hasIdentifier(text) || hasSocialSecurityNumber(text);

const isCompany = (v: unknown): boolean => v === 'company';

// An employer's name is kept only for a company: a household employer's name is a person's,
// which the review has no use for, whatever the model was told.
function withoutPersonsNames(
  kind: SectionKind,
  section: Section,
): {
  readonly section: Section;
  readonly dropped: number;
} {
  if (kind === 'employment_contract') {
    const { companyName, ...fields } = section.fields;
    if (companyName === undefined || isCompany(section.fields['employerType']?.value))
      return { section, dropped: 0 };
    return { section: { ...section, fields }, dropped: 1 };
  }
  if (kind !== 'employment_work_history') return { section, dropped: 0 };
  let dropped = 0;
  const contracts = (section.lists['contracts'] ?? []).map((row): ExtractedRow => {
    const { employerName, ...values } = row.values;
    if (employerName === undefined || isCompany(row.values['employerType'])) return row;
    dropped += 1;
    return { ...row, values };
  });
  return { section: { ...section, lists: { ...section.lists, contracts } }, dropped };
}

// The agreement and category of the most recent payslip that prints them, as fields of the
// payslips' section, so they merge like any other.
function withPayslipHeadings(section: Section): Section {
  const latest = [...(section.lists['payslips'] ?? [])].sort((a, b) =>
    String(b.values['month']).localeCompare(String(a.values['month'])),
  );
  const fields: Record<string, ExtractedField> = { ...section.fields };
  for (const name of ['agreementName', 'category']) {
    const row = latest.find((r) => typeof r.values[name] === 'string');
    if (row) fields[name] = { value: row.values[name] as string, confidence: row.confidence };
  }
  return { ...section, fields };
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

// Whether the model filled a list of a section it read up to the list's maximum. Counted on what
// it sent, before rows that failed validation were left out. The seventeen information elements
// are all there is to list, not a cut.
const WHOLE_AT_MAXIMUM: readonly string[] = ['information'];

function reachedMaximum(toolInput: unknown, reading: Reading): boolean {
  if (!isRecord(toolInput)) return false;
  return (
    Object.entries(EMPLOYMENT_SECTIONS) as [
      EmploymentSectionKind,
      (typeof EMPLOYMENT_SECTIONS)[EmploymentSectionKind],
    ][]
  ).some(([kind, schema]) => {
    const raw = toolInput[kind];
    if (!reading.sections[kind] || !isRecord(raw)) return false;
    return Object.entries(schema.lists).some(
      ([name, list]) =>
        !WHOLE_AT_MAXIMUM.includes(name) &&
        Array.isArray(raw[name]) &&
        raw[name].length >= list.maxItems,
    );
  });
}

export function employmentMerge(read: Reading, toolInput: unknown): EmploymentMerged {
  let dropped = 0;
  const sections: Partial<Record<SectionKind, Section>> = {};
  for (const [kind, section] of Object.entries(read.sections) as [SectionKind, Section][]) {
    const named = withoutPersonsNames(kind, section);
    const cleaned = withoutIdentifiers(named.section, FREE_TEXTS, leaks);
    sections[kind] =
      kind === 'employment_payslips' ? withPayslipHeadings(cleaned.section) : cleaned.section;
    dropped += named.dropped + cleaned.dropped;
  }
  const reading: Reading = { ...read, sections };
  const { fields, conflicts, discarded } = mergeFields(reading, EMPLOYMENT_MERGE_RULES);
  const lists: Partial<Record<EmploymentListName, MergedRow[]>> = {};
  for (const [kind, schema] of Object.entries(EMPLOYMENT_SECTIONS) as [
    EmploymentSectionKind,
    (typeof EMPLOYMENT_SECTIONS)[EmploymentSectionKind],
  ][]) {
    const section = reading.sections[kind];
    if (!section) continue;
    for (const name of Object.keys(schema.lists) as EmploymentListName[]) {
      const rows = section.lists[name];
      if (rows && rows.length > 0)
        lists[name] = rows.map((row) => ({ ...row, source: schema.source }));
    }
  }
  return {
    pages: reading.pages,
    documents: groupDocuments(reading.pages),
    fields,
    lists,
    conflicts,
    truncated: reachedMaximum(toolInput, read),
    discarded: discarded + dropped,
  };
}
