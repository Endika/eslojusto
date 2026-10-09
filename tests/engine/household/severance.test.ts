import { describe, expect, it } from 'vitest';
import { parseDate } from '../../../src/engine/date';
import { round2 } from '../../../src/engine/money';
import { assessSeverance, severanceFigures } from '../../../src/engine/household/severance';
import { countedAmount, highestAmount } from '../../../src/engine/household/review';
import { NORMS } from './norms-table';
import { desistimiento, household } from './input';

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

describe('the severance finding', () => {
  const run = (end: string, termination = {}) =>
    assessSeverance(
      household({
        startDate: START,
        termination: desistimiento({ effectiveOn: parseDate(end), ...termination }),
      }),
      NORMS,
    );

  it('is one finding when the years are complete', () => {
    const a = run('2026-02-28', { severanceOffered: 72 * DAILY });
    expect(a?.kind).toBe('single');
    if (a?.kind === 'single') expect(a.finding.status).toBe('within_limit');
  });

  it('shows two readings for an incomplete year, and counts the lowest', () => {
    const a = run('2026-06-15', { severanceOffered: null, severanceAvailable: null });
    expect(a?.kind).toBe('readings');
    if (a?.kind !== 'readings') return;
    expect(a.question).toBe('incomplete_year');
    expect(a.readings.map((r) => r.when)).toEqual(['complete_years_only', 'prorated_by_months']);
  });

  it('owes the difference when less than the counted figure was made available', () => {
    const a = run('2026-06-15', { severanceOffered: 3000 });
    expect(a).not.toBeNull();
    if (a === null) return;
    expect(countedAmount(a)).toBe(round2(72 * DAILY - 3000));
    expect(highestAmount(a)).toBe(round2(76 * DAILY - 3000));
  });

  it('owes all of it when nothing was made available', () => {
    const a = run('2026-02-28', { severanceAvailable: false, severanceOffered: null });
    if (a?.kind !== 'single') throw new Error('expected one finding');
    expect(a.finding.status).toBe('missing_requirement');
    expect(a.finding.amount?.max).toBe(round2(72 * DAILY));
  });

  it('owes nothing when what was offered covers even the higher reading', () => {
    const a = run('2026-06-15', { severanceOffered: 10_000 });
    expect(a).not.toBeNull();
    if (a === null) return;
    expect(countedAmount(a)).toBe(0);
    expect(highestAmount(a)).toBe(0);
  });

  it('cannot be worked out without the salary', () => {
    const a = assessSeverance(
      household({ monthlyCash: null, termination: desistimiento() }),
      NORMS,
    );
    if (a?.kind !== 'single') throw new Error('expected one finding');
    expect(a.finding.status).toBe('not_entered');
  });

  it('does not apply to any other termination', () => {
    expect(
      assessSeverance(household({ termination: desistimiento({ route: 'et_cause' }) }), NORMS),
    ).toBeNull();
    expect(assessSeverance(household(), NORMS)).toBeNull();
  });

  it('cites art. 11.2', () => {
    const a = run('2026-02-28');
    if (a?.kind !== 'single') throw new Error('expected one finding');
    expect(a.finding.sources[0]?.citation).toContain('art. 11.2');
  });
});
