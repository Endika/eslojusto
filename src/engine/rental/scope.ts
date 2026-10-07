import { toIso } from '../date';
import type { NormTable } from './norms';
import type { ContractType, RentalInput } from './types';

export type OutOfScopeReason = 'before_2019' | Exclude<ContractType, 'main_home'>;

export type Scope =
  { readonly inScope: true } | { readonly inScope: false; readonly reason: OutOfScopeReason };

// Main homes under the LAU as reformed by RDL 7/2019: contracts signed before it took effect follow
// another update regime, so the review stops at the door rather than half-check them.
export function scope(
  input: Pick<RentalInput, 'contractType' | 'signedOn'>,
  norms: NormTable,
): Scope {
  if (input.contractType !== 'main_home') return { inScope: false, reason: input.contractType };
  if (toIso(input.signedOn) < norms.rdl7_2019.inForceSince)
    return { inScope: false, reason: 'before_2019' };
  return { inScope: true };
}
