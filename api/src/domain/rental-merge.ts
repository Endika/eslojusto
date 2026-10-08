import type { Reading, Section } from './extraction';
import type { SectionKind } from './extraction-schema';
import {
  groupDocuments,
  mergeFields,
  own,
  type Conflict,
  type From,
  type MergedField,
  type MergedRow,
  type RecognisedDocument,
  withoutIdentifiers,
} from './merge';
import { RENTAL_SECTIONS, type RentalSectionKind } from './rental-schema';

const fromLease = own('lease');
const fromReturn = own('deposit_return');

// For each field the response carries, where it may come from, preferred first. The deposit the
// contract sets comes before the one a return document says was held.
export const RENTAL_MERGE_RULES = {
  signedOn: fromLease,
  startDate: fromLease,
  postcode: fromLease,
  landlordType: fromLease,
  landlordCompanyName: fromLease,
  agencyNamed: fromLease,
  use: fromLease,
  agreedMonths: fromLease,
  initialRent: fromLease,
  updateClauseText: fromLease,
  updateClauseIndex: fromLease,
  updateFixedPercent: fromLease,
  deposit: own('lease', 'deposit_return'),
  advanceMonths: fromLease,
  necessityClause: fromLease,
  feesText: fromLease,
  chargesClauseText: fromLease,
  keysReturnedOn: fromReturn,
  closingDocumentSigned: fromReturn,
} as const satisfies Readonly<Record<string, readonly From[]>>;

export type RentalFieldName = keyof typeof RENTAL_MERGE_RULES;

type ListsOf<K extends RentalSectionKind> = keyof (typeof RENTAL_SECTIONS)[K]['lists'];
export type RentalListName = {
  [K in RentalSectionKind]: ListsOf<K>;
}[RentalSectionKind] &
  string;

export interface RentalMerged {
  readonly pages: Reading['pages'];
  readonly documents: readonly RecognisedDocument[];
  readonly fields: Readonly<Partial<Record<RentalFieldName, MergedField>>>;
  readonly lists: Readonly<Partial<Record<RentalListName, readonly MergedRow[]>>>;
  readonly conflicts: readonly Conflict<RentalFieldName>[];
  // Values that lost to a preferred source without being sure of themselves, and names a lease
  // gave for a landlord who is no company: dropped, not shown.
  readonly discarded: number;
}

// The landlord's name is kept only for a company: a person's name is personal data the review
// has no use for, whatever the model was told.
function withoutPersonsName(lease: Section): {
  readonly section: Section;
  readonly dropped: number;
} {
  const { landlordCompanyName, ...fields } = lease.fields;
  if (landlordCompanyName === undefined || lease.fields['landlordType']?.value === 'company')
    return { section: lease, dropped: 0 };
  return { section: { ...lease, fields }, dropped: 1 };
}

// Texts copied from a lease, an invoice or a deposit return.
const FREE_TEXTS = {
  fields: ['updateClauseText', 'chargesClauseText', 'feesText', 'landlordCompanyName'],
  items: ['concept'],
};

export function rentalMerge(read: Reading): RentalMerged {
  let dropped = 0;
  const sections: Partial<Record<SectionKind, Section>> = {};
  for (const [kind, section] of Object.entries(read.sections) as [SectionKind, Section][]) {
    const named = kind === 'lease' ? withoutPersonsName(section) : { section, dropped: 0 };
    const cleaned = withoutIdentifiers(named.section, FREE_TEXTS);
    sections[kind] = cleaned.section;
    dropped += named.dropped + cleaned.dropped;
  }
  const reading: Reading = { ...read, sections };
  const { fields, conflicts, discarded } = mergeFields(reading, RENTAL_MERGE_RULES);
  const lists: Partial<Record<RentalListName, MergedRow[]>> = {};
  for (const [kind, schema] of Object.entries(RENTAL_SECTIONS) as [
    RentalSectionKind,
    (typeof RENTAL_SECTIONS)[RentalSectionKind],
  ][]) {
    const section = reading.sections[kind];
    if (!section) continue;
    for (const name of Object.keys(schema.lists) as RentalListName[]) {
      const rows = section.lists[name];
      if (rows && rows.length > 0)
        lists[name] = [...(lists[name] ?? []), ...rows.map((row) => ({ ...row, source: kind }))];
    }
  }
  return {
    pages: reading.pages,
    documents: groupDocuments(reading.pages),
    fields,
    lists,
    conflicts,
    discarded: discarded + dropped,
  };
}
