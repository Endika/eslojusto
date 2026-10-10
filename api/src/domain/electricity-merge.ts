import { ELECTRICITY_SECTIONS, type ElectricitySectionKind } from './electricity-schema';
import type { Reading, Section } from './extraction';
import type { SectionKind } from './extraction-schema';
import { hasIdentifier, hasPaymentCardNumber, hasSupplyNumber } from './identifiers';
import {
  groupDocuments,
  mergeFields,
  own,
  listsReachedMaximum,
  sourcedLists,
  withoutIdentifiers,
  type Conflict,
  type From,
  type MergedField,
  type MergedRow,
  type RecognisedDocument,
} from './merge';
import { hasSpecialCategory } from './special-categories';

const fromContract = own('electricity_contract');
const fromNotice = own('price_change_notice');

// The contract's and the notice's fields, each from its only source. A bill's figures stay in its
// own row of `bills`, so two bills never conflict: they are two periods, not two accounts of one.
export const ELECTRICITY_MERGE_RULES = {
  signedOn: fromContract,
  retailerName: fromContract,
  priceType: fromContract,
  durationMonths: fromContract,
  renews: fromContract,
  exitPenaltyText: fromContract,
  noticeSentOn: [['price_change_notice', 'sentOn']],
  noticeAppliesFrom: [['price_change_notice', 'appliesFrom']],
  separateFromBill: fromNotice,
} as const satisfies Readonly<Record<string, readonly From[]>>;

export type ElectricityFieldName = keyof typeof ELECTRICITY_MERGE_RULES;

type ListsOf<K extends ElectricitySectionKind> = keyof (typeof ELECTRICITY_SECTIONS)[K]['lists'];
export type ElectricityListName = {
  [K in ElectricitySectionKind]: ListsOf<K>;
}[ElectricitySectionKind] &
  string;

export interface ElectricityMerged {
  readonly pages: Reading['pages'];
  readonly documents: readonly RecognisedDocument[];
  readonly fields: Readonly<Partial<Record<ElectricityFieldName, MergedField>>>;
  readonly lists: Readonly<Partial<Record<ElectricityListName, readonly MergedRow[]>>>;
  readonly conflicts: readonly Conflict<ElectricityFieldName>[];
  // Some list came back at its maximum, so the documents may hold rows beyond it: the site says so.
  readonly truncated: boolean;
  // Values that lost to a preferred source without being sure of themselves, and identifiers or
  // health data the API would not keep: dropped, not shown.
  readonly discarded: number;
}

// Every text copied from the documents. A service can be an insurance that brings health into a
// concept; a CUPS copied into a text goes like any other identifier.
const FREE_TEXTS = {
  fields: ['retailerName', 'exitPenaltyText'],
  items: ['retailerName', 'invoiceNumber', 'concept'],
};

const leaks = (text: string): boolean =>
  hasIdentifier(text) ||
  hasPaymentCardNumber(text) ||
  hasSupplyNumber(text) ||
  hasSpecialCategory(text);

export function electricityMerge(read: Reading, toolInput: unknown): ElectricityMerged {
  let dropped = 0;
  const sections: Partial<Record<SectionKind, Section>> = {};
  for (const [kind, section] of Object.entries(read.sections) as [SectionKind, Section][]) {
    const cleaned = withoutIdentifiers(section, FREE_TEXTS, leaks);
    sections[kind] = cleaned.section;
    dropped += cleaned.dropped;
  }
  const reading: Reading = { ...read, sections };
  const { fields, conflicts, discarded } = mergeFields(reading, ELECTRICITY_MERGE_RULES);
  return {
    pages: reading.pages,
    documents: groupDocuments(reading.pages),
    fields,
    lists: sourcedLists<ElectricityListName>(reading, ELECTRICITY_SECTIONS),
    conflicts,
    truncated: listsReachedMaximum(toolInput, read, ELECTRICITY_SECTIONS),
    discarded: discarded + dropped,
  };
}
