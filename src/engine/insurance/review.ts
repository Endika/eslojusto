import type { CivilDate } from '../date';
import { informationBlocks, scopeBlock, type InformationBlock } from './information';
import type { NormTable } from './norms';
import { changeNotice, nonRenewal, premiumChange } from './renewal';
import { scope } from './scope';
import type { Finding, InsuranceInput, Scope } from './types';
import { validate, type ValidationError } from './validate';
import { distanceWithdrawal } from './withdrawal';

// What a review of the policy's dates cannot tell, always listed at the end.
export type UncheckedCode = 'clause_transparency' | 'premium_price' | 'insured_value' | 'claims';

const UNCHECKED: readonly UncheckedCode[] = [
  'clause_transparency',
  'premium_price',
  'insured_value',
  'claims',
];

export interface InsuranceDeps {
  readonly norms: NormTable;
}

export interface InsuranceReview {
  readonly scope: Scope;
  // Non-renewal deadline, notice of changes, premium change and distance withdrawal.
  readonly findings: readonly Finding[];
  readonly information: readonly InformationBlock[];
  readonly unchecked: readonly UncheckedCode[];
  // No insurance finding carries euros, so the review never offers the pass.
  readonly offerPass: false;
}

export type InsuranceResult =
  | { readonly ok: false; readonly errors: readonly ValidationError[] }
  | { readonly ok: true; readonly review: InsuranceReview };

// The whole policy review. `today` and the norm table come in from the caller.
export function reviewInsurance(
  input: InsuranceInput,
  today: CivilDate,
  deps: InsuranceDeps,
): InsuranceResult {
  const errors = validate(input, today);
  if (errors.length > 0) return { ok: false, errors };

  const { norms } = deps;
  const reach = scope(input);
  if (!reach.inScope)
    return {
      ok: true,
      review: {
        scope: reach,
        findings: [],
        information: [scopeBlock(reach.reason, norms)],
        unchecked: UNCHECKED,
        offerPass: false,
      },
    };
  return {
    ok: true,
    review: {
      scope: reach,
      findings: [
        nonRenewal(input, today, norms),
        changeNotice(input, today, norms),
        premiumChange(input, norms),
        ...distanceWithdrawal(input, today, norms),
      ],
      information: informationBlocks(input, norms),
      unchecked: UNCHECKED,
      offerPass: false,
    },
  };
}
