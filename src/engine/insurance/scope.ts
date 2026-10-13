import { addMonthsClamped, compareDates, parseDate } from '../date';
import { RULES } from './rules';
import type { InsuranceInput, OutOfScopeReason, Scope } from './types';

const OTHER_LINES: Readonly<
  Record<Exclude<InsuranceInput['line'], 'home' | 'car'>, OutOfScopeReason>
> = { life: 'life', health: 'health', funeral: 'funeral', other: 'other_line' };

// The day art. 22 LCS starts applying in its current wording.
const WORDING_DAY = parseDate(RULES.non_renewal.from);

// The earliest deadline art. 22.3 sets: the insurer's notice, two months before the end.
const EARLIEST_NOTICE_MONTHS = 2;

// Home and motor policies only; a period whose deadlines fell before the current wording of art. 22
// LCS followed other notice periods, so the review stops at the door.
export function scope(input: Pick<InsuranceInput, 'line' | 'expiresOn'>): Scope {
  if (input.line !== 'home' && input.line !== 'car')
    return { inScope: false, reason: OTHER_LINES[input.line] };
  if (compareDates(addMonthsClamped(input.expiresOn, -EARLIEST_NOTICE_MONTHS), WORDING_DAY) < 0)
    return { inScope: false, reason: 'before_2016' };
  return { inScope: true };
}
