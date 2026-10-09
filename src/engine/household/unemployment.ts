import { parseDate, compareDates } from '../date';
import { phrase } from './calculation';
import { findingsFor, single } from './finding';
import type { NormTable } from './norms';
import { RULES } from './rules';
import type { Assessed, HouseholdInput } from './types';

const SINCE = parseDate(RULES.unemployment_situation.from);

// Information only, with no figure: a desistimiento (art. 11.2) is a legal situation of
// unemployment, and the general rules of the benefit then apply.
export function assessUnemployment(input: HouseholdInput, norms: NormTable): Assessed | null {
  const t = input.termination;
  if (t === null || t.route !== 'desistimiento' || compareDates(t.effectiveOn, SINCE) < 0)
    return null;
  return single(
    findingsFor('unemployment')(
      'unemployment_situation',
      {
        status: 'information',
        calculation: [phrase('unemployment.situation'), phrase('unemployment.general_rules')],
        alsoCites: ['unemployment_contribution', 'unemployment_general'],
      },
      norms,
    ),
  );
}
