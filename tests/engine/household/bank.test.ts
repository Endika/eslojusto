import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseDate as f } from '../../../src/engine/date';
import type { HouseholdFinalPay } from '../../../src/engine/household/final-pay';
import { reviewHousehold } from '../../../src/engine/household/review';
import type { Assessed, Finding, HouseholdInput } from '../../../src/engine/household/types';
import { DEPS } from './input';

// The golden cases of the household engine (not document packs like the employment ones): each case's
// expected review names the rule it exercises and was checked by hand against the law. Inputs hold
// only dates, figures and yes/no answers, so no name or identifier appears in any of them.
const DIR = new URL('./cases/', import.meta.url);

type ExpectedFinding = {
  readonly id: string;
  readonly status: string;
  readonly amount?: { readonly min: number; readonly max: number };
};
type ExpectedPoint =
  | ExpectedFinding
  | {
      readonly id: string;
      readonly status: 'depends';
      readonly question: string;
      readonly readings: readonly ({ readonly when: string } & ExpectedFinding)[];
    };

interface BankCase {
  readonly id: string;
  readonly description: string;
  readonly today: string;
  readonly input: Omit<HouseholdInput, 'startDate' | 'termination'> & {
    readonly startDate: string;
    readonly termination:
      | (Omit<NonNullable<HouseholdInput['termination']>, 'noticeGivenOn' | 'effectiveOn'> & {
          readonly noticeGivenOn: string | null;
          readonly effectiveOn: string;
        })
      | null;
  };
  readonly expected: {
    readonly scope: unknown;
    readonly items: readonly ExpectedPoint[];
    readonly finalPay: unknown;
  };
}

const CASES: readonly BankCase[] = readdirSync(DIR)
  .filter((name) => name.endsWith('.json'))
  .sort()
  .map((name) => JSON.parse(readFileSync(new URL(name, DIR), 'utf8')) as BankCase);

const toInput = (c: BankCase['input']): HouseholdInput => ({
  ...c,
  startDate: f(c.startDate),
  termination:
    c.termination === null
      ? null
      : {
          ...c.termination,
          noticeGivenOn:
            c.termination.noticeGivenOn === null ? null : f(c.termination.noticeGivenOn),
          effectiveOn: f(c.termination.effectiveOn),
        },
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

const asFinalPay = (pay: HouseholdFinalPay | null): unknown =>
  pay === null
    ? null
    : pay.kind === 'monthly'
      ? { kind: 'monthly', items: pay.items.map((i) => ({ id: i.id, range: i.range })) }
      : pay.kind === 'hourly_external'
        ? { kind: 'hourly_external', included: pay.includedInHourlyPrice }
        : { kind: 'not_entered' };

describe('the synthetic bank of household cases', () => {
  it('holds 15 to 20 cases, every one explained', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(15);
    expect(CASES.length).toBeLessThanOrEqual(20);
    for (const c of CASES) expect(c.description.length, c.id).toBeGreaterThan(40);
  });

  it('covers the pay, the form of the desistimiento, severance, notice and the live-in rule', () => {
    const ids = new Set(CASES.flatMap((c) => c.expected.items.map((i) => i.id)));
    for (const id of [
      'smi_monthly',
      'smi_hourly_external',
      'smi_in_kind_cap',
      'desistimiento_written',
      'dismissal_presumed',
      'desistimiento_severance',
      'desistimiento_notice',
      'live_in_night_notice',
      'termination_causes',
      'unemployment_situation',
    ])
      expect(ids, id).toContain(id);
  });

  it.each(CASES.map((c) => [c.id, c] as const))('%s', (_, c) => {
    const result = reviewHousehold(toInput(c.input), f(c.today), DEPS);
    if (!result.ok) throw new Error(`invalid input: ${JSON.stringify(result.errors)}`);
    expect({
      scope: result.review.scope,
      items: result.review.items.map(asPoint),
      finalPay: asFinalPay(result.review.finalPay),
    }).toEqual(c.expected);
  });
});
