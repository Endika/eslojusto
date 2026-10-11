import { parseDate } from '../../../src/engine/date';
import { LEGAL_INTEREST } from '../../../src/engine/law/data/legal-interest';
import { MORTGAGE_NORMS } from '../../../src/engine/mortgage/data/norms';
import { MORTGAGE_SOURCES } from '../../../src/engine/mortgage/data/sources';
import type { SourceTable } from '../../../src/engine/mortgage/norms';
import { CASE_LAW_RULES } from '../../../src/engine/mortgage/rules';
import type {
  Invoice,
  InvoiceKind,
  MortgageDeps,
  MortgageInput,
} from '../../../src/engine/mortgage/types';

// A synthetic consumer's variable-rate mortgage on a home, revised yearly, deed of 10-05-2012 with a
// clause putting the set-up costs on the borrower; tests override what they check.
export const mortgage = (change: Partial<MortgageInput> = {}): MortgageInput => ({
  deedOn: parseDate('2012-05-10'),
  borrower: 'individual',
  purpose: 'housing',
  consumer: true,
  loanKind: 'standard',
  rateType: 'variable',
  fixedUntil: null,
  rateRevisionMonths: 12,
  loanAmount: null,
  expensesClause: 'present',
  invoices: [],
  alreadyReturned: null,
  agreementOnExpenses: false,
  prepaymentOption: null,
  deedPercents: {},
  operations: [],
  clauses: [],
  ...change,
});

export const invoice = (
  kind: InvoiceKind,
  total: number | null,
  change: Partial<Invoice> = {},
): Invoice => ({
  kind,
  total,
  paidBy: 'me',
  paidOn: null,
  mixed: false,
  supplied: [],
  ...change,
});

export const TODAY = parseDate('2026-10-09');

export const DEPS: MortgageDeps = {
  norms: MORTGAGE_NORMS,
  sources: MORTGAGE_SOURCES,
  criteria: CASE_LAW_RULES,
  legalInterest: LEGAL_INTEREST,
};

// The tables as they would stand if the Supreme Court rulings were unread again: the split and its
// interest fall back to explaining, without a figure.
export const UNREAD_DEPS: MortgageDeps = {
  ...DEPS,
  sources: Object.fromEntries(
    Object.entries(MORTGAGE_SOURCES).map(([id, s]) => [
      id,
      s.basis === 'case_law' && s.court.startsWith('Tribunal Supremo')
        ? { ...s, verified: false }
        : s,
    ]),
  ) as SourceTable,
};
