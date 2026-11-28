import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type {
  ExpectedInsuranceReview,
  InsuranceBankCase,
  InsuranceCaseInput,
} from '../../../api/eval/insurance-schema';
import { parseDate as f } from '../../../src/engine/date';
import { INSURANCE_NORMS } from '../../../src/engine/insurance/data/norms';
import { reviewInsurance, type InsuranceReview } from '../../../src/engine/insurance/review';
import type { InsuranceInput } from '../../../src/engine/insurance/types';

// The synthetic bank of insurance packs doubles as golden cases for the engine: each case's
// expected review names the rule it exercises and was checked by hand against the law.
const DIR = new URL('../../../api/eval/cases/insurance/', import.meta.url);
const CASES: readonly InsuranceBankCase[] = readdirSync(DIR)
  .filter((name) => name.endsWith('.json'))
  .sort()
  .map((name) => JSON.parse(readFileSync(new URL(name, DIR), 'utf8')) as InsuranceBankCase);

const orNull = (iso: string | null) => (iso === null ? null : f(iso));

const toInput = (c: InsuranceCaseInput): InsuranceInput => ({
  ...c,
  expiresOn: f(c.expiresOn),
  notice: c.notice === null ? null : { ...c.notice, receivedOn: f(c.notice.receivedOn) },
  concludedOn: orNull(c.concludedOn),
  policyReceivedOn: orNull(c.policyReceivedOn),
});

const asExpected = (r: InsuranceReview): ExpectedInsuranceReview => ({
  scope: r.scope,
  findings: r.findings.map(({ id, status, lastDay, daysLeft }) => ({
    id,
    status,
    lastDay,
    daysLeft,
  })),
  information: r.information.map((b) => b.id),
  offerPass: r.offerPass,
});

describe('the synthetic bank of insurance packs', () => {
  it('holds 10 cases', () => {
    expect(CASES).toHaveLength(10);
  });

  it.each(CASES.map((c) => [c.id, c] as const))('%s', (_, c) => {
    const result = reviewInsurance(toInput(c.expected.input), f(c.today), {
      norms: INSURANCE_NORMS,
    });
    if (!result.ok) throw new Error(`invalid input: ${JSON.stringify(result.errors)}`);
    expect(asExpected(result.review)).toEqual(c.expected.review);
  });
});
