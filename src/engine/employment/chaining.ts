import {
  addDays,
  addMonthsClamped,
  calendarDays,
  compareDates,
  max,
  min,
  parseDate,
  type CivilDate,
} from '../date';
import type { ContributionPeriod } from '../types';
import { phrase, type EmploymentPhrase } from './calculation';
import { cite, lastDayOf, settle, single, type Draft, type TemporalityDeps } from './fixed-term';
import { LAW_QUOTES } from './quotes';
import { assessAcross } from './readings';
import { RULES } from './rules';
import { scope } from './scope';
import {
  READINGS,
  type Assessed,
  type EmploymentInput,
  type Modality,
  type ReadingCode,
} from './types';

// 15.5: over eighteen months within twenty-four, through two or more production contracts.
const WINDOW_MONTHS = 24;
const LIMIT_MONTHS = 18;
const MIN_CONTRACTS = 2;
// Days either side of the limit read as too close to call: the day a contract starts or ends is
// not always counted the same way.
const NEAR_LIMIT_DAYS = 3;

const PRODUCTION: ReadonlySet<Modality> = new Set([
  'production',
  'production_occasional',
  'eventual',
]);
// Already open-ended: chaining cannot change anything.
const OPEN_ENDED: ReadonlySet<Modality> = new Set(['permanent', 'discontinuous']);

type Cutoff = ReadingCode<'chaining_cutoff'>;

interface Outcome {
  readonly kind: 'exceeds' | 'near' | 'within';
  readonly days: number;
  readonly limit: number;
  readonly contracts: number;
}

// The production contracts with the same company, the current one included, up to today.
function productionContracts(input: EmploymentInput, today: CivilDate): ContributionPeriod[] {
  const history = input.history ?? [];
  const same = history.filter((p) => p.employer === 'same' && p.kind === 'production');
  const current =
    PRODUCTION.has(input.modality) &&
    !history.some((p) => p.employer === 'same' && compareDates(p.startDate, input.startDate) === 0)
      ? [{ startDate: input.startDate, endDate: input.endDate ?? today }]
      : [];
  return [...same, ...current]
    .filter((p) => compareDates(p.startDate, today) <= 0)
    .map((p) => ({ startDate: p.startDate, endDate: min(p.endDate, today) }));
}

// Transitional provision 5.ª RDL 32/2021: of the contracts concluded before the cutoff, only the
// one in force on it counts.
const countedFrom = (contracts: readonly ContributionPeriod[], cutoff: CivilDate) =>
  contracts.filter(
    (p) => compareDates(p.startDate, cutoff) >= 0 || compareDates(p.endDate, cutoff) >= 0,
  );

// Days covered by the contracts inside [from, to], overlaps counted once.
function coveredDays(contracts: readonly ContributionPeriod[], from: CivilDate, to: CivilDate) {
  const inside = contracts
    .map((p) => ({ start: max(p.startDate, from), end: min(p.endDate, to) }))
    .filter((p) => compareDates(p.start, p.end) <= 0)
    .sort((a, b) => compareDates(a.start, b.start));
  let days = 0;
  let reached: CivilDate | null = null;
  for (const p of inside) {
    const start: CivilDate = reached === null ? p.start : max(p.start, addDays(reached, 1));
    if (compareDates(start, p.end) <= 0) days += calendarDays(start, p.end);
    reached = reached === null ? p.end : max(reached, p.end);
  }
  return { days, contracts: inside.length };
}

// The worst 24-month window: it starts on a contract's start or ends on a contract's end, where
// the covered days peak. O(n²) over at most a few dozen contracts.
function worstWindow(contracts: readonly ContributionPeriod[]): Outcome {
  const starts = contracts.flatMap((p) => [
    p.startDate,
    addMonthsClamped(addDays(p.endDate, 1), -WINDOW_MONTHS),
  ]);
  let worst: Outcome | null = null;
  let worstMargin = -Infinity;
  let widest = { days: 0, limit: 0, contracts: 0 };
  for (const from of starts) {
    const covered = coveredDays(contracts, from, lastDayOf(from, WINDOW_MONTHS));
    const limit = calendarDays(from, lastDayOf(from, LIMIT_MONTHS));
    const margin = covered.days - limit;
    if (covered.contracts >= MIN_CONTRACTS && margin > worstMargin) {
      const kind =
        margin > NEAR_LIMIT_DAYS ? 'exceeds' : margin >= -NEAR_LIMIT_DAYS ? 'near' : 'within';
      worst = { kind, days: covered.days, limit, contracts: covered.contracts };
      worstMargin = margin;
    }
    if (covered.days > widest.days) widest = { ...covered, limit };
  }
  return worst ?? { kind: 'within', ...widest };
}

function draftOf(outcome: Outcome, cutoffsAgree: boolean, notes: EmploymentPhrase[]): Draft {
  const figures = {
    dias: { integer: outcome.days },
    limite: { integer: outcome.limit },
    contratos: { integer: outcome.contracts },
  };
  const base = { id: 'chaining_18_in_24', item: 'chaining' } as const;
  switch (outcome.kind) {
    case 'exceeds':
      // Never quoted as permanent while the two readings of the cutoff disagree.
      return cutoffsAgree
        ? {
            ...base,
            status: 'becomes_permanent',
            calculation: [
              phrase('chaining.exceeds', figures),
              phrase('chaining.permanent'),
              ...notes,
            ],
            literal: LAW_QUOTES.chaining_18_in_24,
          }
        : {
            ...base,
            status: 'review_it',
            calculation: [
              phrase('chaining.exceeds', figures),
              phrase('chaining.depends_on_cutoff'),
              ...notes,
            ],
          };
    case 'near':
      return {
        ...base,
        status: 'review_it',
        calculation: [phrase('chaining.near_limit', figures), ...notes],
      };
    case 'within':
      return {
        ...base,
        status: 'within_limit',
        calculation: [phrase('chaining.within', figures), ...notes],
      };
  }
}

// Contracts of the history left out of the count, so the person knows what was not compared.
function leftOut(input: EmploymentInput): EmploymentPhrase[] {
  const history = input.history ?? [];
  const group = history.filter((p) => p.employer === 'same_group').length;
  const unknown = history.filter((p) => p.employer === 'same' && p.kind === 'unknown').length;
  return [
    ...(group > 0
      ? [phrase('chaining.same_group_not_counted', { contratos: { integer: group } })]
      : []),
    ...(unknown > 0
      ? [phrase('chaining.kind_unknown_not_counted', { contratos: { integer: unknown } })]
      : []),
  ];
}

// Art. 15.5 ET with the person's work history. Transitional provision 5.ª RDL 32/2021 counts only
// the contract in force when it took effect, and whether that is 31-12-2021 (the decree) or
// 30-03-2022 (the new art. 15) is not settled, so both cutoffs are read. Null when the contract
// is already open-ended.
export function reviewChaining(
  input: EmploymentInput,
  today: CivilDate,
  deps: TemporalityDeps,
): Assessed | null {
  const reach = scope(input);
  if (!reach.inScope || OPEN_ENDED.has(input.modality)) return null;
  const { norms } = deps;
  const base = { id: 'chaining_18_in_24', item: 'chaining' } as const;
  if (reach.partial) {
    return single(
      cite(
        {
          ...base,
          status: 'not_reviewed_in_this_version',
          calculation: [phrase('modality.before_reform')],
        },
        norms,
      ),
    );
  }
  if (input.history === null) {
    return single(
      settle(
        { ...base, status: 'not_entered', calculation: [phrase('chaining.no_history')] },
        today,
        norms,
      ),
    );
  }
  const cutoffs: Readonly<Record<Cutoff, CivilDate>> = {
    cutoff_2021_12_31: parseDate(norms.rdl32_2021.inForceSince),
    cutoff_2022_03_30: parseDate(RULES.chaining_18_in_24.from),
  };
  const contracts = productionContracts(input, today);
  const outcomes = Object.fromEntries(
    READINGS.chaining_cutoff.map((c) => [c, worstWindow(countedFrom(contracts, cutoffs[c]))]),
  ) as Record<Cutoff, Outcome>;
  const agree = new Set(Object.values(outcomes).map((o) => o.kind)).size === 1;
  const notes = leftOut(input);
  return assessAcross('chaining_cutoff', READINGS.chaining_cutoff, (cutoff) =>
    settle(draftOf(outcomes[cutoff], agree, notes), today, norms),
  );
}
