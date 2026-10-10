import type { Reading, Section } from './extraction';
import type { SectionKind } from './extraction-schema';
import { hasIdentifier, hasNumberPlate, hasPaymentCardNumber, hasPersonTitle } from './identifiers';
import {
  groupDocuments,
  listsReachedMaximum,
  mergeFields,
  own,
  withoutIdentifiers,
  type Conflict,
  type From,
  type MergedField,
  type MergedRow,
  type RecognisedDocument,
} from './merge';
import { MORTGAGE_SECTIONS, type MortgageSectionKind } from './mortgage-schema';
import { hasSpecialCategory } from './special-categories';

const fromDeed = own('mortgage_deed');

// For each field the response carries, where it may come from, preferred first. The deed comes
// before the FEIN, whose offer the deed may have changed.
export const MORTGAGE_MERGE_RULES = {
  deedOn: fromDeed,
  lenderName: fromDeed,
  borrowerType: fromDeed,
  purpose: fromDeed,
  loanKind: fromDeed,
  principal: own('mortgage_deed', 'fein'),
  termMonths: fromDeed,
  rateType: fromDeed,
  fixedUntil: fromDeed,
  initialRate: own('mortgage_deed', 'fein'),
  index: fromDeed,
  spread: fromDeed,
  rateRevisionMonths: fromDeed,
  floorPercent: fromDeed,
  defaultRate: fromDeed,
  defaultMarginPoints: fromDeed,
  earlyTerminationInstalments: fromDeed,
  prepaymentOption: fromDeed,
  variablePrepaymentFeePercent: fromDeed,
  fixedPrepaymentFeePercent: fromDeed,
  openingFee: fromDeed,
  openingFeePercent: fromDeed,
  otherSetUpFee: fromDeed,
  transparencyActStated: fromDeed,
  handwrittenStatement: fromDeed,
  feinDeliveredOn: [['fein', 'deliveredOn']],
  fiaeDeliveredOn: [['fiae', 'deliveredOn']],
  transparencyActOn: [['transparency_deed', 'actOn']],
  transparencyActCharged: [['transparency_deed', 'amountCharged']],
} as const satisfies Readonly<Record<string, readonly From[]>>;

export type MortgageFieldName = keyof typeof MORTGAGE_MERGE_RULES;

type ListsOf<K extends MortgageSectionKind> = keyof (typeof MORTGAGE_SECTIONS)[K]['lists'];
export type MortgageListName = {
  [K in MortgageSectionKind]: ListsOf<K>;
}[MortgageSectionKind] &
  string;

export interface MortgageMerged {
  readonly pages: Reading['pages'];
  readonly documents: readonly RecognisedDocument[];
  readonly fields: Readonly<Partial<Record<MortgageFieldName, MergedField>>>;
  readonly lists: Readonly<Partial<Record<MortgageListName, readonly MergedRow[]>>>;
  readonly conflicts: readonly Conflict<MortgageFieldName>[];
  // Some list came back at its maximum, so the documents may hold rows beyond it: the site says so.
  readonly truncated: boolean;
  // Values that lost to a preferred source without being sure of themselves, and names,
  // identifiers or health data the API would not keep: dropped, not shown.
  readonly discarded: number;
}

// Every text copied from the documents. A deed names its borrowers and guarantors and their
// documents, and a life insurance it requires can bring in health (art. 9 GDPR): a text that
// holds any of them goes.
const FREE_TEXTS = {
  fields: ['lenderName'],
  items: ['text', 'feeConcept'],
};

const leaks = (text: string): boolean =>
  hasIdentifier(text) ||
  hasPaymentCardNumber(text) ||
  hasNumberPlate(text) ||
  hasPersonTitle(text) ||
  hasSpecialCategory(text);

export function mortgageMerge(read: Reading, toolInput: unknown): MortgageMerged {
  let dropped = 0;
  const sections: Partial<Record<SectionKind, Section>> = {};
  for (const [kind, section] of Object.entries(read.sections) as [SectionKind, Section][]) {
    const cleaned = withoutIdentifiers(section, FREE_TEXTS, leaks);
    sections[kind] = cleaned.section;
    dropped += cleaned.dropped;
  }
  const reading: Reading = { ...read, sections };
  const { fields, conflicts, discarded } = mergeFields(reading, MORTGAGE_MERGE_RULES);
  const lists: Partial<Record<MortgageListName, MergedRow[]>> = {};
  for (const [kind, schema] of Object.entries(MORTGAGE_SECTIONS) as [
    MortgageSectionKind,
    (typeof MORTGAGE_SECTIONS)[MortgageSectionKind],
  ][]) {
    const section = reading.sections[kind];
    if (!section) continue;
    for (const name of Object.keys(schema.lists) as MortgageListName[]) {
      const rows = section.lists[name];
      if (rows && rows.length > 0) lists[name] = rows.map((row) => ({ ...row, source: kind }));
    }
  }
  return {
    pages: reading.pages,
    documents: groupDocuments(reading.pages),
    fields,
    lists,
    conflicts,
    truncated: listsReachedMaximum(toolInput, read, MORTGAGE_SECTIONS),
    discarded: discarded + dropped,
  };
}
