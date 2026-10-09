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

// A synthetic consumer's variable-rate mortgage on a home, deed of 10-05-2012 with a clause putting
// the set-up costs on the borrower; tests override what they check.
export const mortgage = (change: Partial<MortgageInput> = {}): MortgageInput => ({
  deedOn: parseDate('2012-05-10'),
  borrower: 'individual',
  purpose: 'housing',
  consumer: true,
  loanKind: 'standard',
  rateType: 'variable',
  fixedUntil: null,
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

const allRead = Object.fromEntries(
  Object.entries(MORTGAGE_SOURCES).map(([id, s]) => [id, { ...s, verified: true }]),
) as SourceTable;

// The tables as they will stand once the Supreme Court rulings are opened in CENDOJ and the split
// and its interest are marked to give figures.
export const READ_DEPS: MortgageDeps = {
  ...DEPS,
  sources: allRead,
  criteria: {
    ...CASE_LAW_RULES,
    expenses_ts_split: { ...CASE_LAW_RULES.expenses_ts_split, output: 'amount' },
    expenses_interest: { ...CASE_LAW_RULES.expenses_interest, output: 'amount' },
  },
};
