import { toIso, type CivilDate } from '../date';
import { normStanding, type EnactedStatus, type NormStatus, type NormTable } from './norms';
import type { NormSource } from './sources';

export interface Rule<RuleId extends string, NormId extends string> {
  readonly id: RuleId;
  // The norm whose validity and status the rule follows.
  readonly norm: NormId;
  readonly article: string;
  readonly url: string;
  // The days the rule covers, read against whichever date it is checked on (signing day,
  // anniversary…). A null `until` lasts as long as the norm.
  readonly from: string;
  readonly until: string | null;
  // A later rule that takes its place once that rule is certainly in force.
  readonly supersededBy: RuleId | null;
}

export type RuleTable<RuleId extends string, NormId extends string> = Readonly<
  Record<RuleId, Rule<RuleId, NormId>>
>;

// What a rule gives the person: an amount, a date, a position against a reference, or text.
export type RuleOutput = 'amount' | 'date' | 'indicator' | 'info';

// A rule that says what it outputs and which sources, besides its norm, it rests on.
export interface RuleBase<SourceId extends string = string> {
  readonly id: string;
  // Null when the rule rests only on its sources, as a court's criterion does.
  readonly norm: string | null;
  readonly output: RuleOutput;
  readonly sources: readonly SourceId[];
}

export function ruleSource<RuleId extends string, NormId extends string, Status extends NormStatus>(
  rules: RuleTable<RuleId, NormId>,
  id: RuleId,
  norms: NormTable<NormId, Status>,
): NormSource<Status> {
  const { article, url, norm: normId } = rules[id];
  const norm = norms[normId];
  return {
    id,
    citation: `${article} (${norm.citation})`,
    url,
    inForceSince: norm.inForceSince,
    inForceUntil: norm.inForceUntil,
    endUncertainUntil: norm.endUncertainUntil ?? null,
    status: norm.status,
    statusSince: norm.statusSince,
    statusUrl: norm.statusUrl,
  };
}

export type RuleDoubt = 'pending_validation' | 'repealed_window' | 'conditional';

// The doubts a table of norms with these statuses can open.
export type RuleDoubtOf<Status extends NormStatus> =
  | (Status extends 'pending_validation' ? 'pending_validation' : never)
  | (Status extends 'repealed' ? 'repealed_window' : never)
  | (Status extends 'conditional' ? 'conditional' : never);

export interface ActiveRule<
  RuleId extends string,
  NormId extends string,
  Status extends NormStatus = EnactedStatus,
> {
  readonly rule: Rule<RuleId, NormId>;
  // Why the rule may or may not apply that day; a rule displaced by a doubtful successor carries
  // the successor's doubt.
  readonly doubt: RuleDoubtOf<Status> | null;
}

export function activeRules<
  RuleId extends string,
  NormId extends string,
  Status extends NormStatus,
>(
  rules: RuleTable<RuleId, NormId>,
  date: CivilDate,
  norms: NormTable<NormId, Status>,
): readonly ActiveRule<RuleId, NormId, Status>[] {
  const day = toIso(date);
  const standing = (r: Rule<RuleId, NormId>) => {
    if (day < r.from || (r.until !== null && day > r.until)) return 'not_in_force';
    return normStanding(norms[r.norm], day);
  };
  const active: ActiveRule<RuleId, NormId, Status>[] = [];
  for (const r of Object.values<Rule<RuleId, NormId>>(rules)) {
    const own = standing(r);
    if (own === 'not_in_force') continue;
    const successor = r.supersededBy === null ? 'not_in_force' : standing(rules[r.supersededBy]);
    if (successor === 'in_force') continue;
    const ownDoubt = own === 'in_force' ? null : own;
    const successorDoubt = successor === 'not_in_force' ? null : successor;
    // A standing other than in force comes only from a status the table holds.
    const doubt = (ownDoubt ?? successorDoubt) as RuleDoubtOf<Status> | null;
    active.push({ rule: r, doubt });
  }
  return active;
}
