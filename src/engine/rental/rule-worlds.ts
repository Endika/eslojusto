import { toIso, type CivilDate } from '../date';
import { normStanding, type NormId, type NormTable } from './norms';
import { uniqueById, type Doubt, type World } from './outcome';
import { activeRules, RULES, type ActiveRule, type RuleId } from './rules';

// One doubt per norm, shared by every item and year that rests on it: a norm is validated or
// repealed for the whole review at once.
export const normDoubtId = (norm: NormId): string => `norm:${norm}`;

// The norm whose doubt an active rule carries: its own, or the doubtful successor's.
export function doubtNorm(active: ActiveRule, day: string, norms: NormTable): NormId | null {
  if (active.doubt === null) return null;
  if (normStanding(norms[active.rule.norm], day) !== 'in_force') return active.rule.norm;
  const successor = active.rule.supersededBy;
  return successor === null ? null : RULES[successor].norm;
}

// Whether an active rule holds in a reading: a doubtful rule holds when its norm does, and a rule
// displaced by a doubtful successor holds when the successor does not.
export function ruleHolds(
  active: ReadonlyMap<RuleId, ActiveRule>,
  id: RuleId,
  world: World,
  day: string,
  norms: NormTable,
): boolean {
  const a = active.get(id);
  if (a === undefined) return false;
  const norm = doubtNorm(a, day, norms);
  if (norm === null) return true;
  const doubtful = world[normDoubtId(norm)] === true;
  return norm === a.rule.norm ? doubtful : !doubtful;
}

export interface RuleFrame {
  readonly day: string;
  readonly active: ReadonlyMap<RuleId, ActiveRule>;
  // The norm doubts the rules open on that day.
  readonly doubts: readonly Doubt[];
  readonly holds: (id: RuleId, world: World) => boolean;
}

// The rules among `ids` that apply on `date`, with the doubts that decide which of them holds.
export function ruleFrame(date: CivilDate, ids: readonly RuleId[], norms: NormTable): RuleFrame {
  const day = toIso(date);
  const wanted = new Set(ids);
  const active = new Map<RuleId, ActiveRule>();
  const doubts: Doubt[] = [];
  for (const a of activeRules(date, norms)) {
    if (!wanted.has(a.rule.id)) continue;
    active.set(a.rule.id, a);
    const norm = doubtNorm(a, day, norms);
    if (norm !== null && a.doubt !== null) doubts.push({ id: normDoubtId(norm), reason: a.doubt });
  }
  return {
    day,
    active,
    doubts: uniqueById(doubts),
    holds: (id, world) => ruleHolds(active, id, world, day, norms),
  };
}
