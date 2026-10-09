import { compareDates, parseDate } from '../date';
import { RULES } from './rules';
import type { InsuranceInput, OutOfScopeReason, Scope } from './types';

const OTHER_LINES: Readonly<
  Record<Exclude<InsuranceInput['line'], 'home' | 'car'>, OutOfScopeReason>
> = { life: 'life', health: 'health', funeral: 'funeral', other: 'other_line' };

// The day art. 22 LCS starts applying in its current wording.
const WORDING_DAY = parseDate(RULES.non_renewal.from);

// Home and motor policies only; a period that ended before the current wording of art. 22 LCS
// followed other notice periods, so the review stops at the door.
export function scope(input: Pick<InsuranceInput, 'line' | 'expiresOn'>): Scope {
  if (input.line !== 'home' && input.line !== 'car')
    return { inScope: false, reason: OTHER_LINES[input.line] };
  if (compareDates(input.expiresOn, WORDING_DAY) < 0)
    return { inScope: false, reason: 'before_2016' };
  return { inScope: true };
}
