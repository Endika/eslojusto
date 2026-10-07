import type { Range } from '../money';
import { phrase, type EmploymentCalculation } from './calculation';
import type { NormTable } from './norms';
import { ruleSource, type EmploymentRuleId } from './rules';
import type { Assessed, Finding, FindingStatus, ItemId, LiteralQuote } from './types';

export interface Verdict {
  readonly status: FindingStatus;
  readonly calculation?: EmploymentCalculation;
  readonly amount?: Range | null;
  readonly basedOnYourAnswer?: boolean;
  // Defaults to true for «depends on your agreement» and false otherwise.
  readonly agreementMaySetOther?: boolean;
  readonly literal?: LiteralQuote | null;
  // Rules the finding also rests on, after its own.
  readonly alsoCites?: readonly EmploymentRuleId[];
}

// Builds a finding named after its rule. A void clause always carries art. 9.1 ET: that part is
// replaced by the law and the rest of the contract stands.
export function findingOf(
  id: EmploymentRuleId,
  item: ItemId,
  norms: NormTable,
  verdict: Verdict,
): Finding {
  const isVoid = verdict.status === 'clause_void';
  const cites = new Set<EmploymentRuleId>([id, ...(verdict.alsoCites ?? [])]);
  if (isVoid) cites.add('partial_nullity');
  const calculation = verdict.calculation ?? [];
  return {
    id,
    item,
    status: verdict.status,
    amount: verdict.amount ?? null,
    calculation: isVoid ? [...calculation, phrase('clause.partial_nullity')] : calculation,
    sources: [...cites].map((rule) => ruleSource(rule, norms)),
    basedOnYourAnswer: verdict.basedOnYourAnswer ?? false,
    agreementMaySetOther: verdict.agreementMaySetOther ?? verdict.status === 'depends_on_agreement',
    literal: verdict.literal ?? null,
  };
}

export const single = (finding: Finding): Assessed => ({ kind: 'single', finding });
