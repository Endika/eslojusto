import { describe, expect, it } from 'vitest';
import { parseDate } from '../../../src/engine/date';
import { round2 } from '../../../src/engine/money';
import { assessSeverance, severanceFigures } from '../../../src/engine/household/severance';
import { NORMS } from './norms-table';
import type { HouseholdInput, HouseholdTermination } from '../../../src/engine/household/types';
import { desistimiento, household, DEPS } from './input';

// 1.500 × 12 + 2 × 1.500 = 21.000 € a year, 21.000 / 365 a day.
const ANNUAL = 21_000;
const DAILY = ANNUAL / 365;
const START = parseDate('2020-03-01');

const figures = (end: string) => severanceFigures(START, parseDate(end), ANNUAL);

describe('severance of a desistimiento: 12 days a year (art. 11.2)', () => {
  it('counts complete years only: 12 days each, at the year over 365 days', () => {
    const f = figures('2026-02-28');
    expect(f.completeYears).toBe(6);
    expect(f.completeYearsOnly.days).toBe(72);
    expect(f.completeYearsOnly.amount).toBe(round2(72 * DAILY));
    expect(f.completeYearsOnly.capped).toBe(false);
  });

  it('has no complete year the day before the anniversary and one on it', () => {
    expect(figures('2021-02-27').completeYears).toBe(0);
    expect(figures('2021-02-28').completeYears).toBe(1);
  });

  it('keeps the six-month cap out of reach at 6 and 7 years: 72 and 84 days', () => {
    expect(figures('2026-02-28').completeYearsOnly.capped).toBe(false);
    const seven = figures('2027-02-28');
    expect(seven.completeYears).toBe(7);
    expect(seven.completeYearsOnly.days).toBe(84);
    expect(seven.completeYearsOnly.capped).toBe(false);
  });

  it('caps at six monthly salaries of 30 days, 180: 15 years reach it, 16 are over', () => {
    const fifteen = figures('2035-02-28');
    expect(fifteen.completeYearsOnly.days).toBe(180);
    expect(fifteen.completeYearsOnly.capped).toBe(false);
    const sixteen = figures('2036-02-29');
    expect(sixteen.completeYears).toBe(16);
    expect(sixteen.completeYearsOnly.capped).toBe(true);
    expect(sixteen.completeYearsOnly.days).toBe(180);
    expect(sixteen.completeYearsOnly.amount).toBe(round2((ANNUAL / 365) * 180));
  });

  it('adds the month-prorated reading only as a higher one', () => {
    // 6 years, 3 months and 14 days: 6 complete years, 76 months started.
    const f = figures('2026-06-15');
    expect(f.completeYearsOnly.days).toBe(72);
    expect(f.proratedByMonths.days).toBe(76);
    expect(f.proratedByMonths.amount).toBeGreaterThan(f.completeYearsOnly.amount);
  });

  it('gives nothing for the complete years of a worker with under a year', () => {
    const f = figures('2020-12-31');
    expect(f.completeYearsOnly.amount).toBe(0);
    expect(f.proratedByMonths.days).toBe(10);
  });
});

describe('the base under the minimum wage', () => {
  it('takes the minimum wage for the hours when the pay falls below it, as a reading', () => {
    const below = household({
      startDate: START,
      payYear: 2026,
      weeklyHours: 40,
      monthlyCash: 1000,
      extraPays: { count: 2, amount: 0, prorated: true, accrual: 'semiannual' },
      termination: desistimiento({ effectiveOn: parseDate('2026-09-21') }),
    });
    const a = assessSeverance(below, NORMS, DEPS.minimumWage);
    const f = a?.kind === 'single' ? a.finding : a?.readings[0]?.finding;
    expect(f?.calculation[0]?.key).toBe('base.minimum_wage');
  });
});

describe('the severance finding', () => {
  const run = (end: string, termination = {}) =>
    assessSeverance(
      household({
        startDate: START,
        termination: desistimiento({ effectiveOn: parseDate(end), ...termination }),
      }),
      NORMS,
      DEPS.minimumWage,
    );

  it('does not apply to any other termination', () => {
    expect(
      assessSeverance(
        household({ termination: desistimiento({ route: 'et_cause' }) }),
        NORMS,
        DEPS.minimumWage,
      ),
    ).toBeNull();
    expect(assessSeverance(household(), NORMS, DEPS.minimumWage)).toBeNull();
  });

  it('cites art. 11.2', () => {
    const a = run('2026-02-28');
    if (a?.kind !== 'single') throw new Error('expected one finding');
    expect(a.finding.sources[0]?.citation).toContain('art. 11.2');
  });
});

const figure = (days: number, amount: number, daily = 57.53) => ({
  key: 'severance.figure',
  vars: { days: { days }, daily: { euros: daily }, amount: { euros: amount } },
});
const shortfall = (offered: number, difference: number) => ({
  key: 'severance.shortfall',
  vars: { offered: { euros: offered }, difference: { euros: difference } },
});
const NOT_AVAILABLE = { key: 'severance.not_made_available' };
const UNKNOWN = { key: 'severance.offered_unknown' };
const PRORATED_NOTE = { key: 'severance.prorated_note' };
const ZERO = figure(0, 0);

interface Shown {
  readonly when?: string;
  readonly status: string;
  readonly amount: { min: number } | null;
  readonly calculation: object[];
  readonly basedOnYourAnswer: boolean;
}

describe('what the severance finding shows', () => {
  // Two complete years and 31 months started, at 57,53 € a day: 24 or 31 days.
  it.each<[string, Partial<HouseholdTermination>, Partial<HouseholdInput>, Shown[]]>([
    [
      'what was offered covers both readings',
      {},
      {},
      [
        {
          status: 'within_limit',
          amount: null,
          calculation: [figure(24, 1380.82)],
          basedOnYourAnswer: true,
        },
      ],
    ],
    [
      'what was offered is exactly the counted figure',
      { severanceOffered: 1380.82 },
      {},
      [
        {
          when: 'complete_years_only',
          status: 'within_limit',
          amount: null,
          calculation: [figure(24, 1380.82)],
          basedOnYourAnswer: true,
        },
        {
          when: 'prorated_by_months',
          status: 'below_minimum',
          amount: { min: 402.74 },
          calculation: [figure(31, 1783.56), shortfall(1380.82, 402.74), PRORATED_NOTE],
          basedOnYourAnswer: true,
        },
      ],
    ],
    [
      'it is not known whether it was made available',
      { severanceAvailable: null, severanceOffered: 100_000 },
      {},
      [
        {
          when: 'complete_years_only',
          status: 'review_it',
          amount: null,
          calculation: [figure(24, 1380.82), UNKNOWN],
          basedOnYourAnswer: true,
        },
        {
          when: 'prorated_by_months',
          status: 'review_it',
          amount: null,
          calculation: [figure(31, 1783.56), UNKNOWN, PRORATED_NOTE],
          basedOnYourAnswer: true,
        },
      ],
    ],
    [
      'a worker of under a year, nothing made available',
      { severanceAvailable: false },
      { startDate: parseDate('2026-01-01') },
      [
        {
          when: 'complete_years_only',
          status: 'within_limit',
          amount: null,
          calculation: [ZERO],
          basedOnYourAnswer: true,
        },
        {
          when: 'prorated_by_months',
          status: 'missing_requirement',
          amount: { min: 517.81 },
          calculation: [figure(9, 517.81), NOT_AVAILABLE, PRORATED_NOTE],
          basedOnYourAnswer: true,
        },
      ],
    ],
    [
      'a worker of under a year, the amount not known',
      { severanceOffered: null },
      { startDate: parseDate('2026-01-01') },
      [
        {
          when: 'complete_years_only',
          status: 'within_limit',
          amount: null,
          calculation: [ZERO],
          basedOnYourAnswer: false,
        },
        {
          when: 'prorated_by_months',
          status: 'review_it',
          amount: null,
          calculation: [figure(9, 517.81), UNKNOWN, PRORATED_NOTE],
          basedOnYourAnswer: true,
        },
      ],
    ],
    [
      'a service over the cap of six monthly salaries',
      { severanceOffered: 1000 },
      { startDate: parseDate('2000-01-01') },
      [
        {
          status: 'below_minimum',
          amount: { min: 9356.16 },
          calculation: [
            figure(180, 10356.16),
            { key: 'severance.capped', vars: { months: 6, amount: { euros: 10356.16 } } },
            shortfall(1000, 9356.16),
          ],
          basedOnYourAnswer: true,
        },
      ],
    ],
    [
      'no salary',
      {},
      { monthlyCash: null },
      [
        {
          status: 'not_entered',
          amount: null,
          calculation: [{ key: 'severance.salary_unknown' }],
          basedOnYourAnswer: false,
        },
      ],
    ],
  ])('%s', (_name, termination, change, expected) => {
    const a = assessSeverance(
      household({ ...change, termination: desistimiento(termination) }),
      NORMS,
      DEPS.minimumWage,
    );
    if (a === null) throw new Error('expected a severance finding');
    const shown = (
      a.kind === 'single' ? [{ when: undefined, finding: a.finding }] : a.readings
    ).map((r) => ({
      ...(r.when === undefined ? {} : { when: r.when }),
      status: r.finding.status,
      amount: r.finding.amount === null ? null : { min: r.finding.amount.min },
      calculation: r.finding.calculation,
      basedOnYourAnswer: r.finding.basedOnYourAnswer,
    }));
    expect(shown).toEqual(expected);
    expect(
      (a.kind === 'single' ? [a.finding] : a.readings.map((r) => r.finding)).map((f) => f.item),
    ).toEqual(expected.map(() => 'severance'));
  });
});
