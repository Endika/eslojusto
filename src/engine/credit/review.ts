import { addMonthsClamped, compareDates, type CivilDate } from '../date';
import { round2 } from '../money';
import { checkDealerDiscount, checkEarlyRepayment } from './early-repayment';
import { findingsOf, type CreditFinding, type CreditItem, type FindingStatus } from './finding';
import {
  averageRateIndicator,
  comparedApr,
  loanSeries,
  type Indicator,
  type RateTable,
} from './indicator';
import { indicatorOnlyBlocks, informationBlocks, type InformationBlock } from './information';
import type { NormTable, SourceTable } from './norms';
import { scope } from './scope';
import { checkApr } from './tae-check';
import { balloonDue, monthlyDue, type BalloonReading } from './tae';
import type { CreditInput, Scope } from './types';
import { validate, type ValidationError } from './validate';
import { checkWithdrawal } from './withdrawal';

// What the review never looks at, always listed at the end.
export type UncheckedCode =
  'clause_transparency' | 'insurance_required' | 'default_charges' | 'limit_changes' | 'new_law';

export const UNCHECKED: readonly UncheckedCode[] = [
  'clause_transparency',
  'insurance_required',
  'default_charges',
  'limit_changes',
  'new_law',
];

export interface Total {
  // What holds in every reading: the lowest one.
  readonly counted: number;
  // The most any reading gives, for «y hasta … si …».
  readonly upTo: number;
}

export interface CreditTotals {
  // Compensation for an early repayment charged over the caps of art. 30.
  readonly overCharged: Total;
}

export interface CreditDeps {
  readonly norms: NormTable;
  readonly sources: SourceTable;
  readonly rates: RateTable;
}

export interface CreditReview {
  readonly scope: Scope;
  // The APR, the early repayment, the dealer's discount and the withdrawal period, in that order.
  readonly items: readonly CreditItem[];
  // Free and whole, never in a total nor behind the pass; null when the review stops at the door.
  readonly indicator: Indicator | null;
  readonly information: readonly InformationBlock[];
  readonly totals: CreditTotals;
  // A declared APR lower than the contract's figures give, or compensation counted over a cap.
  readonly offerPass: boolean;
  readonly unchecked: readonly UncheckedCode[];
}

export type CreditResult =
  | { readonly ok: false; readonly errors: readonly ValidationError[] }
  | { readonly ok: true; readonly review: CreditReview };

// The statuses whose euros reach a total.
const FIGURED: ReadonlySet<FindingStatus> = new Set(['above_general_cap', 'charged_without_basis']);

const amountOf = (f: CreditFinding): number => (FIGURED.has(f.status) ? (f.amount ?? 0) : 0);

function totalOf(items: readonly CreditItem[]): Total {
  let counted = 0;
  let upTo = 0;
  for (const item of items) {
    const amounts = findingsOf(item).map(amountOf);
    counted += Math.min(...amounts);
    upTo += Math.max(...amounts);
  }
  return { counted: round2(counted), upTo: round2(upTo) };
}

// The APR worked out, in its lowest reading, when every reading worked one out.
function recalculatedApr(item: CreditItem | null): number | null {
  if (item === null) return null;
  const aprs = findingsOf(item).flatMap((f) => (f.detail === null ? [] : [f.detail.apr]));
  return aprs.length === findingsOf(item).length ? Math.min(...aprs) : null;
}

const holdsInEveryReading = (item: CreditItem, status: FindingStatus): boolean =>
  findingsOf(item).every((f) => f.status === status);

// The whole months from the drawdown to the last payment, the days past the last whole month left
// out, which the BdE series break a fixed-rate loan down by.
export function termMonths(input: CreditInput, reading: BalloonReading): number | null {
  const plan = input.instalments;
  if (plan === null) return null;
  const dues =
    plan.kind === 'regular'
      ? [monthlyDue(plan.firstDueOn, plan.count - 1)]
      : plan.rows.map((r) => r.dueOn);
  const later = (a: CivilDate, b: CivilDate) => (compareDates(a, b) >= 0 ? a : b);
  const last = dues.reduce(later);
  const end =
    input.balloon === null ? last : later(last, balloonDue(last, input.balloon.dueOn, reading));
  let months = (end.y - input.drawnOn.y) * 12 + (end.m - input.drawnOn.m);
  while (months > 0 && compareDates(addMonthsClamped(input.drawnOn, months), end) > 0) months--;
  return months;
}

// The term the indicator reads. An undated balloon is read with the last instalment and a month
// after it; when those two terms fall in different series, the term is left unknown.
function indicatorTerm(input: CreditInput): number | null {
  const withLast = termMonths(input, 'balloon_with_last');
  const monthAfter = termMonths(input, 'balloon_month_after');
  if (withLast === null || monthAfter === null) return null;
  return loanSeries(withLast, input.rateType) === loanSeries(monthAfter, input.rateType)
    ? withLast
    : null;
}

const NOTHING: Total = { counted: 0, upTo: 0 };

// The whole consumer credit review. `today` and the tables come in from the composition root, so
// a change of norm status, a criterion read or a new month of the series needs no change here.
export function reviewCredit(input: CreditInput, today: CivilDate, deps: CreditDeps): CreditResult {
  const errors = validate(input, today);
  if (errors.length > 0) return { ok: false, errors };
  const { norms } = deps;
  const reach = scope(input);
  const review = (
    items: readonly CreditItem[],
    indicator: Indicator | null,
    information: readonly InformationBlock[],
  ): CreditResult => {
    const overCharged = totalOf(items);
    const apr = items.find((i) => findingsOf(i)[0]?.id === 'apr');
    return {
      ok: true,
      review: {
        scope: reach,
        items,
        indicator,
        information,
        totals: { overCharged },
        offerPass:
          (apr !== undefined && holdsInEveryReading(apr, 'contract_lower')) ||
          overCharged.counted > 0,
        unchecked: UNCHECKED,
      },
    };
  };
  if (!reach.inScope) return { ok: true, review: emptyReview(reach) };
  const term = input.product === 'revolving' ? null : indicatorTerm(input);
  if (reach.indicatorOnly)
    return review(
      [],
      averageRateIndicator(input, term, comparedApr(input, null), deps),
      indicatorOnlyBlocks(input, norms),
    );

  const apr = checkApr(input, norms);
  const dealer = checkDealerDiscount(input, norms);
  const items = [
    apr,
    checkEarlyRepayment(input, norms),
    ...(dealer === null ? [] : [dealer]),
    checkWithdrawal(input, today, norms),
  ];
  return review(
    items,
    averageRateIndicator(input, term, comparedApr(input, recalculatedApr(apr)), deps),
    informationBlocks(input, norms),
  );
}

const emptyReview = (reach: Scope): CreditReview => ({
  scope: reach,
  items: [],
  indicator: null,
  information: [],
  totals: { overCharged: NOTHING },
  offerPass: false,
  unchecked: UNCHECKED,
});
