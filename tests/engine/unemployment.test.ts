import { describe, expect, it } from 'vitest';
import type { Range } from '../../src/engine/money';
import {
  fromOrdinal,
  daysInMonth,
  ordinal,
  parseDate as f,
  type CivilDate,
} from '../../src/engine/date';
import {
  estimateBenefit,
  BENEFIT_2026,
  type BenefitEstimate,
  type Children,
} from '../../src/engine/unemployment';
import type {
  Cause,
  FinalPayInput,
  OtherContracts,
  ContributionPeriod,
  FixedTermType,
} from '../../src/engine/types';
import { validateOtherContracts } from '../../src/engine/validate';
import { annualSalary } from '../../src/engine/settlement';

const base: FinalPayInput = {
  cause: 'objective_dismissal',
  startDate: f('2024-01-01'),
  endDate: f('2026-09-30'),
  monthlySalary: 2000,
  extraPayProrated: false,
  extraPayCount: 2,
  extraPayAmount: 2000,
  extraPayAccrual: 'annual',
  holidayUnit: 'calendar',
  annualHolidayDays: 30,
  holidayDaysTaken: 0,
};

const input = (
  cause: Cause,
  startDate: string,
  endDate: string,
  salary: number,
  payments: 14 | 12,
  fixedTermType?: FixedTermType,
): FinalPayInput => ({
  ...base,
  cause,
  ...(fixedTermType ? { fixedTermType } : {}),
  startDate: f(startDate),
  endDate: f(endDate),
  monthlySalary: salary,
  extraPayProrated: payments === 12,
  extraPayCount: payments === 12 ? 0 : 2,
  extraPayAmount: payments === 12 ? 0 : salary,
});

type Entitled = Extract<BenefitEstimate, { entitled: 'yes' }>;

const entitled = (e: FinalPayInput, children: Children, others?: OtherContracts): Entitled => {
  const r = estimateBenefit(e, children, others);
  if (r.entitled !== 'yes') throw new Error('expected entitled: yes');
  return r;
};

const figures = (r: Entitled) => {
  if (r.figures === null) throw new Error('expected figures');
  return r.figures;
};

const near = (range: Range, v: number) => {
  expect(range.min).toBeCloseTo(v, 2);
  expect(range.max).toBeCloseTo(v, 2);
};

describe('benefit: §10 cases', () => {
  it('4: objective dismissal at the minimum wage, no cap applies', () => {
    const r = entitled(input('objective_dismissal', '2023-03-15', '2026-09-30', 1221, 14), 0);
    expect(r.contractDays).toBe(1296);
    expect(r.minimumDurationDays).toBe(420);
    expect(r.secondStretch).toBe(true);
    near(figures(r).firstStretch, 997.15);
    near(figures(r).secondStretch, 854.7);
    near(figures(r).contribution, 69.08);
  });

  it('5: unfair dismissal, 6-year window and base clamped to the maximum', () => {
    const r = entitled(input('unfair_dismissal', '2015-01-01', '2026-09-30', 6000, 12), 2);
    expect(r.contractDays).toBe(2191);
    expect(r.minimumDurationDays).toBe(720);
    near(figures(r).firstStretch, 1575);
    near(figures(r).secondStretch, 1575);
    near(figures(r).contribution, 247.4);
  });

  const case6 = input('disciplinary_dismissal', '2022-01-10', '2026-09-30', 2500, 12);

  it('6: disciplinary dismissal is entitled, 540 days and 1-child cap', () => {
    const r = entitled(case6, 1);
    expect(r.contractDays).toBe(1725);
    expect(r.minimumDurationDays).toBe(540);
    near(figures(r).firstStretch, 1400);
    near(figures(r).secondStretch, 1400);
    near(figures(r).contribution, 121.25);
    expect(r.sources.map((x) => x.id)).toContain('lgss268');
  });

  // Below the 2026 minimum base a full-time job cannot be: it is almost surely part-time.
  it('800 €/month in 12 payments: no figures, being below the minimum base', () => {
    const r = entitled(input('objective_dismissal', '2020-01-01', '2026-09-30', 800, 12), 1);
    expect(r.figures).toBeNull();
    expect(r.noFigures).toBe('base_below_minimum');
    expect(r.duration).toEqual({ kind: 'at_least', days: 720 });
  });

  it('1,500 € in 14 payments: with figures', () => {
    const r = entitled(input('objective_dismissal', '2020-01-01', '2026-09-30', 1500, 14), 1);
    expect(r.noFigures).toBeNull();
    near(figures(r).firstStretch, 1225);
  });

  it('the minimum wage in 14 payments (1,424.50 €) still reaches the minimum base', () => {
    expect(
      entitled(input('objective_dismissal', '2023-03-15', '2026-09-30', 1221, 14), 0).noFigures,
    ).toBeNull();
  });

  it('when entitled, art. 268 is among the sources: the 15-day deadline cites it', () => {
    const r = entitled(input('objective_dismissal', '2020-01-01', '2026-09-30', 1500, 14), 0);
    expect(r.sources.map((x) => x.id)).toContain('lgss268');
  });
});

// mulberry32: small, seeded and deterministic.
function prng(seed: number) {
  let a = seed;
  const r = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
  const pick = <T>(xs: readonly T[]): T => xs[int(0, xs.length - 1)] as T;
  return { r, int, pick };
}

describe('benefit: property (300 seeded inputs)', () => {
  const g = prng(20261006);
  const cases = Array.from({ length: 300 }, () => {
    const cause = g.pick<Cause>([
      'resignation',
      'fixed_term_end',
      'objective_dismissal',
      'unfair_dismissal',
      'disciplinary_dismissal',
    ]);
    const endDate = fromOrdinal(g.int(ordinal(f('2026-01-01')), ordinal(f('2026-12-31'))));
    // Bias towards short contracts so the 180 and 360 day borders get exercised.
    const daysBack = g.r() < 0.5 ? g.int(0, 400) : g.int(0, 12000);
    const startDate = fromOrdinal(ordinal(endDate) - daysBack);
    const prorated = g.r() < 0.4;
    const salary = g.int(80000, 800000) / 100;
    const e: FinalPayInput = {
      ...base,
      cause,
      ...(cause === 'fixed_term_end'
        ? {
            fixedTermType: g.pick<FixedTermType>([
              'production_circumstances',
              'replacement',
              'training',
            ]),
          }
        : {}),
      startDate: startDate,
      endDate: endDate,
      monthlySalary: salary,
      extraPayProrated: prorated,
      extraPayCount: prorated ? 0 : g.pick([0, 1, 2, 2, 3, 4]),
      extraPayAmount: prorated ? 0 : g.int(0, 800000) / 100,
    };
    const children = g.pick<Children>([0, 1, 2, null]);
    return { e, children, r: estimateBenefit(e, children) };
  });

  it('entitled «no» if and only if the cause is a resignation', () => {
    for (const { e, r } of cases) expect(r.entitled === 'no').toBe(e.cause === 'resignation');
  });

  it('no figures under 180 days or with a salary below the minimum base', () => {
    for (const { e, r } of cases) {
      if (r.entitled !== 'yes') continue;
      const low = annualSalary(e) / 12 < BENEFIT_2026.minBaseAtep;
      expect(r.figures === null).toBe(r.contractDays < 180 || low);
      expect(r.noFigures).toBe(
        r.contractDays < 180 ? 'short_contract' : low ? 'base_below_minimum' : null,
      );
    }
  });

  it('figures within the caps and first stretch ≥ second stretch', () => {
    for (const { r, children } of cases) {
      if (r.entitled !== 'yes' || r.figures === null) continue;
      const lo =
        children === null ? BENEFIT_2026.minCap[0] : BENEFIT_2026.minCap[children === 0 ? 0 : 1];
      const hi = children === null ? BENEFIT_2026.maxCap[2] : BENEFIT_2026.maxCap[children];
      const { firstStretch, secondStretch, contribution } = r.figures;
      for (const t of [firstStretch, secondStretch]) {
        expect(t.min).toBeGreaterThanOrEqual(lo);
        expect(t.max).toBeLessThanOrEqual(hi);
        expect(t.min).toBeLessThanOrEqual(t.max);
      }
      expect(firstStretch.min).toBeGreaterThanOrEqual(secondStretch.min);
      expect(firstStretch.max).toBeGreaterThanOrEqual(secondStretch.max);
      expect(contribution.min).toBeGreaterThanOrEqual(69.08);
      expect(contribution.max).toBeLessThanOrEqual(247.4);
    }
  });

  it('duration and qualifying period consistent with the contract days', () => {
    for (const { r } of cases) {
      if (r.entitled !== 'yes') continue;
      expect(r.contractDays).toBeLessThanOrEqual(2192);
      expect(r.minimumDurationDays).toBeLessThanOrEqual(720);
      expect(r.minimumDurationDays === 0).toBe(r.contractDays < 360);
      expect(r.qualifying === 'met_by_this_contract').toBe(r.contractDays >= 360);
      expect(r.secondStretch).toBe(r.minimumDurationDays > 180);
    }
  });

  it('the sample covers the edges', () => {
    const days = cases.flatMap(({ r }) => (r.entitled === 'yes' ? [r.contractDays] : []));
    expect(days.some((d) => d < 180)).toBe(true);
    expect(days.some((d) => d >= 180 && d < 360)).toBe(true);
    expect(days.some((d) => d >= 2160)).toBe(true);
  });
});

const period = (startDate: string, endDate: string): ContributionPeriod => ({
  startDate: f(startDate),
  endDate: f(endDate),
});

const withOtherContracts = (
  contracts: readonly ContributionPeriod[],
  benefitDrawnSince: boolean | null,
): OtherContracts => ({ contracts, benefitDrawnSince });

describe('benefit: validateOtherContracts', () => {
  const e = input('objective_dismissal', '2025-01-01', '2026-06-30', 2000, 14);

  it("accepts rows in this contract's past, also simultaneous ones or ending the same day", () => {
    expect(
      validateOtherContracts(e, [
        period('2020-01-01', '2020-12-31'),
        period('2025-06-01', '2026-06-30'),
        period('2026-06-30', '2026-06-30'),
      ]),
    ).toEqual([]);
  });

  it("rejects, per row, an end before the start and an end after this contract's", () => {
    const errors = validateOtherContracts(e, [
      period('2020-01-01', '2020-12-31'),
      period('2023-05-01', '2023-04-30'),
      period('2026-01-01', '2026-07-01'),
    ]);
    expect(errors.map(({ field, row, code }) => ({ field, row, code }))).toEqual([
      { field: 'otherContracts.1.endDate', row: 1, code: 'other_contract_end_before_start' },
      { field: 'otherContracts.2.endDate', row: 2, code: 'other_contract_ends_after_this_one' },
    ]);
  });

  it('rejects impossible dates per row', () => {
    const errors = validateOtherContracts(e, [
      { startDate: { y: 2024, m: 2, d: 30 }, endDate: { y: 2024, m: 13, d: 1 } },
    ]);
    expect(errors.map((x) => x.code)).toEqual([
      'other_contract_invalid_start_date',
      'other_contract_invalid_end_date',
    ]);
    expect(errors.map((x) => x.field)).toEqual([
      'otherContracts.0.startDate',
      'otherContracts.0.endDate',
    ]);
  });
});

describe('benefit: property with other contracts (300 seeded inputs)', () => {
  const g = prng(20261007);
  // Brute force: the set of worked days inside the window.
  const reference = (endDate: CivilDate, periods: readonly ContributionPeriod[]): number => {
    const y = endDate.y - 6;
    const first =
      ordinal({ y, m: endDate.m, d: Math.min(endDate.d, daysInMonth(y, endDate.m)) }) + 1;
    const days = new Set<number>();
    for (const p of periods) {
      const to = Math.min(ordinal(p.endDate), ordinal(endDate));
      for (let n = Math.max(ordinal(p.startDate), first); n <= to; n++) days.add(n);
    }
    return days.size;
  };

  const cases = Array.from({ length: 300 }, () => {
    const endDate = fromOrdinal(g.int(ordinal(f('2026-01-01')), ordinal(f('2026-12-31'))));
    const startDate = fromOrdinal(
      ordinal(endDate) - (g.r() < 0.6 ? g.int(0, 400) : g.int(0, 3000)),
    );
    const e: FinalPayInput = {
      ...base,
      cause: g.pick<Cause>(['objective_dismissal', 'unfair_dismissal', 'disciplinary_dismissal']),
      startDate: startDate,
      endDate: endDate,
    };
    const row = (): ContributionPeriod => {
      const end = ordinal(endDate) - g.int(0, 2600);
      return { startDate: fromOrdinal(end - g.int(0, 900)), endDate: fromOrdinal(end) };
    };
    const rows = Array.from({ length: g.int(1, 4) }, row);
    return { e, rows, extra: row(), benefit: g.pick<boolean | null>([true, false, null]) };
  });

  it('the generated rows are valid', () => {
    for (const { e, rows, extra } of cases)
      expect(validateOtherContracts(e, [...rows, extra])).toEqual([]);
  });

  it('the contributed days are the exact union inside the window', () => {
    for (const { e, rows } of cases) {
      const all = [{ startDate: e.startDate, endDate: e.endDate }, ...rows];
      const r = entitled(e, 0, withOtherContracts(rows, false));
      expect(r.contributedDays).toBe(reference(e.endDate, all));
      expect(r.contributedDays).toBeGreaterThanOrEqual(r.contractDays);
      expect(r.contributedDays).toBeLessThanOrEqual(2192);
    }
  });

  it('adding a contract never lowers the duration shown as a maximum', () => {
    for (const { e, rows, extra, benefit } of cases) {
      const alone = entitled(e, 0).duration.days;
      const before = entitled(e, 0, withOtherContracts(rows, benefit)).duration;
      const after = entitled(e, 0, withOtherContracts([...rows, extra], benefit)).duration;
      expect(before.days).toBeGreaterThanOrEqual(alone);
      expect(after.days).toBeGreaterThanOrEqual(before.days);
      expect(after.kind).toBe(benefit === false ? 'exact' : 'up_to');
    }
  });

  it('the duration kind and the qualifying period follow the benefit answer', () => {
    for (const { e, rows, benefit } of cases) {
      const r = entitled(e, 0, withOtherContracts(rows, benefit));
      expect(r.minimumDurationDays).toBe(entitled(e, 0).minimumDurationDays);
      expect(r.secondStretch).toBe(r.duration.days > 180);
      if (r.contractDays >= 360) expect(r.qualifying).toBe('met_by_this_contract');
      else if (benefit === false && r.contributedDays >= 360)
        expect(r.qualifying).toBe('met_with_other_contracts');
      else expect(r.qualifying).toBe('depends_on_work_history');
    }
  });
});
