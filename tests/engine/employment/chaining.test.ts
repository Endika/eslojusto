import { describe, expect, it } from 'vitest';
import { parseDate } from '../../../src/engine/date';
import { reviewChaining } from '../../../src/engine/employment/chaining';
import { EMPLOYMENT_NORMS } from '../../../src/engine/employment/data/norms';
import type { NormTable } from '../../../src/engine/employment/norms';
import { LAW_QUOTES } from '../../../src/engine/employment/quotes';
import { offerPass } from '../../../src/engine/employment/readings';
import type {
  Assessed,
  EmploymentInput,
  EmploymentPeriod,
  Finding,
} from '../../../src/engine/employment/types';
import { contract } from './input';

const TODAY = parseDate('2026-10-07');
const deps = { norms: EMPLOYMENT_NORMS };

const period = (
  start: string,
  end: string,
  change: Partial<Pick<EmploymentPeriod, 'employer' | 'kind'>> = {},
): EmploymentPeriod => ({
  startDate: parseDate(start),
  endDate: parseDate(end),
  employer: 'same',
  kind: 'production',
  ...change,
});

// The current production contract and the earlier ones from the work history.
const chained = (
  current: [string, string | null],
  history: EmploymentPeriod[] | null,
  change: Partial<EmploymentInput> = {},
): EmploymentInput =>
  contract({
    modality: 'production',
    startDate: parseDate(current[0]),
    signedOn: parseDate(current[0]),
    endDate: current[1] === null ? null : parseDate(current[1]),
    causeStated: true,
    circumstancesStated: true,
    history,
    ...change,
  });

const review = (input: EmploymentInput, norms: NormTable = EMPLOYMENT_NORMS): Assessed => {
  const assessed = reviewChaining(input, TODAY, { norms });
  if (assessed === null) throw new Error('chaining not assessed');
  return assessed;
};

const only = (assessed: Assessed): Finding => {
  if (assessed.kind !== 'single') throw new Error('expected a single finding');
  return assessed.finding;
};

describe('reviewChaining', () => {
  it('without the work history it explains the rule without a verdict', () => {
    const f = only(review(chained(['2025-01-01', '2025-06-30'], null)));
    expect(f.status).toBe('not_entered');
    expect(f.calculation).toEqual([{ key: 'chaining.no_history' }]);
    expect(f.sources.map((s) => s.id)).toEqual(['chaining_18_in_24']);
  });

  it('17 months within 24 through two contracts are within the limit', () => {
    // 2023-01-01..2023-08-31 (8 months) and 2023-10-01..2024-06-30 (9 months).
    const f = only(
      review(chained(['2023-10-01', '2024-06-30'], [period('2023-01-01', '2023-08-31')])),
    );
    expect(f.status).toBe('within_limit');
    expect(f.calculation[0]).toEqual({
      key: 'chaining.within',
      vars: { dias: { integer: 517 }, limite: { integer: 547 }, contratos: { integer: 2 } },
    });
  });

  it('19 months within 24 through two contracts: art. 15.5 quoted, never asserted', () => {
    // 2023-01-01..2023-09-30 (9 months) and 2023-11-01..2024-08-31 (10 months).
    const input = chained(['2023-11-01', '2024-08-31'], [period('2023-01-01', '2023-09-30')]);
    const f = only(review(input));
    expect(f.status).toBe('becomes_permanent');
    expect(f.calculation.map((p) => p.key)).toEqual(['chaining.exceeds', 'chaining.permanent']);
    expect(f.literal).toEqual(LAW_QUOTES.chaining_18_in_24);
    expect(f.sources[0]?.url).toBe('https://www.boe.es/buscar/act.php?id=BOE-A-2015-11430#a15');
    expect(offerPass([review(input)])).toBe(true);
  });

  it('a history cut to its most recent rows never reads as within the limit', () => {
    const input = chained(['2023-10-01', '2024-06-30'], [period('2023-01-01', '2023-08-31')], {
      historyIncomplete: true,
    });
    const f = only(review(input));
    expect(f.status).toBe('review_it');
    expect(f.calculation.map((p) => p.key)).toEqual([
      'chaining.within',
      'chaining.history_incomplete',
    ]);
    expect(offerPass([review(input)])).toBe(false);
  });

  it('a cut history that already passes the limit still quotes art. 15.5: older rows only add', () => {
    const input = chained(['2023-11-01', '2024-08-31'], [period('2023-01-01', '2023-09-30')], {
      historyIncomplete: true,
    });
    expect(only(review(input)).status).toBe('becomes_permanent');
  });

  it('a cut history near the limit says older rows may be missing too', () => {
    const f = only(
      review(
        chained(['2023-03-03', '2024-06-30'], [period('2023-01-01', '2023-03-01')], {
          historyIncomplete: true,
        }),
      ),
    );
    expect(f.status).toBe('review_it');
    expect(f.calculation.map((p) => p.key)).toEqual([
      'chaining.near_limit',
      'chaining.history_incomplete',
    ]);
  });

  it('a single contract of 19 months is not a chain', () => {
    const f = only(review(chained(['2024-01-01', '2025-07-31'], [])));
    expect(f.status).toBe('within_limit');
    expect(f.calculation[0]?.vars?.contratos).toEqual({ integer: 1 });
  });

  it('the current contract is not counted twice when the history lists it', () => {
    const input = chained(['2024-01-01', '2025-07-31'], [period('2024-01-01', '2025-07-31')]);
    expect(only(review(input)).calculation[0]?.vars?.contratos).toEqual({ integer: 1 });
  });

  it('days a few either side of the limit are only asked to review', () => {
    // The 18 months from 2023-01-01 are 547 days; 546 are covered.
    const f = only(
      review(chained(['2023-03-03', '2024-06-30'], [period('2023-01-01', '2023-03-01')])),
    );
    expect(f.status).toBe('review_it');
    expect(f.calculation[0]?.key).toBe('chaining.near_limit');
  });

  it('contracts with another company, of another kind or of unknown kind never add up', () => {
    const history = [
      period('2023-01-01', '2023-09-30', { employer: 'other' }),
      period('2023-01-01', '2023-09-30', { kind: 'unknown' }),
      period('2022-06-01', '2022-12-31', { kind: 'replacement' }),
    ];
    const f = only(review(chained(['2023-11-01', '2024-08-31'], history)));
    expect(f.status).toBe('within_limit');
    expect(f.calculation).toEqual([
      {
        key: 'chaining.within',
        vars: { dias: { integer: 305 }, limite: { integer: 547 }, contratos: { integer: 1 } },
      },
      { key: 'chaining.kind_unknown_not_counted', vars: { contratos: { integer: 1 } } },
    ]);
  });

  it.each<EmploymentPeriod['employer']>(['same_group', 'same_via_agency'])(
    'when a %s contract decides it, each reading is labelled and none is permanent',
    (employer) => {
      const input = chained(
        ['2023-11-01', '2024-08-31'],
        [period('2023-01-01', '2023-09-30', { employer })],
      );
      const assessed = review(input);
      expect(assessed.kind).toBe('readings');
      if (assessed.kind !== 'readings') return;
      expect(assessed.question).toBe('chaining_group');
      expect(assessed.readings.map((r) => [r.when, r.finding.status])).toEqual([
        ['group_counted', 'review_it'],
        ['group_not_counted', 'within_limit'],
      ]);
      expect(assessed.readings[0]?.finding.calculation.map((p) => p.key)).toEqual([
        'chaining.exceeds',
        'chaining.depends_on_group',
      ]);
      expect(offerPass([assessed])).toBe(false);
    },
  );

  it('a group contract that changes nothing is only noted', () => {
    const input = chained(
      ['2023-11-01', '2024-08-31'],
      [
        period('2023-01-01', '2023-09-30'),
        period('2022-01-10', '2022-02-28', { employer: 'same_group' }),
      ],
    );
    const f = only(review(input));
    expect(f.status).toBe('becomes_permanent');
    expect(f.calculation.at(-1)).toEqual({
      key: 'chaining.same_group_not_counted',
      vars: { contratos: { integer: 1 } },
    });
  });

  it.each([
    ['starts two days later', '2024-01-03', '2025-07-31'],
    ['ends two days earlier', '2024-01-01', '2025-07-29'],
    ['starts a day earlier', '2023-12-31', '2025-07-31'],
  ])('a history period that %s than the current contract is the same contract', (_, start, end) => {
    const f = only(review(chained(['2024-01-01', '2025-07-31'], [period(start, end)])));
    expect(f.status).toBe('within_limit');
    expect(f.calculation[0]?.vars?.contratos).toEqual({ integer: 1 });
  });

  // Reads split by overlap: as one contract, within the limit; as separate contracts, over it.
  const splitByOverlap = (assessed: Assessed) => {
    expect(assessed.kind).toBe('readings');
    if (assessed.kind !== 'readings') return;
    expect(assessed.question).toBe('chaining_overlap');
    expect(assessed.readings.map((r) => [r.when, r.finding.status])).toEqual([
      ['overlap_same_contract', 'within_limit'],
      ['overlap_separate_contracts', 'review_it'],
    ]);
    expect(assessed.readings[1]?.finding.calculation.map((p) => p.key)).toEqual([
      'chaining.exceeds',
      'chaining.depends_on_overlap',
    ]);
    expect(offerPass([assessed])).toBe(false);
  };

  it('two overlapping history periods may be one contract or two', () => {
    const input = chained(
      ['2025-09-01', null],
      [period('2024-01-01', '2025-07-31'), period('2024-01-02', '2025-07-30')],
      { modality: 'replacement' },
    );
    splitByOverlap(review(input));
  });

  it('leaving and rejoining on the same day may be one contract or a 20-month chain', () => {
    splitByOverlap(
      review(chained(['2024-12-31', '2025-08-31'], [period('2024-01-01', '2024-12-31')])),
    );
  });

  it('a row that holds the current contract and an earlier stretch is never read as within for sure', () => {
    splitByOverlap(
      review(chained(['2025-03-01', '2025-05-31'], [period('2023-06-01', '2025-12-31')])),
    );
  });

  it('a row holding the current contract, plus an earlier contract, is a chain either way', () => {
    const input = chained(
      ['2025-03-01', '2025-05-31'],
      [period('2023-06-01', '2025-12-31'), period('2023-01-01', '2023-05-31')],
    );
    expect(only(review(input)).status).toBe('becomes_permanent');
  });

  it('a group row bridging two company contracts never merges them', () => {
    const input = chained(
      ['2025-01-01', '2025-08-31'],
      [
        period('2024-01-01', '2024-08-31'),
        period('2024-08-15', '2025-01-15', { employer: 'same_group' }),
      ],
    );
    const assessed = review(input);
    expect(assessed.kind).toBe('readings');
    if (assessed.kind !== 'readings') return;
    expect(assessed.question).toBe('chaining_group');
    expect(
      assessed.readings.map((r) => [
        r.when,
        r.finding.status,
        r.finding.calculation[0]?.vars?.contratos,
      ]),
    ).toEqual([
      ['group_counted', 'review_it', { integer: 3 }],
      ['group_not_counted', 'within_limit', { integer: 2 }],
    ]);
    expect(assessed.readings[0]?.finding.calculation.map((p) => p.key)).toContain(
      'chaining.depends_on_group',
    );
  });

  it('a contract ending the day before the next starts is a second contract', () => {
    const input = chained(['2024-01-01', '2024-08-31'], [period('2023-01-01', '2023-12-31')]);
    const f = only(review(input));
    expect(f.status).toBe('becomes_permanent');
    expect(f.calculation[0]?.vars?.contratos).toEqual({ integer: 2 });
  });

  it('of the 2021 contracts only the one in force on the cutoff counts', () => {
    // 2021-03-01..2021-11-30 ended before both cutoffs: with it, 20 months in 24.
    const ended = chained(['2022-04-01', '2023-02-28'], [period('2021-03-01', '2021-11-30')]);
    expect(only(review(ended)).status).toBe('within_limit');
    // 2021-11-01..2022-05-31 was in force on both: 7 + 13 months.
    const running = chained(['2022-06-01', '2023-06-30'], [period('2021-11-01', '2022-05-31')]);
    expect(only(review(running)).status).toBe('becomes_permanent');
  });

  it('a contract between the two cutoffs splits the readings and only asks to review', () => {
    // 2022-01-10..2022-03-01 counts from 31-12-2021 but not from 30-03-2022.
    const input = chained(['2022-04-01', '2023-08-31'], [period('2022-01-10', '2022-03-01')]);
    const assessed = review(input);
    expect(assessed.kind).toBe('readings');
    if (assessed.kind !== 'readings') return;
    expect(assessed.question).toBe('chaining_cutoff');
    expect(assessed.readings.map((r) => [r.when, r.finding.status])).toEqual([
      ['cutoff_2021_12_31', 'review_it'],
      ['cutoff_2022_03_30', 'within_limit'],
    ]);
    expect(assessed.readings[0]?.finding.calculation.map((p) => p.key)).toEqual([
      'chaining.exceeds',
      'chaining.depends_on_cutoff',
    ]);
    expect(assessed.readings.some((r) => r.finding.status === 'becomes_permanent')).toBe(false);
    expect(offerPass([assessed])).toBe(false);
  });

  it('takes the first cutoff from the injected norm table', () => {
    const norms: NormTable = {
      ...EMPLOYMENT_NORMS,
      rdl32_2021: { ...EMPLOYMENT_NORMS.rdl32_2021, inForceSince: '2022-03-30' },
    };
    const input = chained(['2022-04-01', '2023-08-31'], [period('2022-01-10', '2022-03-01')]);
    expect(only(review(input, norms)).status).toBe('within_limit');
  });

  it('counts the current contract up to today when it has no end', () => {
    const input = chained(['2025-04-01', null], [period('2024-10-01', '2025-03-15')]);
    expect(only(review(input)).status).toBe('becomes_permanent');
  });

  it('is not assessed for an open-ended contract or out of scope', () => {
    expect(reviewChaining(contract({ history: [] }), TODAY, deps)).toBeNull();
    expect(
      reviewChaining(contract({ modality: 'discontinuous', history: [] }), TODAY, deps),
    ).toBeNull();
    expect(
      reviewChaining(chained(['2025-01-01', null], [], { viaTempAgency: true }), TODAY, deps),
    ).toBeNull();
  });

  it('a contract concluded before the reform is not reviewed in this version', () => {
    const f = only(review(chained(['2022-02-01', '2022-07-31'], [])));
    expect(f.status).toBe('not_reviewed_in_this_version');
  });
});
