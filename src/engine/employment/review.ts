import type { CivilDate } from '../date';
import { reviewChaining } from './chaining';
import { assessClauses, type ClauseAssessment } from './clauses';
import type { TemporalityDeps } from './fixed-term';
import { assessHolidaysAndPay } from './holidays-pay';
import { informationBlocks, scopeBlock, type InformationBlock } from './information';
import { reviewInformationDuty, type InformationDuty } from './information-duty';
import { assessMinimumWage, contractAnnualPay, type MinimumWageDeps } from './minimum-wage';
import { reviewModality } from './modality';
import { compareOffer, type OfferComparison } from './offer';
import { assessPartTime } from './part-time';
import { offerPass } from './readings';
import { permanentReference, type PermanentReference } from './reference';
import { scope } from './scope';
import { assessTrialPeriod } from './trial-period';
import type { Assessed, EmploymentInput, Scope } from './types';
import {
  validate,
  validationWarnings,
  type ValidationError,
  type ValidationWarning,
} from './validate';
import { assessWorkingTime } from './working-time';

// What no review of the contract alone can tell, always listed at the end.
export type UncheckedCode =
  | 'agreement_tables'
  | 'bonuses'
  | 'real_hours'
  | 'equal_pay'
  | 'contributions'
  | 'net_pay'
  | 'later_agreements';

export type EmploymentDeps = MinimumWageDeps & TemporalityDeps;

export interface EmploymentReview {
  readonly scope: Scope;
  // Pay, modality, chaining, trial period, working time, part time, holidays and extra pays.
  readonly items: readonly Assessed[];
  readonly clauses: readonly ClauseAssessment[];
  // Null outside the review.
  readonly informationDuty: InformationDuty | null;
  readonly information: readonly InformationBlock[];
  readonly offer: OfferComparison | null;
  // «Si un juzgado lo declarase así»: never part of a total.
  readonly reference: PermanentReference | null;
  readonly unchecked: readonly UncheckedCode[];
  readonly warnings: readonly ValidationWarning[];
  readonly offerPass: boolean;
}

export type EmploymentResult =
  | { readonly ok: false; readonly errors: readonly ValidationError[] }
  | { readonly ok: true; readonly review: EmploymentReview };

// Every assessed point of a review: its items, its clauses and each element of the information duty.
export function everyAssessed(
  review: Pick<EmploymentReview, 'items' | 'clauses' | 'informationDuty'>,
): readonly Assessed[] {
  const duty = review.informationDuty;
  return [
    ...review.items,
    ...review.clauses.flatMap((c) => (c.assessed === null ? [] : [c.assessed])),
    ...(duty?.applies === true
      ? duty.elements.flatMap((e) =>
          e.applies ? [{ kind: 'single' as const, finding: e.finding }] : [],
        )
      : []),
  ];
}

function uncheckedOf(input: EmploymentInput): readonly UncheckedCode[] {
  return [
    'agreement_tables',
    'bonuses',
    ...(input.realWeeklyHours === null ? (['real_hours'] as const) : []),
    'equal_pay',
    'contributions',
    'net_pay',
    'later_agreements',
  ];
}

// The whole contract review. `today` and every table come in from the caller.
export function reviewEmployment(
  input: EmploymentInput,
  today: CivilDate,
  deps: EmploymentDeps,
): EmploymentResult {
  const errors = validate(input, today);
  if (errors.length > 0) return { ok: false, errors };

  const reach = scope(input);
  const unchecked = uncheckedOf(input);
  const warnings = validationWarnings(input);
  if (!reach.inScope)
    return {
      ok: true,
      review: {
        scope: reach,
        items: [],
        clauses: [],
        informationDuty: null,
        information: [scopeBlock(reach.reason, deps.norms)],
        offer: null,
        reference: null,
        unchecked,
        warnings,
        offerPass: false,
      },
    };

  const { norms } = deps;
  const modality = reviewModality(input, today, deps);
  const chaining = reviewChaining(input, today, deps);
  const temporality = [...modality, ...(chaining === null ? [] : [chaining])];
  const items = [
    ...assessMinimumWage(input, today, deps),
    ...temporality,
    assessTrialPeriod(input, norms),
    ...assessWorkingTime(input, norms),
    ...assessPartTime(input, norms),
    ...assessHolidaysAndPay(input, norms, deps.minimumWage),
  ];
  const clauses = assessClauses(input, norms);
  const informationDuty = reviewInformationDuty(input, norms);
  return {
    ok: true,
    review: {
      scope: reach,
      items,
      clauses,
      informationDuty,
      information: informationBlocks(input, norms),
      offer: compareOffer(input),
      reference: permanentReference(input, today, temporality, contractAnnualPay(input)),
      unchecked,
      warnings,
      offerPass: offerPass(everyAssessed({ items, clauses, informationDuty })),
    },
  };
}
