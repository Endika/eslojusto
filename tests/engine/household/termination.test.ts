import { describe, expect, it } from 'vitest';
import { parseDate } from '../../../src/engine/date';
import { assessTermination } from '../../../src/engine/household/termination';
import type { Finding, HouseholdInput } from '../../../src/engine/household/types';
import { desistimiento, findingOf, household, single, singles, statusOf, DEPS } from './input';
import { NORMS } from './norms-table';

const run = (change: Partial<HouseholdInput> = {}, termination = {}) =>
  assessTermination(
    household({ termination: desistimiento(termination), ...change }),
    NORMS,
    DEPS.minimumWage,
  );

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

  it('only informs about another cause of art. 49.1 ET', () => {
    const items = run({}, { route: 'et_cause' });
    expect(singles(items).map((f) => f.id)).toEqual(['termination_causes']);
    expect(
      single(items, 'termination_causes').sources.map((s) => s.citation.split(' (')[0]),
    ).toEqual(['Real Decreto 1620/2011, art. 11.1', 'Estatuto de los Trabajadores, art. 49.1']);
  });
});

describe('the presumption of dismissal (art. 11.3)', () => {
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

  it('is not raised by what is not known, which goes to review', () => {
    expect(statusOf(run({}, { inWriting: null }), 'dismissal_presumed')).toBe('review_it');
    expect(statusOf(run({}, { severanceAvailable: null }), 'dismissal_presumed')).toBe('review_it');
  });
});

describe('no termination notice to a live-in worker from 17:00 to 08:00 (art. 11.4)', () => {
  const at = (noticeTime: string | null, termination = {}) =>
    statusOf(run({ liveIn: true }, { noticeTime, ...termination }), 'live_in_night_notice');

  it.each([
    ['00:00', 'missing_requirement'],
    ['08:00', 'review_it'],
  ])('a notice at %s is %s', (time, status) => {
    expect(at(time)).toBe(status);
  });

  it('asks for the time when it is not given', () => {
    expect(at(null)).toBe('not_entered');
  });
});

describe('what the findings of a desistimiento show', () => {
  const NOTICE_SHORT = {
    noticeGivenOn: parseDate('2026-09-01'),
    effectiveOn: parseDate('2026-09-10'),
  };
  const FAMILY = 'termination.cause.family_needs_change';
  const TRUTH = 'termination.cause_truth_not_judged';
  // [id, status, rests on the answer, keys of the calculation]
  type Row = [string, string, boolean, string[]];
  const legal: Row[] = [
    ['desistimiento_cause', 'within_limit', true, [FAMILY, TRUTH]],
    ['desistimiento_written', 'within_limit', true, ['termination.in_writing']],
  ];

  it.each<[string, Partial<HouseholdInput>, object, Row[]]>([
    [
      'another cause than the three',
      {},
      { cause: 'other' },
      [
        ['desistimiento_cause', 'missing_requirement', true, ['termination.cause_other']],
        legal[1] as Row,
        ['dismissal_presumed', 'within_limit', true, ['dismissal.none_of_the_two']],
      ],
    ],
    [
      'no cause in the notice',
      {},
      { cause: 'none' },
      [
        ['desistimiento_cause', 'missing_requirement', true, ['termination.cause_none']],
        [
          'desistimiento_written',
          'missing_requirement',
          true,
          ['termination.cause_not_in_writing'],
        ],
        [
          'dismissal_presumed',
          'dismissal_regime_presumed',
          true,
          ['dismissal.no_cause_in_writing'],
        ],
      ],
    ],
    [
      'a notice not in writing',
      {},
      { inWriting: false },
      [
        legal[0] as Row,
        ['desistimiento_written', 'missing_requirement', true, ['termination.not_in_writing']],
        ['dismissal_presumed', 'dismissal_regime_presumed', true, ['dismissal.no_written_notice']],
      ],
    ],
    [
      'no cause entered',
      {},
      { cause: null },
      [
        ['desistimiento_cause', 'not_entered', false, []],
        ['desistimiento_written', 'review_it', true, ['termination.writing_unknown']],
        ['dismissal_presumed', 'within_limit', true, ['dismissal.none_of_the_two']],
      ],
    ],
    [
      'it is not known whether it was in writing, and no cause',
      {},
      { inWriting: null, cause: 'none' },
      [
        ['desistimiento_cause', 'missing_requirement', true, ['termination.cause_none']],
        ['desistimiento_written', 'review_it', true, ['termination.writing_unknown']],
        ['dismissal_presumed', 'review_it', true, ['dismissal.unknown']],
      ],
    ],
    [
      'a severance made available of an amount not known',
      {},
      { severanceOffered: null },
      [...legal, ['dismissal_presumed', 'within_limit', true, ['dismissal.none_of_the_two']]],
    ],
    [
      'no severance made available',
      {},
      { severanceAvailable: false, severanceOffered: 1000 },
      [
        ...legal,
        ['dismissal_presumed', 'dismissal_regime_presumed', true, ['dismissal.no_severance']],
      ],
    ],
    [
      'a short notice and a short figure',
      {},
      { ...NOTICE_SHORT, severanceOffered: 1000 },
      [
        ...legal,
        [
          'dismissal_presumed',
          'review_it',
          true,
          ['dismissal.none_of_the_two', 'dismissal.short_notice', 'dismissal.figure_difference'],
        ],
      ],
    ],
    [
      'a figure exactly the one owed',
      {},
      { severanceOffered: 1380.82 },
      [...legal, ['dismissal_presumed', 'within_limit', true, ['dismissal.none_of_the_two']]],
    ],
  ])('%s', (_name, change, termination, expected) => {
    const shown = singles(run(change, termination)).map((f) => [
      f.id,
      f.status,
      f.basedOnYourAnswer,
      f.calculation.map((p) => p.key),
    ]);
    expect(shown).toEqual(expected);
    expect(singles(run(change, termination)).map((f) => f.item)).toEqual(
      expected.map(() => 'termination'),
    );
  });

  it('shows what each reading rests on for a worker of under a year', () => {
    const a = findingOf(
      run({ startDate: parseDate('2026-01-01') }, { severanceAvailable: false }),
      'dismissal_presumed',
    );
    if (a.kind !== 'readings') throw new Error('expected two readings');
    expect(
      a.readings.map((r) => [r.when, r.finding.status, r.finding.calculation.map((p) => p.key)]),
    ).toEqual([
      ['complete_years_only', 'within_limit', ['dismissal.none_of_the_two_no_severance_due']],
      ['prorated_by_months', 'dismissal_regime_presumed', ['dismissal.no_severance']],
    ]);
  });

  it('shows one phrase about another cause of termination, not resting on an answer', () => {
    const f = single(run({}, { route: 'et_cause' }), 'termination_causes');
    expect(f.calculation).toEqual([{ key: 'termination.et_cause' }]);
    expect(f.basedOnYourAnswer).toBe(false);
  });
});

describe('what the night notice shows', () => {
  it.each<[string, string | null, boolean, string, string[]]>([
    ['16:59', '16:59', false, 'within_limit', []],
    ['17:00', '17:00', false, 'review_it', ['night.on_the_hour']],
    ['17:01', '17:01', false, 'missing_requirement', ['night.inside']],
    [
      '20:00 with a very serious breach',
      '20:00',
      true,
      'review_it',
      ['night.serious_breach_alleged'],
    ],
  ])('a notice at %s', (_name, time, serious, status, extra) => {
    const f = single(
      run({ liveIn: true }, { noticeTime: time, seriousBreachAlleged: serious }),
      'live_in_night_notice',
    );
    expect(f.status).toBe(status);
    expect(f.basedOnYourAnswer).toBe(true);
    expect(f.calculation).toEqual([
      { key: 'night.notice_time', vars: { time } },
      ...extra.map((key) => ({ key })),
    ]);
  });
});
