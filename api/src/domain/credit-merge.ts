import { CREDIT_SECTIONS, type CreditSectionKind } from './credit-schema';
import type { Reading, Section } from './extraction';
import type { SectionKind } from './extraction-schema';
import { hasIdentifier, hasNumberPlate, hasPaymentCardNumber } from './identifiers';
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
import { hasSpecialCategory } from './special-categories';

const fromAgreement = own('credit_agreement');
const fromStatement = own('early_repayment_statement');
const fromCard = own('revolving_agreement');

// For each field the response carries, where it may come from, preferred first. The contract comes
// before the information given ahead of it, and a revolving card's own contract before either.
export const CREDIT_MERGE_RULES = {
  product: fromAgreement,
  lenderName: own('credit_agreement', 'revolving_agreement'),
  intermediaryType: own('credit_agreement', 'revolving_agreement'),
  intermediaryCompanyName: own('credit_agreement', 'revolving_agreement'),
  agreedOn: own('credit_agreement', 'revolving_agreement'),
  principal: own('credit_agreement', 'credit_precontract_info'),
  netDisbursed: fromAgreement,
  cashPrice: fromAgreement,
  goods: fromAgreement,
  nominalRate: own('credit_agreement', 'revolving_agreement', 'credit_precontract_info'),
  rateType: fromAgreement,
  declaredApr: own('credit_agreement', 'revolving_agreement', 'credit_precontract_info'),
  declaredTotalPayable: own('credit_agreement', 'credit_precontract_info'),
  instalmentCount: own('credit_agreement', 'credit_precontract_info'),
  instalmentAmount: own('credit_agreement', 'credit_precontract_info'),
  firstDueOn: fromAgreement,
  balloonAmount: fromAgreement,
  balloonDueOn: fromAgreement,
  // The statement of an early repayment restates the end the contract set.
  agreedEndOn: own('early_repayment_statement', 'credit_agreement'),
  insurancePremium: fromAgreement,
  insuranceSingle: fromAgreement,
  insuranceFinanced: fromAgreement,
  insuranceRequired: fromAgreement,
  earlyRepaymentClauseText: fromAgreement,
  withdrawalClauseText: fromAgreement,
  precontractDeliveredOn: [['credit_precontract_info', 'deliveredOn']],
  repaidOn: fromStatement,
  principalRepaid: fromStatement,
  interestSettled: fromStatement,
  compensationCharged: fromStatement,
  compensationConcept: fromStatement,
  premiumRefunded: fromStatement,
  paidByInsurance: fromStatement,
  discountLost: fromStatement,
  creditLimit: fromCard,
  minimumPayment: fromCard,
  minimumPaymentPercent: fromCard,
  annualFee: fromCard,
  paymentMode: fromCard,
} as const satisfies Readonly<Record<string, readonly From[]>>;

export type CreditFieldName = keyof typeof CREDIT_MERGE_RULES;

type ListsOf<K extends CreditSectionKind> = keyof (typeof CREDIT_SECTIONS)[K]['lists'];
export type CreditListName = {
  [K in CreditSectionKind]: ListsOf<K>;
}[CreditSectionKind] &
  string;

export interface CreditMerged {
  readonly pages: Reading['pages'];
  readonly documents: readonly RecognisedDocument[];
  readonly fields: Readonly<Partial<Record<CreditFieldName, MergedField>>>;
  readonly lists: Readonly<Partial<Record<CreditListName, readonly MergedRow[]>>>;
  readonly conflicts: readonly Conflict<CreditFieldName>[];
  // Some list came back at its maximum, so the documents may hold rows beyond it: the site says so.
  readonly truncated: boolean;
  // Values that lost to a preferred source without being sure of themselves, and names,
  // identifiers or health data the API would not keep: dropped, not shown.
  readonly discarded: number;
}

// Every text copied from the documents. A linked insurance can bring a borrower's health into a
// contract (art. 9 GDPR): a text that tells about health, leave, union or debts goes with any
// identifier.
const FREE_TEXTS = {
  fields: [
    'lenderName',
    'intermediaryCompanyName',
    'goods',
    'earlyRepaymentClauseText',
    'withdrawalClauseText',
    'compensationConcept',
  ],
  items: ['concept'],
};

// A card or a car brings its number into a contract, a receipt or a notice too.
const leaks = (text: string): boolean =>
  hasIdentifier(text) ||
  hasPaymentCardNumber(text) ||
  hasNumberPlate(text) ||
  hasSpecialCategory(text);

// An intermediary's name is kept only for a company: a person's name is personal data the review
// has no use for, whatever the model was told.
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

// A representative example's figures are not this credit's: only its delivery date is kept.
function ownFigures(section: Section): Section {
  if (section.fields['representativeExample']?.value !== true) return section;
  const { deliveredOn } = section.fields;
  return { ...section, fields: deliveredOn === undefined ? {} : { deliveredOn } };
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

// Whether the model filled a list of a section it read up to the list's maximum. Counted on what
// it sent, before rows that failed validation were left out.
function reachedMaximum(toolInput: unknown, reading: Reading): boolean {
  if (!isRecord(toolInput)) return false;
  return (
    Object.entries(CREDIT_SECTIONS) as [
      CreditSectionKind,
      (typeof CREDIT_SECTIONS)[CreditSectionKind],
    ][]
  ).some(([kind, schema]) => {
    const raw = toolInput[kind];
    if (!reading.sections[kind] || !isRecord(raw)) return false;
    return Object.entries(schema.lists).some(
      ([name, list]) => Array.isArray(raw[name]) && raw[name].length >= list.maxItems,
    );
  });
}

export function creditMerge(read: Reading, toolInput: unknown): CreditMerged {
  let dropped = 0;
  const sections: Partial<Record<SectionKind, Section>> = {};
  for (const [kind, section] of Object.entries(read.sections) as [SectionKind, Section][]) {
    const named = withoutPersonsName(
      kind === 'credit_precontract_info' ? ownFigures(section) : section,
    );
    const cleaned = withoutIdentifiers(named.section, FREE_TEXTS, leaks);
    sections[kind] = cleaned.section;
    dropped += named.dropped + cleaned.dropped;
  }
  const reading: Reading = { ...read, sections };
  const { fields, conflicts, discarded } = mergeFields(reading, CREDIT_MERGE_RULES);
  const lists: Partial<Record<CreditListName, MergedRow[]>> = {};
  for (const [kind, schema] of Object.entries(CREDIT_SECTIONS) as [
    CreditSectionKind,
    (typeof CREDIT_SECTIONS)[CreditSectionKind],
  ][]) {
    const section = reading.sections[kind];
    if (!section) continue;
    for (const name of Object.keys(schema.lists) as CreditListName[]) {
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
    truncated: reachedMaximum(toolInput, read),
    discarded: discarded + dropped,
  };
}
