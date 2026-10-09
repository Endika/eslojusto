import { ordinal, toIso, type CivilDate } from '../date';
import type { Across } from '../law/readings';
import type { NormSource } from '../law/sources';
import type { CreditCalculation } from './calculation';
import type { NormStatus, NormTable } from './norms';
import { ruleSource, type StatuteRuleId } from './rules';
import type { BalloonReading } from './tae';
import type { AprDetail, InsuranceReading } from './tae-check';

export type FindingId = 'apr' | 'early_repayment' | 'dealer_discount' | 'withdrawal';

// `matches`, `contract_lower`, `contract_higher`, `contract_missing` and `unsolvable` for the APR;
// `above_general_cap`, `within_cap`, `charged_without_basis` and `nothing_charged` for an early
// repayment; `open`, `ended` and `not_started` for the withdrawal period.
export type FindingStatus =
  | 'matches'
  | 'contract_lower'
  | 'contract_higher'
  | 'contract_missing'
  | 'unsolvable'
  | 'above_general_cap'
  | 'within_cap'
  | 'charged_without_basis'
  | 'nothing_charged'
  | 'open'
  | 'ended'
  | 'not_started'
  | 'review_it'
  | 'not_entered';

export interface CreditFinding {
  readonly id: FindingId;
  readonly status: FindingStatus;
  // Euros charged over a legal cap; null for a result that carries no figure.
  readonly amount: number | null;
  // 'YYYY-MM-DD' of the deadline a status refers to, and the calendar days left while it is open.
  readonly lastDay: string | null;
  readonly daysLeft: number | null;
  // The worked APR behind an APR finding.
  readonly detail: AprDetail | null;
  readonly calculation: CreditCalculation;
  readonly sources: readonly NormSource<NormStatus>[];
}

// A point the person answered «No lo sé» on, and the readings the review works out for it.
export type DoubtQuestion =
  'insurance_required' | 'balloon_due' | 'insurance_required_and_balloon_due' | 'repayment_base';

export type DoubtReading =
  | InsuranceReading
  | BalloonReading
  | `${InsuranceReading}.${BalloonReading}`
  | 'principal_and_interest'
  | 'principal_only';

export type CreditItem = Across<DoubtQuestion, DoubtReading, CreditFinding>;

export interface FindingExtras {
  readonly amount?: number | null;
  readonly detail?: AprDetail | null;
  readonly deadline?: { readonly lastDay: CivilDate; readonly today: CivilDate } | null;
}

export const creditFinding = (
  id: FindingId,
  status: FindingStatus,
  calculation: CreditCalculation,
  rules: readonly StatuteRuleId[],
  norms: NormTable,
  extras: FindingExtras = {},
): CreditFinding => {
  const deadline = extras.deadline ?? null;
  return {
    id,
    status,
    amount: extras.amount ?? null,
    lastDay: deadline === null ? null : toIso(deadline.lastDay),
    daysLeft:
      deadline === null || status !== 'open'
        ? null
        : ordinal(deadline.lastDay) - ordinal(deadline.today),
    detail: extras.detail ?? null,
    calculation,
    sources: [...new Set(rules)].map((rule) => ruleSource(rule, norms)),
  };
};

export const single = (finding: CreditFinding): CreditItem => ({ kind: 'single', finding });

export const findingsOf = (item: CreditItem): readonly CreditFinding[] =>
  item.kind === 'single' ? [item.finding] : item.readings.map((r) => r.finding);

export const dayOf = (date: CivilDate): { readonly date: string } => ({ date: toIso(date) });
