import type { Range } from '../money';
import type { HouseholdCalculation } from './calculation';
import type { NormTable } from './norms';
import { ruleSource, type HouseholdRuleId } from './rules';
import type { Assessed, Finding, FindingStatus, ItemId } from './types';

export interface Verdict {
  readonly status: FindingStatus;
  readonly calculation?: HouseholdCalculation;
  readonly amount?: Range | null;
  readonly basedOnYourAnswer?: boolean;
  readonly agreementMaySetOther?: boolean;
  // Rules the finding also rests on, after its own.
  readonly alsoCites?: readonly HouseholdRuleId[];
}

// Builds a finding named after its rule.
export function findingOf(
  id: HouseholdRuleId,
  item: ItemId,
  norms: NormTable,
  verdict: Verdict,
): Finding {
  const cites = new Set<HouseholdRuleId>([id, ...(verdict.alsoCites ?? [])]);
  return {
    id,
    item,
    status: verdict.status,
    amount: verdict.amount ?? null,
    calculation: verdict.calculation ?? [],
    sources: [...cites].map((rule) => ruleSource(rule, norms)),
    basedOnYourAnswer: verdict.basedOnYourAnswer ?? false,
    agreementMaySetOther: verdict.agreementMaySetOther ?? false,
  };
}

export const single = (finding: Finding): Assessed => ({ kind: 'single', finding });

export type FindingMaker = (id: HouseholdRuleId, verdict: Verdict, norms: NormTable) => Finding;

// The finding builder of one checked item.
export const findingsFor =
  (item: ItemId): FindingMaker =>
  (id, verdict, norms) =>
    findingOf(id, item, norms, verdict);
