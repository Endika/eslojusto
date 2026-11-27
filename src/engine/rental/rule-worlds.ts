import { toIso, type CivilDate } from '../date';
import { normStanding, type NormId, type NormTable } from './norms';
import { uniqueById, type Doubt, type World } from './outcome';
import { activeRules, RULES, type ActiveRule, type RuleId } from './rules';

// One doubt per norm, shared by every item and year that rests on it: a norm is validated or
// repealed for the whole review at once.
function normDoubtId(norm: NormId): string {
  return `norm:${norm}`;
}

// The doubt an active rule carries, and whether it is its own norm's or its successor's.
export function carriedDoubt(
  active: ActiveRule,
  day: string,
  norms: NormTable,
): { readonly doubt: Doubt; readonly own: boolean } | null {
  const { rule, doubt: reason } = active;
  if (reason === null) return null;
  const own = normStanding(norms[rule.norm], day) !== 'in_force';
  // An in-force norm is doubtful only through its successor.
  const norm = own ? rule.norm : RULES[rule.supersededBy as RuleId].norm;
  return { doubt: { id: normDoubtId(norm), reason }, own };
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
  const carried = carriedDoubt(a, day, norms);
  if (carried === null) return true;
  const doubtful = world[carried.doubt.id] === true;
  return carried.own ? doubtful : !doubtful;
}

interface RuleFrame {
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
    const carried = carriedDoubt(a, day, norms);
    if (carried !== null) doubts.push(carried.doubt);
  }
  return {
    day,
    active,
    doubts: uniqueById(doubts),
    holds: (id, world) => ruleHolds(active, id, world, day, norms),
  };
}
