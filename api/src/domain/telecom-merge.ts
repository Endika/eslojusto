import type { Reading, Section } from './extraction';
import type { SectionKind } from './extraction-schema';
import { hasDeviceNumber, hasIdentifier, hasPaymentCardNumber } from './identifiers';
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
import { TELECOM_SECTIONS, type TelecomSectionKind } from './telecom-schema';

const fromContract = own('telecom_contract');

// The contract's fields; each bill keeps its own row of `bills`.
export const TELECOM_MERGE_RULES = {
  signedOn: fromContract,
  operatorName: fromContract,
  commitmentStartsOn: fromContract,
  commitmentMonths: fromContract,
  agreedPenalty: fromContract,
  penaltyText: fromContract,
  handsetSubsidised: fromContract,
  handsetValue: fromContract,
  priceReviewText: fromContract,
  priceReviewIndex: fromContract,
} as const satisfies Readonly<Record<string, readonly From[]>>;

export type TelecomFieldName = keyof typeof TELECOM_MERGE_RULES;

type ListsOf<K extends TelecomSectionKind> = keyof (typeof TELECOM_SECTIONS)[K]['lists'];
export type TelecomListName = {
  [K in TelecomSectionKind]: ListsOf<K>;
}[TelecomSectionKind] &
  string;

export interface TelecomMerged {
  readonly pages: Reading['pages'];
  readonly documents: readonly RecognisedDocument[];
  readonly fields: Readonly<Partial<Record<TelecomFieldName, MergedField>>>;
  readonly lists: Readonly<Partial<Record<TelecomListName, readonly MergedRow[]>>>;
  readonly conflicts: readonly Conflict<TelecomFieldName>[];
  // Some list came back at its maximum, so the documents may hold rows beyond it: the site says so.
  readonly truncated: boolean;
  // Identifiers or health data the API would not keep: dropped, not shown.
  readonly discarded: number;
}

// Every text copied from the documents. A bill's concept can name the number a call went to, or
// the IMEI of a handset paid in instalments.
const FREE_TEXTS = {
  fields: ['operatorName', 'penaltyText', 'priceReviewText'],
  items: ['operatorName', 'concept'],
};

const leaks = (text: string): boolean =>
  hasIdentifier(text) ||
  hasPaymentCardNumber(text) ||
  hasDeviceNumber(text) ||
  hasSpecialCategory(text);

export function telecomMerge(read: Reading, toolInput: unknown): TelecomMerged {
  let dropped = 0;
  const sections: Partial<Record<SectionKind, Section>> = {};
  for (const [kind, section] of Object.entries(read.sections) as [SectionKind, Section][]) {
    const cleaned = withoutIdentifiers(section, FREE_TEXTS, leaks);
    sections[kind] = cleaned.section;
    dropped += cleaned.dropped;
  }
  const reading: Reading = { ...read, sections };
  const { fields, conflicts, discarded } = mergeFields(reading, TELECOM_MERGE_RULES);
  return {
    pages: reading.pages,
    documents: groupDocuments(reading.pages),
    fields,
    lists: sourcedLists<TelecomListName>(reading, TELECOM_SECTIONS),
    conflicts,
    truncated: listsReachedMaximum(toolInput, read, TELECOM_SECTIONS),
    discarded: discarded + dropped,
  };
}
