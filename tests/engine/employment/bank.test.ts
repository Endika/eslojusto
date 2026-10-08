import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type {
  EmploymentBankCase,
  EmploymentCaseInput,
  ExpectedEmploymentReview,
  ExpectedFinding,
  ExpectedPoint,
} from '../../../api/eval/employment-schema';
import { parseDate as f } from '../../../src/engine/date';
import { MINIMUM_WAGE } from '../../../src/engine/employment/data/minimum-wage';
import { EMPLOYMENT_NORMS } from '../../../src/engine/employment/data/norms';
import { reviewEmployment, type EmploymentReview } from '../../../src/engine/employment/review';
import type { Assessed, EmploymentInput, Finding } from '../../../src/engine/employment/types';

// The synthetic bank of employment packs doubles as golden cases for the engine: each case's
// expected review names the rule it exercises and was checked by hand against the law.
const DIR = new URL('../../../api/eval/cases/employment/', import.meta.url);
const CASES: readonly EmploymentBankCase[] = readdirSync(DIR)
  .filter((name) => name.endsWith('.json'))
  .sort()
  .map((name) => JSON.parse(readFileSync(new URL(name, DIR), 'utf8')) as EmploymentBankCase);

const orNull = (iso: string | null) => (iso === null ? null : f(iso));

const toInput = (c: EmploymentCaseInput): EmploymentInput => ({
  ...c,
  startDate: f(c.startDate),
  endDate: orNull(c.endDate),
  signedOn: orNull(c.signedOn),
  training:
    c.training === null
      ? null
      : { ...c.training, studiesEndedOn: orNull(c.training.studiesEndedOn) },
  history:
    c.history === null
      ? null
      : c.history.map((p) => ({ ...p, startDate: f(p.startDate), endDate: f(p.endDate) })),
});

const asFinding = ({ id, status, amount }: Finding): ExpectedFinding =>
  amount === null ? { id, status } : { id, status, amount };

const asPoint = (a: Assessed): ExpectedPoint =>
  a.kind === 'single'
    ? asFinding(a.finding)
    : {
        id: a.readings[0]?.finding.id ?? '',
        status: 'depends',
        question: a.question,
        readings: a.readings.map((r) => ({ when: r.when, ...asFinding(r.finding) })),
      };

function asExpected(review: EmploymentReview): ExpectedEmploymentReview {
  const duty = review.informationDuty;
  return {
    scope: review.scope,
    items: review.items.map(asPoint),
    clauses: review.clauses.map((c) => ({
      label: c.label,
      point: c.assessed === null ? null : asPoint(c.assessed),
      checkedIn: c.checkedIn?.id ?? null,
    })),
    informationDuty:
      duty === null
        ? null
        : duty.applies
          ? {
              applies: true,
              moment: duty.moment,
              flagged: duty.elements.flatMap((e) =>
                e.applies && e.finding.status !== 'within_limit'
                  ? [{ element: e.element, status: e.finding.status }]
                  : [],
              ),
            }
          : { applies: false, reason: duty.reason },
    offer: review.offer,
    offerPass: review.offerPass,
  };
}

const DEPS = { norms: EMPLOYMENT_NORMS, minimumWage: MINIMUM_WAGE };

describe('the synthetic bank of employment packs', () => {
  it('holds 30 to 40 cases', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(30);
    expect(CASES.length).toBeLessThanOrEqual(40);
  });

  it.each(CASES.map((c) => [c.id, c] as const))('%s', (_, c) => {
    const result = reviewEmployment(toInput(c.expected.input), f(c.today), DEPS);
    if (!result.ok) throw new Error(`invalid input: ${JSON.stringify(result.errors)}`);
    expect(asExpected(result.review)).toEqual(c.expected.review);
  });
});
