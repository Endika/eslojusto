import { describe, expect, it } from 'vitest';
import { addDays, parseDate, type CivilDate } from '../../../src/engine/date';
import {
  countedAmount,
  highestAmount,
  reviewHousehold,
  type HouseholdReview,
} from '../../../src/engine/household/review';
import { severanceFigures } from '../../../src/engine/household/severance';
import type {
  Assessed,
  DesistimientoCause,
  Finding,
  HouseholdInput,
  HouseholdTermination,
} from '../../../src/engine/household/types';
import { FINDING_STATUSES } from '../../../src/engine/household/types';
import { DEPS, household, TODAY } from './input';

const CASES = 400;

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
  const maybe = <T>(x: T): T | null => (r() < 0.25 ? null : x);
  const bool = (): boolean | null => (r() < 0.15 ? null : r() < 0.5);
  return { r, int, pick, maybe, bool };
}
type Gen = ReturnType<typeof prng>;

const CAUSES: readonly DesistimientoCause[] = [
  'income_drop_or_expense_rise',
  'family_needs_change',
  'loss_of_trust',
  'other',
  'none',
];
const day = (g: Gen, from: CivilDate, spread: number): CivilDate => addDays(from, g.int(0, spread));
const money = (g: Gen, lo: number, hi: number): number => g.int(lo * 100, hi * 100) / 100;
const time = (g: Gen): string =>
  `${String(g.int(0, 23)).padStart(2, '0')}:${String(g.pick([0, 1, 30, 59])).padStart(2, '0')}`;

function termination(g: Gen, start: CivilDate): HouseholdTermination {
  const effectiveOn = day(g, addDays(start, 30), 3000);
  const notice = g.r() < 0.1 ? null : addDays(effectiveOn, -g.int(0, 40));
  return {
    route: g.r() < 0.8 ? 'desistimiento' : 'et_cause',
    noticeGivenOn: notice !== null && notice.y < start.y ? start : notice,
    effectiveOn,
    noticeTime: g.maybe(time(g)),
    inWriting: g.bool(),
    cause: g.maybe(g.pick(CAUSES)),
    severanceAvailable: g.bool(),
    severanceOffered: g.maybe(money(g, 0, 12_000)),
    substitutePaid: g.maybe(money(g, 0, 2000)),
    seriousBreachAlleged: g.bool(),
  };
}

function randomInput(seed: number): HouseholdInput {
  const g = prng(seed);
  const start = day(g, parseDate('2018-01-01'), 2800);
  const monthly = g.r() < 0.8;
  const t = g.r() < 0.6 ? termination(g, start) : null;
  const dayOfStart = t?.noticeGivenOn;
  return household({
    startDate: start,
    payYear: g.pick([2022, 2023, 2024, 2025, 2026, 2027]),
    liveIn: monthly && g.r() < 0.4,
    regime: monthly ? 'monthly' : 'hourly_external',
    weeklyHours: g.maybe(g.int(1, 70)),
    monthlyCash: monthly ? g.maybe(money(g, 300, 3000)) : null,
    inKindMonthly: g.maybe(money(g, 0, 900)),
    extraPays: g.maybe({
      count: g.int(0, 3),
      amount: g.maybe(money(g, 100, 2000)),
      prorated: g.r() < 0.3,
      accrual: g.pick(['annual', 'semiannual', 'unknown'] as const),
    }),
    hourlyRate: monthly ? null : g.maybe(money(g, 5, 15)),
    shortestRestHours: g.maybe(g.int(1, 24)),
    restMadeUpWithinFourWeeks: g.bool(),
    weeklyRestHours: g.maybe(g.int(0, 100)),
    holidays: g.maybe({
      days: g.int(0, 40),
      longestStretch: g.maybe(g.int(0, 30)),
      taken: g.maybe(g.int(0, 30)),
    }),
    termination: t === null || dayOfStart === undefined ? t : t,
  });
}

const findingsOf = (items: readonly Assessed[]): Finding[] =>
  items.flatMap((a) => (a.kind === 'single' ? [a.finding] : a.readings.map((r) => r.finding)));

const WARNINGS = new Set([
  'weekly_40',
  'rest_between_shifts',
  'weekly_rest_36',
  'holidays_30',
  'holidays_stretch_15',
]);

function reviewOf(input: HouseholdInput): HouseholdReview | null {
  const result = reviewHousehold(input, TODAY, DEPS);
  return result.ok ? result.review : null;
}

describe('household review properties', () => {
  const inputs = Array.from({ length: CASES }, (_, i) => randomInput(i + 1));

  it('never throws, and an input it takes is reviewed', () => {
    let reviewed = 0;
    for (const input of inputs) if (reviewOf(input) !== null) reviewed++;
    expect(reviewed).toBeGreaterThan(CASES * 0.5);
  });

  it('every finding has a known status, a source and a finite non-negative amount', () => {
    for (const input of inputs) {
      const r = reviewOf(input);
      if (r === null) continue;
      for (const f of findingsOf(r.items)) {
        expect(FINDING_STATUSES).toContain(f.status);
        expect(f.sources.length).toBeGreaterThan(0);
        if (f.amount !== null) {
          expect(Number.isFinite(f.amount.max)).toBe(true);
          expect(f.amount.min).toBeGreaterThanOrEqual(0);
          expect(f.amount.min).toBeLessThanOrEqual(f.amount.max);
        }
      }
    }
  });

  it('warnings never carry an amount and never count', () => {
    for (const input of inputs) {
      const r = reviewOf(input);
      if (r === null) continue;
      for (const a of r.items) {
        const f = a.kind === 'single' ? a.finding : a.readings[0]?.finding;
        if (f !== undefined && WARNINGS.has(f.id)) {
          expect(findingsOf([a]).every((x) => x.amount === null)).toBe(true);
          expect(countedAmount(a)).toBe(0);
          expect(highestAmount(a)).toBe(0);
        }
      }
    }
  });

  it('a doubtful reading never counts: counted is never above the highest', () => {
    for (const input of inputs) {
      const r = reviewOf(input);
      if (r === null) continue;
      for (const a of r.items) {
        expect(countedAmount(a)).toBeLessThanOrEqual(highestAmount(a));
        if (a.kind === 'readings') {
          const each = a.readings.map((x) => x.finding.amount?.max ?? 0);
          expect(countedAmount(a)).toBe(Math.min(...each));
        }
      }
    }
  });

  it('is the same on the same input', () => {
    for (const input of inputs.slice(0, 60)) expect(reviewOf(input)).toEqual(reviewOf(input));
  });

  it('a better paid worker is never further below the minimum', () => {
    for (const input of inputs) {
      if (input.regime !== 'monthly' || input.monthlyCash === null) continue;
      const shortfall = (cash: number) => {
        const r = reviewOf({ ...input, monthlyCash: cash });
        const f = r === null ? undefined : findingsOf(r.items).find((x) => x.id === 'smi_monthly');
        return f?.amount?.max ?? 0;
      };
      expect(shortfall(input.monthlyCash + 100)).toBeLessThanOrEqual(shortfall(input.monthlyCash));
    }
  });

  it('severance never falls with more service, and never passes six monthly salaries', () => {
    const g = prng(99);
    for (let i = 0; i < CASES; i++) {
      const start = day(g, parseDate('2000-01-01'), 8000);
      const annual = money(g, 5000, 60_000);
      const end = addDays(start, g.int(1, 9000));
      const later = addDays(end, g.int(1, 900));
      const a = severanceFigures(start, end, annual);
      const b = severanceFigures(start, later, annual);
      expect(b.completeYearsOnly.amount).toBeGreaterThanOrEqual(a.completeYearsOnly.amount);
      expect(b.proratedByMonths.amount).toBeGreaterThanOrEqual(a.proratedByMonths.amount);
      expect(a.completeYearsOnly.amount).toBeLessThanOrEqual(annual / 2 + 0.01);
      expect(a.proratedByMonths.amount).toBeLessThanOrEqual(annual / 2 + 0.01);
      expect(a.completeYearsOnly.amount).toBeLessThanOrEqual(a.proratedByMonths.amount + 0.005);
    }
  });
});
