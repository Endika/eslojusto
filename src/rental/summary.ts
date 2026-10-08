import { FIGURED_STATUSES, itemAmount, type ItemReading } from '../engine/rental/item';
import {
  countedAmount,
  highestAmount,
  type DoubtReason,
  type Outcome,
} from '../engine/rental/outcome';
import { rentUpdateAmount, type RentUpdateReading } from '../engine/rental/rent-update';
import type { RentalItemResult, RentalReview, Total } from '../engine/rental/review';
import type { ItemStatus } from '../engine/rental/types';

// An amount for the free summary: to the nearest 10 €.
export const roundToTens = (n: number): number => Math.round(n / 10) * 10;

// One reading of an item as the summary words it: its status and, when it carries one, the euros.
export interface Verdict {
  readonly status: ItemStatus;
  readonly amount: number | null;
}

export type ItemSummary =
  | { readonly kind: 'single'; readonly verdict: Verdict }
  | {
      readonly kind: 'depends';
      readonly reasons: readonly DoubtReason[];
      readonly low: Verdict;
      readonly high: Verdict;
      // What the totals take from the item, and the most any reading gives.
      readonly counted: number;
      readonly upTo: number;
    };

const verdictOf = (r: ItemReading): Verdict => ({
  status: r.status,
  amount: FIGURED_STATUSES.has(r.status) ? r.amount : null,
});

// A rise paid over carries the months it was paid over, added up.
const riseVerdict = (r: RentUpdateReading): Verdict => ({
  status: r.status,
  amount: r.status === 'paid_over' ? r.accumulated : null,
});

function summaryOf<T>(
  outcome: Outcome<T>,
  verdict: (value: T) => Verdict,
  amount: (value: T) => number,
): ItemSummary {
  if (outcome.kind === 'single') return { kind: 'single', verdict: verdict(outcome.value) };
  return {
    kind: 'depends',
    reasons: outcome.reasons,
    low: verdict(outcome.low),
    high: verdict(outcome.high),
    counted: countedAmount(outcome, amount),
    upTo: highestAmount(outcome, amount),
  };
}

export function summarise(item: RentalItemResult): ItemSummary {
  return item.kind === 'rent_update'
    ? summaryOf(item.outcome, riseVerdict, rentUpdateAmount)
    : summaryOf(item.outcome, verdictOf, itemAmount);
}

// How a doubtful item stands against the totals: wholly out, only its lowest reading in, or in.
export type TotalShare = 'in' | 'lowest' | 'out';

export function totalShare(s: ItemSummary): TotalShare {
  if (s.kind === 'single' || s.upTo === 0) return 'in';
  if (s.counted === 0) return 'out';
  return s.counted < s.upTo ? 'lowest' : 'in';
}

export type Headline = 'found' | 'only_doubtful' | 'nothing_found' | 'nothing_entered';

// The summary's first line: something counted, something only in some readings, or nothing.
export function headline(review: RentalReview): Headline {
  const { paidOver, owed, overCap } = review.totals;
  const totals: readonly Total[] = [paidOver, owed, overCap];
  if (totals.some((t) => t.counted > 0)) return 'found';
  if (totals.some((t) => t.upTo > 0)) return 'only_doubtful';
  const statuses = review.items.flatMap((item) => {
    const s = summarise(item);
    return s.kind === 'single' ? [s.verdict.status] : [s.low.status, s.high.status];
  });
  return statuses.every((s) => s === 'not_entered') ? 'nothing_entered' : 'nothing_found';
}

// The total lines, in the order the summary shows them: only those with something in them.
export type TotalKind = 'paidOver' | 'owed' | 'overCap';

export const totalLines = (review: RentalReview): readonly { kind: TotalKind; total: Total }[] =>
  (['paidOver', 'owed', 'overCap'] as const)
    .map((kind) => ({ kind, total: review.totals[kind] }))
    .filter(({ total }) => total.upTo > 0);
