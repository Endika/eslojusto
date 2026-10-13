import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type {
  ExpectedMortgageExpense,
  ExpectedMortgageFee,
  ExpectedMortgageFeeFinding,
  ExpectedMortgageFlag,
  ExpectedMortgageReview,
  MortgageBankCase,
  MortgageCaseInput,
} from '../../../api/eval/mortgage-schema';
import { parseDate as f } from '../../../src/engine/date';
import type { ExpenseItem } from '../../../src/engine/mortgage/expenses';
import type { FeeFinding, FeeItem } from '../../../src/engine/mortgage/fees';
import type { ClauseFlag } from '../../../src/engine/mortgage/flags';
import { reviewMortgage, type MortgageReview } from '../../../src/engine/mortgage/review';
import type { MortgageInput } from '../../../src/engine/mortgage/types';
import { DEPS } from './input';

// The synthetic bank of mortgage packs doubles as golden cases for the engine: each case's
// expected review names the rule it exercises and was worked out by hand from the law.
const DIR = new URL('../../../api/eval/cases/mortgage/', import.meta.url);
const CASES: readonly MortgageBankCase[] = readdirSync(DIR)
  .filter((name) => name.endsWith('.json'))
  .sort()
  .map((name) => JSON.parse(readFileSync(new URL(name, DIR), 'utf8')) as MortgageBankCase);

const orNull = (iso: string | null) => (iso === null ? null : f(iso));

const toInput = (c: MortgageCaseInput): MortgageInput => ({
  ...c,
  deedOn: f(c.deedOn),
  fixedUntil: orNull(c.fixedUntil),
  invoices: c.invoices.map((i) => ({ ...i, paidOn: orNull(i.paidOn) })),
  invoicesAtHand: true,
  operations: c.operations.map((o) => ({ ...o, on: f(o.on) })),
});

const keys = (phrases: readonly { readonly key: string }[]) => phrases.map((p) => p.key);

const asExpense = (x: ExpenseItem): ExpectedMortgageExpense => ({
  kind: x.kind,
  basis: x.basis,
  status: x.status,
  share: x.share,
  amount: x.amount,
  interest: x.interest,
  phrases: keys(x.calculation),
});

const asFee = (x: FeeFinding): ExpectedMortgageFeeFinding => ({
  kind: x.kind,
  status: x.status,
  capPercent: x.capPercent,
  cap: x.cap,
  amount: x.amount,
  phrases: keys(x.calculation),
});

const asFeeItem = (item: FeeItem): ExpectedMortgageFee =>
  item.kind === 'single'
    ? asFee(item.finding)
    : {
        status: 'depends',
        question: item.question,
        readings: item.readings.map((r) => ({ when: r.when, ...asFee(r.finding) })),
      };

const asFlag = (x: ClauseFlag): ExpectedMortgageFlag => ({
  label: x.label,
  state: x.state,
  phrases: keys(x.calculation),
  parts: x.parts.map((p) => ({ basis: p.basis, rule: p.rule, phrases: keys(p.calculation) })),
});

const asExpected = (r: MortgageReview): ExpectedMortgageReview => ({
  scope: r.scope,
  expenses: r.expenses.items.map(asExpense),
  fees: r.fees.map(asFeeItem),
  flags: r.flags.map(asFlag),
  information: r.information.map((b) => b.id),
  totals: {
    statute: r.totals.statute.principal,
    caseLaw: r.totals.caseLaw.principal,
    caseLawInterest: r.totals.caseLaw.interest,
    fees: r.totals.fees,
  },
  offerPass: r.offerPass,
});

describe('the synthetic bank of mortgage packs', () => {
  it('holds 31 cases', () => {
    expect(CASES).toHaveLength(31);
  });

  it.each(CASES.map((c) => [c.id, c] as const))('%s', (_, c) => {
    const result = reviewMortgage(toInput(c.expected.input), f(c.today), DEPS);
    if (!result.ok) throw new Error(`invalid input: ${JSON.stringify(result.errors)}`);
    expect(asExpected(result.review)).toEqual(c.expected.review);
  });
});
