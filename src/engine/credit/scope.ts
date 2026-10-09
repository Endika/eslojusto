import { compareDates, parseDate } from '../date';
import { creditPhrase, type CreditPhrase } from './calculation';
import { STATUTE_RULES } from './rules';
import type { CreditInput, OutOfScopeReason, Scope } from './types';

// Art. 3.c LCC leaves out credits under 200 €.
export const MIN_PRINCIPAL = 200;

// The day the consumer credit law starts applying to contracts.
const LCC_DAY = parseDate(STATUTE_RULES.consumer.from);

// Consumer credit under the LCC only: anything else stops at the door and nothing is worked out.
export function scope(
  input: Pick<
    CreditInput,
    'product' | 'purpose' | 'secured' | 'leaseWithoutPurchase' | 'principal' | 'agreedOn'
  >,
): Scope {
  if (input.secured === 'mortgage') return { inScope: false, reason: 'mortgage' };
  if (input.leaseWithoutPurchase) return { inScope: false, reason: 'lease_without_purchase' };
  if (input.purpose === 'business') return { inScope: false, reason: 'business' };
  if (input.principal < MIN_PRINCIPAL) return { inScope: false, reason: 'under_200' };
  if (compareDates(input.agreedOn, LCC_DAY) < 0)
    return input.product === 'revolving'
      ? { inScope: true, indicatorOnly: true }
      : { inScope: false, reason: 'before_lcc' };
  return { inScope: true, indicatorOnly: false };
}

const OUT_OF_SCOPE: Readonly<Record<OutOfScopeReason, CreditPhrase['key']>> = {
  mortgage: 'scope.mortgage',
  lease_without_purchase: 'scope.lease_without_purchase',
  business: 'scope.business',
  under_200: 'scope.under_200',
  before_lcc: 'scope.before_lcc',
};

// Why the review stops, or that it gives only the indicator; nothing for a full review.
export function scopePhrases(reach: Scope): readonly CreditPhrase[] {
  if (!reach.inScope) return [creditPhrase(OUT_OF_SCOPE[reach.reason])];
  return reach.indicatorOnly ? [creditPhrase('scope.indicator_only')] : [];
}
