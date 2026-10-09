import { describe, expect, it } from 'vitest';
import { MINIMUM_WAGE } from '../../../src/engine/employment/data/minimum-wage';
import { assessMinimumWage } from '../../../src/engine/household/minimum-wage';
import { round2 } from '../../../src/engine/money';
import { DEPS, findingOf, household, single, statusOf } from './input';

const run = (change: Parameters<typeof household>[0]) => assessMinimumWage(household(change), DEPS);

// Art. 8.1 and 8.4: the pay in money, extra payments included, against the year's minimum wage.
describe('the monthly minimum wage, 2023 to 2026', () => {
  it.each(MINIMUM_WAGE.map((r) => [r.year, r.monthly, r.annual] as const))(
    '%s: 14 × %s = %s a year',
    (_year, monthly, annual) => {
      expect(round2(monthly * 14)).toBe(annual);
    },
  );

  it.each(MINIMUM_WAGE.map((r) => [r.year, r.monthly, r.annual] as const))(
    '%s: the monthly minimum with two extra payments apart is enough, a euro less a month is not',
    (year, monthly, annual) => {
      const at = run({
        payYear: year,
        monthlyCash: monthly,
        extraPays: { count: 2, amount: monthly, prorated: false, accrual: 'semiannual' },
      });
      expect(statusOf(at, 'smi_monthly')).toBe('within_limit');
      const below = run({
        payYear: year,
        monthlyCash: monthly - 1,
        extraPays: { count: 2, amount: monthly, prorated: false, accrual: 'semiannual' },
      });
      const f = single(below, 'smi_monthly');
      expect(f.status).toBe('below_minimum');
      expect(f.amount).toEqual({ min: 12, max: 12 });
      expect(annual).toBeGreaterThan(0);
    },
  );

  it.each(MINIMUM_WAGE.map((r) => [r.year, r.annual] as const))(
    '%s: extra payments prorated in twelve are compared as a year',
    (year, annual) => {
      const at = run({
        payYear: year,
        monthlyCash: annual / 12,
        extraPays: { count: 2, amount: null, prorated: true, accrual: 'semiannual' },
      });
      expect(statusOf(at, 'smi_monthly')).toBe('within_limit');
      const below = run({
        payYear: year,
        monthlyCash: annual / 12 - 0.01,
        extraPays: { count: 2, amount: null, prorated: true, accrual: 'semiannual' },
      });
      expect(single(below, 'smi_monthly').amount).toEqual({ min: 0.12, max: 0.12 });
    },
  );

  it('prorates shorter hours: 20 hours need half of the minimum', () => {
    const half = run({
      weeklyHours: 20,
      monthlyCash: 610.5,
      extraPays: { count: 2, amount: 610.5, prorated: false, accrual: 'semiannual' },
    });
    expect(statusOf(half, 'smi_monthly')).toBe('within_limit');
    const under = run({
      weeklyHours: 20,
      monthlyCash: 600,
      extraPays: { count: 2, amount: 610.5, prorated: false, accrual: 'semiannual' },
    });
    expect(single(under, 'smi_monthly').amount).toEqual({ min: 126, max: 126 });
  });

  it('never asks for more than the full-week minimum above 40 hours', () => {
    const f = run({
      weeklyHours: 60,
      monthlyCash: 1221,
      extraPays: { count: 2, amount: 1221, prorated: false, accrual: 'semiannual' },
    });
    expect(statusOf(f, 'smi_monthly')).toBe('within_limit');
  });

  it('cites the article of RD 1620/2011 and the decree of the year', () => {
    const f = single(run({}), 'smi_monthly');
    expect(f.sources.map((s) => s.citation.split(' (')[0])).toEqual([
      'Real Decreto 1620/2011, art. 8.1',
      'Real Decreto 1620/2011, art. 8.4',
      'Real Decreto 126/2026, de 18 de febrero, art. 1',
    ]);
  });

  it('does not add extra payments of an unknown amount', () => {
    const enough = run({
      monthlyCash: 1500,
      extraPays: { count: 2, amount: null, prorated: false, accrual: 'semiannual' },
    });
    expect(statusOf(enough, 'smi_monthly')).toBe('within_limit');
    const unsure = run({
      monthlyCash: 1300,
      extraPays: { count: 2, amount: null, prorated: false, accrual: 'semiannual' },
    });
    const f = single(unsure, 'smi_monthly');
    expect(f.status).toBe('review_it');
    expect(f.amount).toBeNull();
  });

  it('asks for the pay when it is missing', () => {
    expect(statusOf(run({ monthlyCash: null }), 'smi_monthly')).toBe('not_entered');
    expect(statusOf(run({ weeklyHours: null }), 'smi_monthly')).toBe('not_entered');
  });

  it('compares nothing for a year whose decree is not published or not loaded', () => {
    const future = single(run({ payYear: 2027 }), 'smi_monthly');
    expect(future.status).toBe('not_published');
    expect(future.amount).toBeNull();
    expect(statusOf(run({ payYear: 2022 }), 'smi_monthly')).toBe('not_reviewed_in_this_version');
  });
});

describe('the hourly minimum of an external worker, 2023 to 2026', () => {
  it.each([
    [2023, 8.45],
    [2024, 8.87],
    [2025, 9.26],
    [2026, 9.55],
  ])('%s: %s € an hour', (year, hourly) => {
    const base = { regime: 'hourly_external', payYear: year } as const;
    expect(statusOf(run({ ...base, hourlyRate: hourly }), 'smi_hourly_external')).toBe(
      'within_limit',
    );
    expect(statusOf(run({ ...base, hourlyRate: hourly + 1 }), 'smi_hourly_external')).toBe(
      'within_limit',
    );
    const below = single(
      run({ ...base, hourlyRate: round2(hourly - 0.01) }),
      'smi_hourly_external',
    );
    expect(below.status).toBe('below_minimum');
    expect(below.amount).toBeNull();
  });

  it('reads the hourly figures from the loaded decrees', () => {
    expect(MINIMUM_WAGE.map((r) => [r.year, r.householdPerHour])).toEqual([
      [2023, 8.45],
      [2024, 8.87],
      [2025, 9.26],
      [2026, 9.55],
    ]);
  });

  it('checks only the hourly rate, with no extra payments of its own', () => {
    const items = run({ regime: 'hourly_external', hourlyRate: 9.55, monthlyCash: null });
    expect(items.map((a) => (a.kind === 'single' ? a.finding.id : ''))).toEqual([
      'smi_hourly_external',
    ]);
    const f = single(items, 'smi_hourly_external');
    expect(f.sources.map((s) => s.citation.split(' (')[0])).toEqual([
      'Real Decreto 1620/2011, art. 8.5',
      'Real Decreto 126/2026, de 18 de febrero, art. 4.2',
    ]);
  });

  it('asks for the rate and waits for an unpublished year', () => {
    expect(
      statusOf(run({ regime: 'hourly_external', hourlyRate: null }), 'smi_hourly_external'),
    ).toBe('not_entered');
    expect(
      statusOf(
        run({ regime: 'hourly_external', hourlyRate: 20, payYear: 2027 }),
        'smi_hourly_external',
      ),
    ).toBe('not_published');
  });
});

describe('pay in kind (art. 8.2)', () => {
  it('allows exactly 30 % of the total salary', () => {
    // 700 in money and 300 in kind: 30 % of 1.000.
    expect(statusOf(run({ monthlyCash: 700, inKindMonthly: 300 }), 'smi_in_kind_cap')).toBe(
      'within_limit',
    );
  });

  it('flags a cent over 30 %', () => {
    expect(
      statusOf(
        run({ monthlyCash: 700, inKindMonthly: 300.01, extraPays: null }),
        'smi_in_kind_cap',
      ),
    ).toBe('over_legal_limit');
  });

  it('does not count pay in kind towards the minimum in money', () => {
    const items = run({
      monthlyCash: 1000,
      inKindMonthly: 200,
      extraPays: { count: 2, amount: 1000, prorated: false, accrual: 'semiannual' },
    });
    expect(statusOf(items, 'smi_in_kind_cap')).toBe('within_limit');
    expect(single(items, 'smi_monthly').status).toBe('below_minimum');
  });

  it('counts the share as over only when it is over in the month and in the year', () => {
    // 1.300 a month, two extra pays of 1.300 and 560 in kind: 30,1 % of the month, 27,0 % of the
    // year with its extra pays.
    const items = run({
      monthlyCash: 1300,
      inKindMonthly: 560,
      extraPays: { count: 2, amount: 1300, prorated: false, accrual: 'semiannual' },
    });
    const a = findingOf(items, 'smi_in_kind_cap');
    if (a.kind !== 'readings') throw new Error('expected two readings');
    expect(a.question).toBe('in_kind_base');
    expect(a.readings.map((r) => [r.when, r.finding.status])).toEqual([
      ['month_without_extra_pays', 'over_legal_limit'],
      ['year_with_extra_pays', 'within_limit'],
    ]);
  });

  it('is over the limit in both when it is over in the month and in the year', () => {
    const items = run({
      monthlyCash: 700,
      inKindMonthly: 400,
      extraPays: { count: 2, amount: 700, prorated: false, accrual: 'semiannual' },
    });
    expect(statusOf(items, 'smi_in_kind_cap')).toBe('over_legal_limit');
  });

  it('reviews a month over the limit when the extra pays are not known', () => {
    const items = run({
      monthlyCash: 1300,
      inKindMonthly: 560,
      extraPays: { count: 2, amount: null, prorated: false, accrual: 'semiannual' },
    });
    expect(statusOf(items, 'smi_in_kind_cap')).toBe('review_it');
  });

  it('says nothing without pay in kind', () => {
    const ids = run({ inKindMonthly: 0 }).flatMap((a) =>
      a.kind === 'single' ? [a.finding.id] : [],
    );
    expect(ids).not.toContain('smi_in_kind_cap');
  });
});

describe('extra payments (art. 8.4)', () => {
  const extras = (count: number, accrual: 'semiannual' | 'annual' | 'unknown' = 'semiannual') => ({
    count,
    amount: 1500,
    prorated: false,
    accrual,
  });

  it('wants two, at the end of each half-year', () => {
    expect(statusOf(run({ extraPays: extras(2) }), 'extra_pays')).toBe('within_limit');
    expect(statusOf(run({ extraPays: extras(1) }), 'extra_pays')).toBe('missing_requirement');
    expect(statusOf(run({ extraPays: extras(0) }), 'extra_pays')).toBe('missing_requirement');
  });

  it('leaves paying them once a year or in twelve to what was agreed', () => {
    const annual = single(run({ extraPays: extras(2, 'annual') }), 'extra_pays');
    expect(annual.status).toBe('review_it');
    expect(annual.agreementMaySetOther).toBe(true);
    const prorated = single(
      run({ extraPays: { count: 2, amount: null, prorated: true, accrual: 'semiannual' } }),
      'extra_pays',
    );
    expect(prorated.status).toBe('review_it');
  });

  it('asks when they are not entered, and does not apply to hourly workers', () => {
    expect(statusOf(run({ extraPays: null }), 'extra_pays')).toBe('not_entered');
    const ids = run({ regime: 'hourly_external', hourlyRate: 9.55 }).flatMap((a) =>
      a.kind === 'single' ? [a.finding.id] : [],
    );
    expect(ids).not.toContain('extra_pays');
  });
});
