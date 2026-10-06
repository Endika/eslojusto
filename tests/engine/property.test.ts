import { describe, expect, it } from 'vitest';
import { compareItem, type Status } from '../../src/engine/compare';
import { round2 } from '../../src/engine/money';
import {
  toIso,
  fromOrdinal,
  daysInMonth,
  calendarDays,
  max,
  min,
  ordinal,
  parseDate as f,
  type CivilDate,
} from '../../src/engine/date';
import { computeSeverance } from '../../src/engine/severance';
import { annualSalary } from '../../src/engine/settlement';
import { reviewFinalPay, type EmployerFigures } from '../../src/engine/review';
import type { Cause, FinalPayInput, ItemId, FixedTermType } from '../../src/engine/types';

const TODAY = f('2026-10-06');
const CASES = 500;

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

type Method = 'days' | 'months' | 'anniversary';
const METHODS: readonly Method[] = ['days', 'months', 'anniversary'];

// Independent of the engine: whole calendar months count 1, a partial month its days / 30.
function monthsOracle(from: CivilDate, to: CivilDate): number {
  let total = 0;
  for (
    let y = from.y, m = from.m;
    y * 12 + m <= to.y * 12 + to.m;
    m === 12 ? (y++, (m = 1)) : m++
  ) {
    const firstDay = y === from.y && m === from.m ? from.d : 1;
    const lastDay = y === to.y && m === to.m ? to.d : daysInMonth(y, m);
    const days = lastDay - firstDay + 1;
    total += days === daysInMonth(y, m) ? 1 : Math.min(1, days / 30);
  }
  return total;
}

// Independent of the engine: months by anniversary of `from` (day clipped to the month's end), leftover days / 30.
function anniversaryMonthsOracle(from: CivilDate, to: CivilDate): number {
  const dayBefore = (k: number) => {
    const t = from.y * 12 + from.m - 1 + k;
    const y = Math.floor(t / 12);
    const m = (t % 12) + 1;
    return ordinal({ y, m, d: Math.min(from.d, daysInMonth(y, m)) }) - 1;
  };
  let k = 0;
  while (dayBefore(k + 1) <= ordinal(to)) k++;
  return k + (ordinal(to) - dayBefore(k)) / 30;
}

function accrual(
  from: CivilDate,
  to: CivilDate,
  periodStart: CivilDate,
  periodEnd: CivilDate,
  periodMonths: number,
  m: Method,
) {
  const d = max(from, periodStart);
  const h = min(to, periodEnd);
  if (ordinal(h) < ordinal(d)) return 0;
  if (m === 'days') return calendarDays(d, h) / calendarDays(periodStart, periodEnd);
  // Counting from the start date only applies when it falls inside the period; from the period start it is calendar months.
  return m === 'months'
    ? monthsOracle(d, h) / periodMonths
    : anniversaryMonthsOracle(d, h) / periodMonths;
}

function generate(g: ReturnType<typeof prng>): FinalPayInput {
  const cause = g.pick<Cause>([
    'resignation',
    'fixed_term_end',
    'objective_dismissal',
    'unfair_dismissal',
    'disciplinary_dismissal',
  ]);
  const startDate = fromOrdinal(g.int(ordinal(f('1985-01-01')), ordinal(f('2026-09-30'))));
  const endDate = fromOrdinal(g.int(ordinal(startDate), ordinal(f('2027-06-30'))));
  const prorated = g.r() < 0.3;
  const extraPayCount = g.pick([0, 1, 2, 2, 2, 3, 4]);
  const salary = g.int(80000, 600000) / 100;
  return {
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
    extraPayCount,
    extraPayAmount: prorated || extraPayCount === 0 ? 0 : g.int(50000, 600000) / 100,
    extraPayAccrual: g.pick(['annual', 'semiannual', 'unknown'] as const),
    annualHolidayDays: g.int(22, 35),
    holidayDaysTaken: g.r() < 0.1 ? null : g.int(0, 30),
    ...(g.r() < 0.7 ? { noticeDaysReceived: g.int(0, 30) } : {}),
    ...(g.r() < 0.6 ? { agreementNoticeDays: g.int(0, 30) } : {}),
    ...(g.r() < 0.6 ? { noticeDaysGiven: g.int(0, 30) } : {}),
  };
}

function pendingHolidays(e: FinalPayInput, m: Method): number | null {
  if (e.holidayDaysTaken === null) return null;
  const { y } = e.endDate;
  const fraction = accrual(e.startDate, e.endDate, { y, m: 1, d: 1 }, { y, m: 12, d: 31 }, 12, m);
  return e.annualHolidayDays * fraction - e.holidayDaysTaken;
}

type Scheme = 'annual' | 'semiannual';

// Fraction of each extra payment accrued in the open period, by one method for both payments.
function paymentFractions(e: FinalPayInput, scheme: Scheme, m: Method) {
  const { y, m: month } = e.endDate;
  const firstHalf = month <= 6;
  let summer = 0;
  let christmas = 0;
  if (scheme === 'annual') {
    const summerStartYear = firstHalf ? y - 1 : y;
    summer = accrual(
      e.startDate,
      e.endDate,
      { y: summerStartYear, m: 7, d: 1 },
      { y: summerStartYear + 1, m: 6, d: 30 },
      12,
      m,
    );
    christmas = accrual(e.startDate, e.endDate, { y, m: 1, d: 1 }, { y, m: 12, d: 31 }, 12, m);
  } else if (firstHalf) {
    summer = accrual(e.startDate, e.endDate, { y, m: 1, d: 1 }, { y, m: 6, d: 30 }, 6, m);
  } else {
    christmas = accrual(e.startDate, e.endDate, { y, m: 7, d: 1 }, { y, m: 12, d: 31 }, 6, m);
  }
  return { summer, christmas };
}

// A payment due in the month of leaving may already be in that month's payslip.
const maybePaid = (month: number) => ({
  summer: month === 6 || month === 7,
  christmas: month === 12,
});

// Every extra pay figure a legitimate employer could write: scheme × method × which payment × already paid.
function legitimateExtraPay(e: FinalPayInput): number[] {
  const schemes: Scheme[] =
    e.extraPayAccrual === 'unknown' ? ['annual', 'semiannual'] : [e.extraPayAccrual];
  const paid = maybePaid(e.endDate.m);
  const figures: number[] = [];
  for (const scheme of schemes) {
    for (const m of METHODS) {
      const f = paymentFractions(e, scheme, m);
      const summer = paid.summer ? [f.summer, 0] : [f.summer];
      const christmas = paid.christmas ? [f.christmas, 0] : [f.christmas];
      const totals =
        e.extraPayCount === 1
          ? [...summer, ...christmas]
          : summer.flatMap((v) => christmas.map((n) => v + n));
      figures.push(...totals.map((t) => e.extraPayAmount * t));
    }
  }
  return figures;
}

// What an employer paying the legal amount by one method would put in the final pay.
function employerFigures(e: FinalPayInput, m: Method, g: ReturnType<typeof prng>): EmployerFigures {
  const { y, m: month } = e.endDate;
  const annual = annualSalary(e);
  const day = g.pick([e.monthlySalary / 30, annual / 365]);
  const c: EmployerFigures = {};

  const monthStart = max({ y, m: month, d: 1 }, e.startDate);
  const worked = calendarDays(monthStart, e.endDate);
  c.pending_salary =
    m === 'days'
      ? (e.monthlySalary * worked) / daysInMonth(y, month)
      : Math.min(e.monthlySalary, (e.monthlySalary * worked) / 30);

  const pending = pendingHolidays(e, m);
  if (pending !== null && pending >= 0) c.holiday_pay = pending * day;

  if (!e.extraPayProrated && e.extraPayCount > 0) {
    const scheme =
      e.extraPayAccrual === 'unknown'
        ? g.pick(['annual', 'semiannual'] as const)
        : e.extraPayAccrual;
    let { summer, christmas } = paymentFractions(e, scheme, m);
    const paid = maybePaid(month);
    if (paid.summer && g.r() < 0.5) summer = 0;
    if (paid.christmas && g.r() < 0.5) christmas = 0;
    const shares = e.extraPayCount === 1 ? g.pick([summer, christmas]) : summer + christmas;
    c.extra_pay = e.extraPayAmount * shares;
  }

  c.severance = computeSeverance({
    cause: e.cause,
    startDate: e.startDate,
    endDate: e.endDate,
    annualSalary: annual,
    fixedTermType: e.fixedTermType,
  }).amount;

  const missingNotice = Math.max(0, 15 - (e.noticeDaysReceived ?? 0));
  c.employer_notice = missingNotice * day;
  if (e.agreementNoticeDays !== undefined) {
    c.notice_deduction = Math.max(0, e.agreementNoticeDays - (e.noticeDaysGiven ?? 0)) * day;
  }
  for (const k of Object.keys(c) as ItemId[]) c[k] = round2(c[k] ?? 0);
  return c;
}

function inputs(): { e: FinalPayInput; g: ReturnType<typeof prng> }[] {
  const g = prng(20261006);
  return Array.from({ length: CASES }, () => ({ e: generate(g), g }));
}

const review = (e: FinalPayInput, c: EmployerFigures = {}) => {
  const r = reviewFinalPay(e, c, TODAY);
  if (!r.ok) throw new Error(`${toIso(e.startDate)} ${JSON.stringify(r.errors)}`);
  return r.review;
};

const FINDINGS: readonly Status[] = ['below_minimum', 'deduction_too_high'];

describe('property: never a made-up finding (500 seeded inputs)', () => {
  const cases = inputs();

  it.each(METHODS)(
    'an employer paying by %s never comes out below the minimum or deducting too much',
    (method) => {
      for (const { e, g } of cases) {
        const rev = review(e, employerFigures(e, method, g));
        const findings = rev.items.filter((p) => FINDINGS.includes(p.status));
        expect(findings.map((p) => [p.item.id, p.employerFigure, p.item.range, e])).toEqual([]);
      }
    },
  );

  it('the 1 € tolerance: the minimum and 0.99 less are not below; 1.01 less is', () => {
    for (const { e } of cases) {
      for (const p of review(e).items) {
        const { range, direction } = p.item;
        if (range === null || direction !== 'credit') continue;
        expect(compareItem(p.item, range.min).status).not.toBe('below_minimum');
        expect(compareItem(p.item, round2(range.min - 0.99)).status).not.toBe('below_minimum');
        if (range.min >= 1.01) {
          expect(compareItem(p.item, round2(range.min - 1.01))).toMatchObject({
            status: 'below_minimum',
            difference: 1.01,
          });
        }
      }
    }
  });

  it('no widening: 1.01 € outside the narrowest legitimate method does show', () => {
    for (const { e } of cases) {
      const legitimate: Partial<Record<ItemId, number[]>> = {};
      if (!e.extraPayProrated && e.extraPayCount > 0) legitimate.extra_pay = legitimateExtraPay(e);
      const pending = METHODS.map((m) => pendingHolidays(e, m));
      const known = pending.filter((p) => p !== null);
      if (known.length > 0 && Math.max(...known) >= 0) {
        const days = [e.monthlySalary / 30, annualSalary(e) / 365];
        legitimate.holiday_pay = known.flatMap((p) => days.map((d) => Math.max(0, p) * d));
      }
      for (const p of review(e).items) {
        const figures = legitimate[p.item.id];
        if (figures === undefined) continue;
        const low = round2(Math.min(...figures));
        const high = round2(Math.max(...figures));
        const testCase = JSON.stringify([p.item.id, p.item.range, low, high, e]);
        if (low >= 1.01) {
          expect(compareItem(p.item, round2(low - 1.01)).status, testCase).toBe('below_minimum');
        }
        // One cent of slack: the oracle adds fractions before multiplying, so a half-cent can round the other way.
        expect(compareItem(p.item, round2(high + 1.02)).status, testCase).toBe('above_minimum');
      }
    }
  });

  it('no inverted or negative range', () => {
    for (const { e } of cases) {
      for (const p of review(e).items) {
        const { range } = p.item;
        if (range === null) continue;
        expect(range.min).toBeGreaterThanOrEqual(0);
        expect(range.max).toBeGreaterThanOrEqual(range.min);
      }
    }
  });
});
