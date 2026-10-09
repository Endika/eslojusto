import type { CivilDate } from '../date';
import type { LegalInterestTable } from '../law/interest';
import type { NormTable, SourceTable } from './norms';
import type { CaseLawRule, CaseLawRuleId } from './rules';

// `null` in any yes/no answer means «No lo sé». Amounts in euros, rates in % a year.

// What each invoice or tax form of the deed's day was for. The purchase's own costs are entered
// only to be told apart: this review never counts them.
export const INVOICE_KINDS = [
  'notary_loan',
  'notary_purchase',
  'notary_copy_bank',
  'notary_copy_borrower',
  'notary_cancellation',
  'registry_mortgage',
  'registry_purchase',
  'registry_cancellation',
  'agency',
  'valuation',
  'ajd_loan',
  'ajd_purchase',
  'transparency_deed',
] as const;

export type InvoiceKind = (typeof INVOICE_KINDS)[number];

export interface Invoice {
  readonly kind: InvoiceKind;
  // What was paid, outlays included; null when the person has neither the invoice nor the amount.
  readonly total: number | null;
  readonly paidBy: 'me' | 'bank' | 'unknown';
  // Null when unknown: interest then runs from the deed's day, marked as an estimate.
  readonly paidOn: CivilDate | null;
  // The invoice bills the purchase and the loan together without splitting them.
  readonly mixed: boolean;
  // Outlays an agency passed on inside its total (the tax, the registry…), each as it paid them.
  readonly supplied: readonly number[];
}

export type LoanKind =
  'standard' | 'developer_subrogation' | 'multicurrency' | 'reverse' | 'not_mortgage';

export type RateType = 'fixed' | 'variable' | 'mixed';

// Option of art. 23.5 LCCI the deed picks for a variable rate: 0,15 % for 5 years or 0,25 % for 3.
export type PrepaymentOption = 'a_015_5y' | 'b_025_3y' | 'unknown';

export type OperationKind =
  'partial_prepayment' | 'full_prepayment' | 'fixed_rate_novation' | 'creditor_subrogation';

export interface Operation {
  readonly on: CivilDate;
  readonly kind: OperationKind;
  readonly principal: number;
  readonly feeCharged: number;
  readonly hadInsurance: boolean | null;
}

export const CLAUSE_LABELS = [
  'floor_clause',
  'irph',
  'euribor',
  'default_interest',
  'early_termination',
  'rounding_up',
  'opening_fee',
  'prepayment_fee',
  'expenses_clause',
  'insurance_required',
] as const;

export type ClauseLabel = (typeof CLAUSE_LABELS)[number];

// A clause of the deed by its closed label and its figures. Its literal text is shown to the
// person and never reaches the engine.
export interface Clause {
  readonly label: ClauseLabel;
  readonly present: boolean | null;
  readonly floorPercent?: number;
  readonly defaultRate?: number;
  readonly ordinaryRate?: number;
}

export interface MortgageInput {
  // Day of the loan's deed before the notary.
  readonly deedOn: CivilDate;
  readonly borrower: 'individual' | 'company';
  // A home (with its garage or storage room) or a business.
  readonly purpose: 'housing' | 'business';
  // «¿Pediste la hipoteca como particular, para tu casa?»
  readonly consumer: boolean | null;
  readonly loanKind: LoanKind;
  readonly rateType: RateType;
  // Last day of the fixed stretch of a mixed rate.
  readonly fixedUntil: CivilDate | null;
  // Whether the deed has a clause putting the set-up costs on the borrower.
  readonly expensesClause: 'present' | 'absent' | 'unknown';
  readonly invoices: readonly Invoice[];
  // What the lender already gave back of the set-up costs, if anything.
  readonly alreadyReturned: number | null;
  // Whether the person and the lender reached an agreement on the set-up costs.
  readonly agreementOnExpenses: boolean | null;
  readonly prepaymentOption: PrepaymentOption | null;
  // Compensation percentages the deed sets, when it gives them.
  readonly deedPercents: { readonly variable?: number; readonly fixed?: number };
  readonly operations: readonly Operation[];
  readonly clauses: readonly Clause[];
}

export type OutOfScopeReason =
  | 'company'
  | 'business_purpose'
  | 'developer_subrogation'
  | 'multicurrency'
  | 'reverse'
  | 'not_mortgage';

export type Scope =
  { readonly inScope: true } | { readonly inScope: false; readonly reason: OutOfScopeReason };

// The tables the review reads, passed in by the composition root. A court's criterion comes in
// with its rulings, so reading one at its source changes no code here.
export interface MortgageDeps {
  readonly norms: NormTable;
  readonly sources: SourceTable;
  readonly criteria: Readonly<Record<CaseLawRuleId, CaseLawRule>>;
  readonly legalInterest: LegalInterestTable;
}
