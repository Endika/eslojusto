import { describe, expect, it } from 'vitest';
import { parseDate } from '../../../src/engine/date';
import { assessTermination } from '../../../src/engine/household/termination';
import type { Finding, HouseholdInput } from '../../../src/engine/household/types';
import { desistimiento, findingOf, household, single, singles, statusOf } from './input';
import { NORMS } from './norms-table';

const run = (change: Partial<HouseholdInput> = {}, termination = {}) =>
  assessTermination(household({ termination: desistimiento(termination), ...change }), NORMS);

const keys = (f: Finding) => f.calculation.map((p) => p.key);

describe('the cause of a desistimiento (art. 11.2)', () => {
  it.each(['income_drop_or_expense_rise', 'family_needs_change', 'loss_of_trust'] as const)(
    'accepts the category %s, without judging whether it is true',
    (cause) => {
      const f = single(run({}, { cause }), 'desistimiento_cause');
      expect(f.status).toBe('within_limit');
      expect(keys(f)).toContain('termination.cause_truth_not_judged');
    },
  );

  it('refuses another cause and none at all', () => {
    expect(statusOf(run({}, { cause: 'other' }), 'desistimiento_cause')).toBe(
      'missing_requirement',
    );
    expect(statusOf(run({}, { cause: 'none' }), 'desistimiento_cause')).toBe('missing_requirement');
    expect(statusOf(run({}, { cause: null }), 'desistimiento_cause')).toBe('not_entered');
  });

  it('requires the notice in writing, stating the cause', () => {
    expect(statusOf(run(), 'desistimiento_written')).toBe('within_limit');
    expect(statusOf(run({}, { inWriting: false }), 'desistimiento_written')).toBe(
      'missing_requirement',
    );
    expect(statusOf(run({}, { cause: 'none' }), 'desistimiento_written')).toBe(
      'missing_requirement',
    );
    expect(statusOf(run({}, { inWriting: null }), 'desistimiento_written')).toBe('review_it');
    expect(statusOf(run({}, { cause: null }), 'desistimiento_written')).toBe('review_it');
  });

  it('only informs about another cause of art. 49.1 ET', () => {
    const items = run({}, { route: 'et_cause' });
    expect(singles(items).map((f) => f.id)).toEqual(['termination_causes']);
    expect(
      single(items, 'termination_causes').sources.map((s) => s.citation.split(' (')[0]),
    ).toEqual(['Real Decreto 1620/2011, art. 11.1', 'Estatuto de los Trabajadores, art. 49.1']);
  });

  it('says nothing without a termination', () => {
    expect(assessTermination(household(), NORMS)).toEqual([]);
  });
});

describe('the presumption of dismissal (art. 11.3)', () => {
  it('is not raised when the notice is written and the severance made available', () => {
    expect(statusOf(run(), 'dismissal_presumed')).toBe('within_limit');
  });

  it('is raised without the written notice', () => {
    const f = single(run({}, { inWriting: false }), 'dismissal_presumed');
    expect(f.status).toBe('dismissal_regime_presumed');
    expect(keys(f)).toContain('dismissal.no_written_notice');
  });

  it('is only doubtful under a year of service: nothing was owed in the counted reading', () => {
    // 10 months of service and nothing made available: no complete year, so no severance counted.
    const a = findingOf(
      run(
        { startDate: parseDate('2025-11-01') },
        { effectiveOn: parseDate('2026-09-01'), severanceAvailable: false, severanceOffered: null },
      ),
      'dismissal_presumed',
    );
    if (a.kind !== 'readings') throw new Error('expected two readings');
    expect(a.question).toBe('incomplete_year');
    expect(a.readings.map((r) => [r.when, r.finding.status])).toEqual([
      ['complete_years_only', 'within_limit'],
      ['prorated_by_months', 'dismissal_regime_presumed'],
    ]);
  });

  it('is raised without the severance made available', () => {
    const f = single(run({}, { severanceAvailable: false }), 'dismissal_presumed');
    expect(f.status).toBe('dismissal_regime_presumed');
    expect(keys(f)).toEqual(['dismissal.no_severance']);
  });

  it('is raised for both, and names both', () => {
    const f = single(
      run({}, { inWriting: false, severanceAvailable: false }),
      'dismissal_presumed',
    );
    expect(keys(f)).toEqual(['dismissal.no_written_notice', 'dismissal.no_severance']);
  });

  it('is not raised by a short notice: the difference is owed, not the presumption', () => {
    const f = single(
      run(
        { startDate: parseDate('2020-03-01') },
        { noticeGivenOn: parseDate('2026-09-01'), effectiveOn: parseDate('2026-09-05') },
      ),
      'dismissal_presumed',
    );
    expect(f.status).toBe('within_limit');
    expect(keys(f)).toContain('dismissal.short_notice');
  });

  it('is not raised by an error in the figure, which stays for review', () => {
    const f = single(
      run({ startDate: parseDate('2020-03-01') }, { severanceOffered: 100 }),
      'dismissal_presumed',
    );
    expect(f.status).toBe('review_it');
    expect(keys(f)).toContain('dismissal.figure_difference');
  });

  it('is not raised by what is not known, which goes to review', () => {
    expect(statusOf(run({}, { inWriting: null }), 'dismissal_presumed')).toBe('review_it');
    expect(statusOf(run({}, { severanceAvailable: null }), 'dismissal_presumed')).toBe('review_it');
  });

  it('is raised even when the other point is not known', () => {
    expect(
      statusOf(run({}, { inWriting: false, severanceAvailable: null }), 'dismissal_presumed'),
    ).toBe('dismissal_regime_presumed');
  });
});

describe('no termination notice to a live-in worker from 17:00 to 08:00 (art. 11.4)', () => {
  const at = (noticeTime: string | null, termination = {}) =>
    statusOf(run({ liveIn: true }, { noticeTime, ...termination }), 'live_in_night_notice');

  it.each([
    ['08:01', 'within_limit'],
    ['12:00', 'within_limit'],
    ['16:59', 'within_limit'],
    ['17:00', 'review_it'],
    ['17:01', 'missing_requirement'],
    ['23:59', 'missing_requirement'],
    ['00:00', 'missing_requirement'],
    ['07:59', 'missing_requirement'],
    ['08:00', 'review_it'],
  ])('a notice at %s is %s', (time, status) => {
    expect(at(time)).toBe(status);
  });

  it('leaves a very serious breach of loyalty and trust to review, as the law allows', () => {
    expect(at('20:00', { seriousBreachAlleged: true })).toBe('review_it');
    expect(at('20:00', { seriousBreachAlleged: false })).toBe('missing_requirement');
  });

  it('asks for the time when it is not given', () => {
    expect(at(null)).toBe('not_entered');
  });

  it('does not apply to a worker who lives out', () => {
    const items = run({ liveIn: false }, { noticeTime: '23:00' });
    expect(singles(items).map((f) => f.id)).not.toContain('live_in_night_notice');
  });
});
