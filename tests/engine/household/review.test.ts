import { describe, expect, it } from 'vitest';
import { parseDate } from '../../../src/engine/date';
import {
  countedAmount,
  highestAmount,
  reviewHousehold,
  type HouseholdReview,
} from '../../../src/engine/household/review';
import { assessUnemployment } from '../../../src/engine/household/unemployment';
import type { Finding } from '../../../src/engine/household/types';
import { DEPS, desistimiento, household, TODAY } from './input';
import { NORMS } from './norms-table';

const review = (change = {}): HouseholdReview => {
  const result = reviewHousehold(household(change), TODAY, DEPS);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.review;
};

const ids = (r: HouseholdReview): string[] =>
  r.items.map((a) => (a.kind === 'single' ? a.finding.id : (a.readings[0]?.finding.id ?? '')));

const findings = (r: HouseholdReview): Finding[] =>
  r.items.flatMap((a) => (a.kind === 'single' ? [a.finding] : a.readings.map((x) => x.finding)));

describe('reviewHousehold', () => {
  it('reviews pay, working time and holidays of a running relationship', () => {
    const r = review();
    expect(r.scope).toEqual({ inScope: true });
    expect(ids(r)).toEqual([
      'smi_monthly',
      'extra_pays',
      'weekly_40',
      'rest_between_shifts',
      'weekly_rest_36',
      'holidays_30',
      'holidays_stretch_15',
    ]);
    expect(findings(r).every((f) => f.status === 'within_limit')).toBe(true);
    expect(r.finalPay).toBeNull();
    expect(r.unchecked).toEqual(['contributions', 'net_pay']);
  });

  it('every finding carries its source, a norm in force', () => {
    const r = review({ termination: desistimiento() });
    for (const f of findings(r)) {
      expect(f.sources.length, f.id).toBeGreaterThan(0);
      expect(f.sources[0]?.status).toBe('in_force');
      expect(f.sources[0]?.url.startsWith('https://www.boe.es/')).toBe(true);
    }
  });

  it('adds the termination, the severance, the notice and the unemployment note', () => {
    const r = review({ termination: desistimiento() });
    expect(ids(r).slice(7)).toEqual([
      'desistimiento_cause',
      'desistimiento_written',
      'dismissal_presumed',
      'desistimiento_severance',
      'desistimiento_notice',
      'desistimiento_leave',
      'unemployment_situation',
    ]);
    expect(r.finalPay?.kind).toBe('monthly');
    expect(r.unchecked).toContain('cause_truth');
  });

  it('reports pay in kind left out of the severance', () => {
    expect(review({ inKindMonthly: 100, termination: desistimiento() }).unchecked).toContain(
      'in_kind_in_severance',
    );
  });

  it('stops at the door for a relationship that ended before the reform', () => {
    const r = review({
      startDate: parseDate('2019-01-01'),
      termination: desistimiento({
        noticeGivenOn: parseDate('2022-08-01'),
        effectiveOn: parseDate('2022-08-20'),
      }),
    });
    expect(r.scope).toEqual({ inScope: false, reason: 'before_reform' });
    expect(r.items).toEqual([]);
    expect(r.scopeSource?.citation).toContain('disposición transitoria 1.ª');
  });

  it('returns the errors of an invalid input', () => {
    const result = reviewHousehold(household({ monthlyCash: -1 }), TODAY, DEPS);
    expect(result).toEqual({ ok: false, errors: [{ field: 'monthlyCash', code: 'amount_range' }] });
  });

  it('counts only money, never a warning, and the lowest of a doubtful point', () => {
    const r = review({
      startDate: parseDate('2020-03-01'),
      weeklyHours: 60,
      shortestRestHours: 4,
      termination: desistimiento({
        effectiveOn: parseDate('2026-06-15'),
        noticeGivenOn: parseDate('2026-05-26'),
        severanceOffered: 3000,
      }),
    });
    const warnings = r.items.filter((a) =>
      ['weekly_40', 'rest_between_shifts'].includes(a.kind === 'single' ? a.finding.id : ''),
    );
    expect(warnings.map(countedAmount)).toEqual([0, 0]);
    const severance = r.items.find(
      (a) => a.kind === 'readings' && a.question === 'incomplete_year',
    );
    expect(severance).toBeDefined();
    if (severance === undefined) return;
    expect(countedAmount(severance)).toBeLessThan(highestAmount(severance));
  });
});

describe('the unemployment note', () => {
  it('is information with no figure', () => {
    const f = assessUnemployment(household({ termination: desistimiento() }), NORMS);
    if (f?.kind !== 'single') throw new Error('expected one finding');
    expect(f.finding.status).toBe('information');
    expect(f.finding.amount).toBeNull();
    expect(f.finding.sources.map((s) => s.citation.split(' (')[0])).toEqual([
      'Ley General de la Seguridad Social, art. 267.1.a) 8.º',
      'Real Decreto-ley 16/2022, disposición transitoria 2.ª',
      'Ley General de la Seguridad Social, arts. 266.b), 269.2 y 270.2',
    ]);
  });

  it('is there from 09-09-2022, the day LGSS 267.1.a) 8.º came into force', () => {
    const on = (day: string) =>
      household({
        termination: desistimiento({
          noticeGivenOn: parseDate('2022-09-01'),
          effectiveOn: parseDate(day),
        }),
      });
    expect(assessUnemployment(on('2022-09-25'), NORMS)?.kind).toBe('single');
    expect(assessUnemployment(on('2022-09-09'), NORMS)?.kind).toBe('single');
    expect(assessUnemployment(on('2022-09-08'), NORMS)).toBeNull();
  });

  it('is left out for another cause of termination', () => {
    expect(
      assessUnemployment(household({ termination: desistimiento({ route: 'et_cause' }) }), NORMS),
    ).toBeNull();
    expect(assessUnemployment(household(), NORMS)).toBeNull();
  });
});
