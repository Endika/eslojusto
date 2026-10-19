import { PASS_PRICE } from '../../documents/contract';
import type { TelecomReview } from '../../engine/bills/telecom-review';

// The pass is offered when what the reviews count over the norm reaches its price; the result
// reads the same rule to know whether there is something to claim.
export const offersPass = (reviews: readonly TelecomReview[]): boolean =>
  reviews.reduce((sum, r) => sum + r.totals.counted, 0) >= PASS_PRICE;
