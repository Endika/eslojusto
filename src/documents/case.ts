import type { CompletedReview } from '../calculator/ports';
import type { Review } from '../engine/review';
import { letterKind } from './letter';
import type { PaidReview } from './ports';
import { letterModel, reportModel } from './report';

// The pass is offered only when the review finds money missing: an item below its minimum or a
// deduction above its maximum.
export const hasShortfall = (r: Review): boolean =>
  r.items.some((i) => i.status === 'below_minimum' || i.status === 'deduction_too_high');

// A final pay review has one letter, which lists what falls short or, with nothing short, only
// acknowledges the proposal.
export function finalPayCase(r: CompletedReview): PaidReview {
  return {
    offer: hasShortfall(r.review),
    letterKinds: [letterKind(r.review)],
    report: (tr, today) => reportModel(r, tr, today),
    letter: (_kind, details, tr) => letterModel(r, tr, details),
  };
}
