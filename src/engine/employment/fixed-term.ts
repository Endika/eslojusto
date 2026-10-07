import { addDays, addMonthsClamped, compareDates, toIso, type CivilDate } from '../date';
import { phrase, type EmploymentCalculation } from './calculation';
import { normStanding, type NormTable } from './norms';
import { RULES, ruleSource, type EmploymentRuleId } from './rules';
import type { Assessed, Finding, FindingStatus, ItemId, LiteralQuote } from './types';

// Last day of a span of `months` starting on `start`: six months from 15-01 end on 14-07.
export const lastDayOf = (start: CivilDate, months: number): CivilDate =>
  addDays(addMonthsClamped(start, months), -1);

export const longerThan = (start: CivilDate, end: CivilDate, months: number): boolean =>
  compareDates(end, lastDayOf(start, months)) > 0;

export const shorterThan = (start: CivilDate, end: CivilDate, months: number): boolean =>
  compareDates(end, lastDayOf(start, months)) < 0;

// What the temporality checks read besides the input and today.
export interface TemporalityDeps {
  readonly norms: NormTable;
}

export type RuleStanding = 'not_in_force' | 'in_force' | 'doubtful';

// Whether a rule covers `day`, following the validity and status of its norm.
export function ruleStanding(id: EmploymentRuleId, day: CivilDate, norms: NormTable): RuleStanding {
  const rule = RULES[id];
  const iso = toIso(day);
  if (iso < rule.from || (rule.until !== null && iso > rule.until)) return 'not_in_force';
  const standing = normStanding(norms[rule.norm], iso);
  if (standing === 'not_in_force' || standing === 'in_force') return standing;
  return 'doubtful';
}

export interface Draft {
  readonly id: EmploymentRuleId;
  readonly item: ItemId;
  readonly status: FindingStatus;
  readonly calculation: EmploymentCalculation;
  // Further rules cited after the finding's own.
  readonly cites?: readonly EmploymentRuleId[];
  readonly basedOnYourAnswer?: boolean;
  readonly agreementMaySetOther?: boolean;
  readonly literal?: LiteralQuote;
}

// A finding with its sources, read as the rules stood on no particular day.
export function cite(draft: Draft, norms: NormTable): Finding {
  return {
    id: draft.id,
    item: draft.item,
    status: draft.status,
    amount: null,
    calculation: draft.calculation,
    sources: [draft.id, ...(draft.cites ?? [])].map((id) => ruleSource(id, norms)),
    basedOnYourAnswer: draft.basedOnYourAnswer ?? false,
    agreementMaySetOther: draft.agreementMaySetOther ?? false,
    literal: draft.literal ?? null,
  };
}

const CONCRETE: ReadonlySet<FindingStatus> = new Set([
  'below_minimum',
  'over_legal_limit',
  'clause_void',
  'becomes_permanent',
]);

// A finding read on `day`: its own rule not in force that day does not apply, and a concrete
// verdict that rests on a doubtful norm only asks to review it.
export function settle(draft: Draft, day: CivilDate, norms: NormTable): Finding {
  const standings = [draft.id, ...(draft.cites ?? [])].map((id) => ruleStanding(id, day, norms));
  if (standings[0] === 'not_in_force')
    return cite({ ...draft, status: 'not_applicable_to_date' }, norms);
  if (CONCRETE.has(draft.status) && standings.includes('doubtful')) {
    return cite(
      {
        ...draft,
        status: 'review_it',
        calculation: [...draft.calculation, phrase('modality.rule_in_doubt')],
      },
      norms,
    );
  }
  return cite(draft, norms);
}

export const single = (finding: Finding): Assessed => ({ kind: 'single', finding });
