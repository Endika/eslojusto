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
  type EmploymentPeriod,
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

// Read in this order when choosing which doubt labels the readings.
const DIMENSIONS = ['chaining_group', 'chaining_overlap', 'chaining_cutoff'] as const;

const SEVERITY: Readonly<Record<Outcome['kind'], number>> = { within: 0, near: 1, exceeds: 2 };

interface Outcome {
  readonly kind: 'exceeds' | 'near' | 'within';
  readonly days: number;
  readonly limit: number;
  readonly contracts: number;
}

type Overlap = ReadingCode<'chaining_overlap'>;

// Group and agency placements at the same company only add up in the reading that counts them,
// since the person's history may not tell them apart; they never merge two company contracts.
const GROUP_EMPLOYERS: ReadonlySet<EmploymentPeriod['employer']> = new Set([
  'same_group',
  'same_via_agency',
]);

// A history row this close to the current contract at both ends is the current contract.
const SAME_CONTRACT_DAYS = 3;

const overlap = (a: ContributionPeriod, b: ContributionPeriod): boolean =>
  compareDates(a.startDate, b.endDate) <= 0 && compareDates(b.startDate, a.endDate) <= 0;

const near = (a: CivilDate, b: CivilDate): boolean =>
  Math.abs(compareDates(a, b)) <= SAME_CONTRACT_DAYS;

// Overlapping periods taken as pieces of one contract.
function merged(periods: readonly ContributionPeriod[]): ContributionPeriod[] {
  const sorted = [...periods].sort((a, b) => compareDates(a.startDate, b.startDate));
  const out: ContributionPeriod[] = [];
  for (const p of sorted) {
    const last = out.at(-1);
    if (last !== undefined && overlap(last, p)) {
      out[out.length - 1] = { startDate: last.startDate, endDate: max(last.endDate, p.endDate) };
    } else out.push(p);
  }
  return out;
}

interface Contracts {
  // Same-company contracts, with any other overlap read as one contract or as several.
  readonly company: Readonly<Record<Overlap, readonly ContributionPeriod[]>>;
  readonly group: readonly ContributionPeriod[];
}

// The production contracts that may add up, the current one included, up to today.
function productionContracts(input: EmploymentInput, today: CivilDate): Contracts {
  const upToToday = (ps: readonly ContributionPeriod[]) =>
    ps
      .filter((p) => compareDates(p.startDate, today) <= 0)
      .map((p) => ({ startDate: p.startDate, endDate: min(p.endDate, today) }));
  const current = { startDate: input.startDate, endDate: input.endDate ?? today };
  const isProduction = PRODUCTION.has(input.modality);
  const rows = (input.history ?? []).filter((p) => p.kind === 'production');
  const company = rows.filter(
    (p) =>
      p.employer === 'same' &&
      !(near(p.startDate, current.startDate) && near(p.endDate, current.endDate)),
  );
  // As one contract, a cluster holding the current contract is the current contract, counted
  // only when that is a production contract.
  const clusters = merged([...company, current]).filter(
    (c) => isProduction || !overlap(c, current),
  );
  return {
    company: {
      overlap_same_contract: upToToday(clusters),
      overlap_separate_contracts: upToToday(isProduction ? [...company, current] : company),
    },
    group: upToToday(rows.filter((p) => GROUP_EMPLOYERS.has(p.employer))),
  };
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

type Dimension = (typeof DIMENSIONS)[number];

const DEPENDS_ON = {
  chaining_group: 'chaining.depends_on_group',
  chaining_overlap: 'chaining.depends_on_overlap',
  chaining_cutoff: 'chaining.depends_on_cutoff',
} as const;

// A history holding only its most recent rows may leave out older contracts, which could only add
// to the count: a count within the limit can't be confirmed, one past it stands.
function draftOf(
  outcome: Outcome,
  doubts: readonly Dimension[],
  notes: EmploymentPhrase[],
  incomplete: boolean,
): Draft {
  const dependsOn = doubts.map((d) => phrase(DEPENDS_ON[d]));
  const cut = incomplete ? [phrase('chaining.history_incomplete')] : [];
  const figures = {
    dias: { integer: outcome.days },
    limite: { integer: outcome.limit },
    contratos: { integer: outcome.contracts },
  };
  const base = { id: 'chaining_18_in_24', item: 'chaining' } as const;
  switch (outcome.kind) {
    case 'exceeds':
      // Never quoted as permanent while the readings disagree.
      return doubts.length === 0
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
            calculation: [phrase('chaining.exceeds', figures), ...dependsOn, ...notes],
          };
    case 'near':
      return {
        ...base,
        status: 'review_it',
        calculation: [phrase('chaining.near_limit', figures), ...cut, ...dependsOn, ...notes],
      };
    case 'within':
      return {
        ...base,
        status: incomplete ? 'review_it' : 'within_limit',
        calculation: [phrase('chaining.within', figures), ...cut, ...notes],
      };
  }
}

// Contracts of the history left out of the count, so the person knows what was not compared.
function leftOut(input: EmploymentInput, groupRead: boolean): EmploymentPhrase[] {
  const history = input.history ?? [];
  const group = groupRead
    ? 0
    : history.filter((p) => p.employer === 'same_group' || p.employer === 'same_via_agency').length;
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
// 30-03-2022 (the new art. 15) is not settled, so both cutoffs are read. Group or agency placements,
// and overlapping rows that may be one contract or several, open their own readings when they
// decide the outcome. Null when the contract is already open-ended.
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
  const ambiguous =
    contracts.company.overlap_same_contract.length !==
    contracts.company.overlap_separate_contracts.length;
  const worlds = READINGS.chaining_group.flatMap((group) =>
    READINGS.chaining_overlap
      .filter((o) => ambiguous || o === 'overlap_same_contract')
      .flatMap((overlapRead) =>
        READINGS.chaining_cutoff.map((cutoff) => {
          const world = {
            chaining_group: group,
            chaining_overlap: overlapRead,
            chaining_cutoff: cutoff,
          };
          const counted = [
            ...contracts.company[overlapRead],
            ...(group === 'group_counted' ? contracts.group : []),
          ];
          return { world, outcome: worstWindow(countedFrom(counted, cutoffs[cutoff])) };
        }),
      ),
  );
  type Cell = (typeof worlds)[number];
  // A doubt matters when changing only its answer changes the outcome.
  const matters = (dim: Dimension, cells: readonly Cell[]): boolean => {
    const byRest = new Map<string, Set<Outcome['kind']>>();
    for (const { world, outcome } of cells) {
      const rest = DIMENSIONS.filter((d) => d !== dim)
        .map((d) => world[d])
        .join('|');
      byRest.set(rest, (byRest.get(rest) ?? new Set()).add(outcome.kind));
    }
    return [...byRest.values()].some((kinds) => kinds.size > 1);
  };
  const groupMatters = matters('chaining_group', worlds);
  const notes = leftOut(input, groupMatters);
  const question = DIMENSIONS.find((d) => matters(d, worlds));
  if (question === undefined) {
    return assessAcross('chaining_cutoff', READINGS.chaining_cutoff, (cutoff) => {
      const cell = worlds.find(
        (c) => c.world.chaining_cutoff === cutoff && c.world.chaining_group === 'group_not_counted',
      );
      if (cell === undefined) throw new RangeError(`no world for ${cutoff}`);
      return settle(draftOf(cell.outcome, [], notes, input.historyIncomplete), today, norms);
    });
  }
  // Each reading shows its worst world, marked with every doubt that still decides it.
  const answers = [...new Set(worlds.map((c) => c.world[question]))] as ReadingCode<Dimension>[];
  return assessAcross(question, answers, (answer) => {
    const cells = worlds.filter((c) => c.world[question] === answer);
    const worst = cells.reduce((a, b) =>
      SEVERITY[b.outcome.kind] > SEVERITY[a.outcome.kind] ||
      (b.outcome.kind === a.outcome.kind && b.outcome.days > a.outcome.days)
        ? b
        : a,
    ).outcome;
    const doubts = [question, ...DIMENSIONS.filter((d) => d !== question && matters(d, cells))];
    return settle(draftOf(worst, doubts, notes, input.historyIncomplete), today, norms);
  });
}
