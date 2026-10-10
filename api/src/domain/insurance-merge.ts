import type { Reading, Section } from './extraction';
import type { SectionKind } from './extraction-schema';
import { hasIdentifier, hasNumberPlate, hasPaymentCardNumber } from './identifiers';
import { INSURANCE_SECTIONS, type InsuranceSectionKind } from './insurance-schema';
import {
  groupDocuments,
  mergeFields,
  own,
  sourcedLists,
  withoutIdentifiers,
  type Conflict,
  type From,
  type MergedField,
  type MergedRow,
  type RecognisedDocument,
} from './merge';
import { hasSpecialCategory } from './special-categories';

const fromPolicy = own('insurance_policy');
const fromNotice = own('insurance_renewal_notice');

// For each field the response carries, where it may come from, preferred first. A renewal notice
// is about the period that ends next, so its end date comes before the one an older policy prints.
export const INSURANCE_MERGE_RULES = {
  line: fromPolicy,
  carCover: fromPolicy,
  insurerName: fromPolicy,
  intermediaryType: fromPolicy,
  intermediaryCompanyName: fromPolicy,
  concludedOn: fromPolicy,
  effectiveOn: fromPolicy,
  expiresOn: own('insurance_renewal_notice', 'insurance_policy'),
  renews: fromPolicy,
  premiumNet: fromPolicy,
  premiumSurcharges: fromPolicy,
  premiumTaxes: fromPolicy,
  premiumTotal: fromPolicy,
  proportionalRuleExcluded: fromPolicy,
  proportionalRuleMarginPercent: fromPolicy,
  channel: fromPolicy,
  nonRenewalClauseText: fromPolicy,
  noticeOn: fromNotice,
  noticeMedium: fromNotice,
  previousPremium: fromNotice,
  newPremium: fromNotice,
  coverChanges: fromNotice,
  changesText: fromNotice,
} as const satisfies Readonly<Record<string, readonly From[]>>;

export type InsuranceFieldName = keyof typeof INSURANCE_MERGE_RULES;

type ListsOf<K extends InsuranceSectionKind> = keyof (typeof INSURANCE_SECTIONS)[K]['lists'];
export type InsuranceListName = {
  [K in InsuranceSectionKind]: ListsOf<K>;
}[InsuranceSectionKind] &
  string;

export interface InsuranceMerged {
  readonly pages: Reading['pages'];
  readonly documents: readonly RecognisedDocument[];
  readonly fields: Readonly<Partial<Record<InsuranceFieldName, MergedField>>>;
  readonly lists: Readonly<Partial<Record<InsuranceListName, readonly MergedRow[]>>>;
  readonly conflicts: readonly Conflict<InsuranceFieldName>[];
  // Values that lost to a preferred source without being sure of themselves, and names,
  // identifiers or health data the API would not keep: dropped, not shown.
  readonly discarded: number;
}

// Every text copied from the documents; one that tells about health, leave, union or debts goes
// with any identifier.
const FREE_TEXTS = {
  fields: ['insurerName', 'intermediaryCompanyName', 'nonRenewalClauseText', 'changesText'],
  items: ['concept'],
};

// A card or a car brings its number into a contract, a receipt or a notice too.
const leaks = (text: string): boolean =>
  hasIdentifier(text) ||
  hasPaymentCardNumber(text) ||
  hasNumberPlate(text) ||
  hasSpecialCategory(text);

// An intermediary's name is kept only for a company: an agent who is a person is personal data the
// review has no use for, whatever the model was told.
function withoutPersonsName(section: Section): {
  readonly section: Section;
  readonly dropped: number;
} {
  const { intermediaryCompanyName, ...fields } = section.fields;
  if (
    intermediaryCompanyName === undefined ||
    section.fields['intermediaryType']?.value === 'company'
  )
    return { section, dropped: 0 };
  return { section: { ...section, fields }, dropped: 1 };
}

export function insuranceMerge(read: Reading): InsuranceMerged {
  let dropped = 0;
  const sections: Partial<Record<SectionKind, Section>> = {};
  for (const [kind, section] of Object.entries(read.sections) as [SectionKind, Section][]) {
    const named = withoutPersonsName(section);
    const cleaned = withoutIdentifiers(named.section, FREE_TEXTS, leaks);
    sections[kind] = cleaned.section;
    dropped += named.dropped + cleaned.dropped;
  }
  const reading: Reading = { ...read, sections };
  const { fields, conflicts, discarded } = mergeFields(reading, INSURANCE_MERGE_RULES);
  const lists = sourcedLists<InsuranceListName>(reading, INSURANCE_SECTIONS);
  return {
    pages: reading.pages,
    documents: groupDocuments(reading.pages),
    fields,
    lists,
    conflicts,
    discarded: discarded + dropped,
  };
}
