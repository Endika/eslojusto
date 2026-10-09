import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type {
  CreditBankCase,
  CreditCaseInput,
  ExpectedCreditFinding,
  ExpectedCreditPoint,
  ExpectedCreditReview,
} from '../../../api/eval/credit-schema';
import { BE1904 } from '../../../src/engine/credit/data/be1904';
import { CREDIT_NORMS } from '../../../src/engine/credit/data/norms';
import { CREDIT_SOURCES } from '../../../src/engine/credit/data/sources';
import type { CreditFinding, CreditItem } from '../../../src/engine/credit/finding';
import { reviewCredit, type CreditReview } from '../../../src/engine/credit/review';
import { MENTION_LETTERS, type CreditInput } from '../../../src/engine/credit/types';
import { parseDate as f } from '../../../src/engine/date';

// The synthetic bank of credit packs doubles as golden cases for the engine: each case's expected
// review names the rule it exercises and was checked by hand against the law.
const DIR = new URL('../../../api/eval/cases/credit/', import.meta.url);
const CASES: readonly CreditBankCase[] = readdirSync(DIR)
  .filter((name) => name.endsWith('.json'))
  .sort()
  .map((name) => JSON.parse(readFileSync(new URL(name, DIR), 'utf8')) as CreditBankCase);

const orNull = (iso: string | null) => (iso === null ? null : f(iso));

const toInput = (c: CreditCaseInput): CreditInput => ({
  ...c,
  agreedOn: f(c.agreedOn),
  drawnOn: f(c.drawnOn),
  instalments:
    c.instalments === null
      ? null
      : c.instalments.kind === 'regular'
        ? { ...c.instalments, firstDueOn: f(c.instalments.firstDueOn) }
        : { kind: 'schedule', rows: c.instalments.rows.map((r) => ({ ...r, dueOn: f(r.dueOn) })) },
  balloon: c.balloon === null ? null : { ...c.balloon, dueOn: orNull(c.balloon.dueOn) },
  charges: c.charges.map((x) => ({ ...x, paidOn: f(x.paidOn) })),
  earlyRepayment:
    c.earlyRepayment === null
      ? null
      : {
          ...c.earlyRepayment,
          on: f(c.earlyRepayment.on),
          agreedEndOn: f(c.earlyRepayment.agreedEndOn),
        },
  infoReceivedOn: orNull(c.infoReceivedOn),
});

const asFinding = (x: CreditFinding): ExpectedCreditFinding => ({
  id: x.id,
  status: x.status,
  ...(x.amount !== null && { amount: x.amount }),
  ...(x.lastDay !== null && { lastDay: x.lastDay }),
  ...(x.daysLeft !== null && { daysLeft: x.daysLeft }),
  ...(x.detail !== null && { apr: x.detail.apr }),
});

const asPoint = (item: CreditItem): ExpectedCreditPoint =>
  item.kind === 'single'
    ? asFinding(item.finding)
    : {
        id: item.readings[0]?.finding.id ?? '',
        status: 'depends',
        question: item.question,
        readings: item.readings.map((r) => ({ when: r.when, ...asFinding(r.finding) })),
      };

const asExpected = (r: CreditReview): ExpectedCreditReview => ({
  scope: r.scope,
  items: r.items.map(asPoint),
  indicator:
    r.indicator === null
      ? null
      : {
          status: r.indicator.status,
          apr: r.indicator.apr,
          aprOrigin: r.indicator.aprOrigin,
          reference: r.indicator.reference,
          points: r.indicator.points,
        },
  information: r.information.map((b) => b.id),
  overCharged: r.totals.overCharged,
  offerPass: r.offerPass,
});

const DEPS = { norms: CREDIT_NORMS, sources: CREDIT_SOURCES, rates: BE1904 };

describe('the synthetic bank of credit packs', () => {
  it('holds 24 cases', () => {
    expect(CASES).toHaveLength(24);
  });

  it('answers only about mentions art. 16.2 LCC lists', () => {
    for (const c of CASES)
      for (const letter of Object.keys(c.expected.input.mentions))
        expect(MENTION_LETTERS, c.id).toContain(letter);
  });

  it.each(CASES.map((c) => [c.id, c] as const))('%s', (_, c) => {
    const result = reviewCredit(toInput(c.expected.input), f(c.today), DEPS);
    if (!result.ok) throw new Error(`invalid input: ${JSON.stringify(result.errors)}`);
    expect(asExpected(result.review)).toEqual(c.expected.review);
  });
});
