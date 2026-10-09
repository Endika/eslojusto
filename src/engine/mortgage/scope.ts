import { mortgagePhrase, type MortgagePhrase, type MortgagePhraseKey } from './calculation';
import type { MortgageInput, OutOfScopeReason, Scope } from './types';

// A natural person's standard mortgage on a home only: anything else stops at the door, says why,
// and nothing is worked out. A developer's loan taken over on buying carries the developer's
// costs, not the person's.
export function scope(input: Pick<MortgageInput, 'borrower' | 'purpose' | 'loanKind'>): Scope {
  if (input.borrower === 'company') return { inScope: false, reason: 'company' };
  if (input.purpose === 'business') return { inScope: false, reason: 'business_purpose' };
  if (input.loanKind !== 'standard') return { inScope: false, reason: input.loanKind };
  return { inScope: true };
}

const OUT_OF_SCOPE: Readonly<Record<OutOfScopeReason, MortgagePhraseKey>> = {
  company: 'scope.company',
  business_purpose: 'scope.business_purpose',
  developer_subrogation: 'scope.developer_subrogation',
  multicurrency: 'scope.multicurrency',
  reverse: 'scope.reverse',
  not_mortgage: 'scope.not_mortgage',
};

// Why the review stops; nothing for a mortgage it covers.
export const scopePhrases = (reach: Scope): readonly MortgagePhrase[] =>
  reach.inScope ? [] : [mortgagePhrase(OUT_OF_SCOPE[reach.reason])];
