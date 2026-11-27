import { describe, expect, it } from 'vitest';
import { MINIMUM_WAGE } from '../../../src/engine/employment/data/minimum-wage';
import { assessMinimumWage } from '../../../src/engine/household/minimum-wage';
import { round2 } from '../../../src/engine/money';
import { parseDate } from '../../../src/engine/date';
import { NORMS } from './norms-table';
import { DEPS, TODAY, findingOf, household, single, statusOf } from './input';

// A whole pay year worked, so the shortfall counted is the year's.
const run = (change: Parameters<typeof household>[0]) => {
  const input = household({ startDate: parseDate('2020-01-01'), ...change });
  return assessMinimumWage(input, DEPS, { y: input.payYear, m: 12, d: 31 });
};

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

  it('cites the article of RD 1620/2011 and the decree of the year', () => {
    const f = single(run({}), 'smi_monthly');
    expect(f.sources.map((s) => s.citation.split(' (')[0])).toEqual([
      'Real Decreto 1620/2011, art. 8.1',
      'Real Decreto 1620/2011, art. 8.4',
      'Real Decreto 126/2026, de 18 de febrero, arts. 1 y 3.1',
    ]);
    const decree = f.sources.at(-1);
    expect([decree?.inForceSince, decree?.inForceUntil]).toEqual(['2026-01-01', '2026-12-31']);
  });

  it('asks for the pay when it is missing', () => {
    expect(statusOf(run({ monthlyCash: null }), 'smi_monthly')).toBe('not_entered');
    expect(statusOf(run({ weeklyHours: null }), 'smi_monthly')).toBe('not_entered');
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
});

describe('the decree a figure comes from', () => {
  const decreeOf = (deps: typeof DEPS) => {
    const f = single(
      assessMinimumWage(household({ startDate: parseDate('2020-01-01') }), deps, TODAY),
      'smi_monthly',
    );
    return f.sources.at(-1);
  };

  it('keeps the date its end is uncertain until, when the norm has one', () => {
    const norms = {
      ...NORMS,
      rd126_2026: { ...NORMS.rd126_2026, endUncertainUntil: '2027-01-01' },
    };
    expect(decreeOf({ ...DEPS, norms })?.endUncertainUntil).toBe('2027-01-01');
    expect(decreeOf(DEPS)?.endUncertainUntil).toBeNull();
  });

  it('refuses a decree that is not among the norms', () => {
    const minimumWage = MINIMUM_WAGE.map((row) => ({ ...row, norm: 'rd0_2000' }));
    expect(() => decreeOf({ ...DEPS, minimumWage })).toThrow(
      'The minimum wage of 2026 rests on rd0_2000, not in the norms',
    );
  });
});
