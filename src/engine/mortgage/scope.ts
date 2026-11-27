import { mortgagePhrase, type MortgagePhrase } from './calculation';
import type { MortgageInput, Scope } from './types';

// A natural person's standard mortgage on a home only: anything else stops at the door, says why,
// and nothing is worked out. A developer's loan taken over on buying carries the developer's
// costs, not the person's.
export function scope(input: Pick<MortgageInput, 'borrower' | 'purpose' | 'loanKind'>): Scope {
  if (input.borrower === 'company') return { inScope: false, reason: 'company' };
  if (input.purpose === 'business') return { inScope: false, reason: 'business_purpose' };
  if (input.loanKind !== 'standard') return { inScope: false, reason: input.loanKind };
  return { inScope: true };
}

// Why the review stops; nothing for a mortgage it covers.
export function scopePhrases(reach: Scope): readonly MortgagePhrase[] {
  return reach.inScope ? [] : [mortgagePhrase(`scope.${reach.reason}`)];
}
