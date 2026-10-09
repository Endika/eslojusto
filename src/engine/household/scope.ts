import { compareDates, parseDate } from '../date';
import { RULES } from './rules';
import type { HouseholdInput, Scope } from './types';

// RDL 16/2022 applies from this day to the contracts in force then (disposición transitoria 1.ª).
const REFORM_DAY = parseDate(RULES.transitional_application.from);

// A relationship that ended before the reform followed the earlier regime, which this review does
// not cover; one still running, or ended since, is reviewed.
export function scope(input: Pick<HouseholdInput, 'termination'>): Scope {
  const end = input.termination?.effectiveOn;
  if (end !== undefined && compareDates(end, REFORM_DAY) < 0)
    return { inScope: false, reason: 'before_reform' };
  return { inScope: true };
}
