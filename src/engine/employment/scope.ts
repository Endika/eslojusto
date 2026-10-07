import { compareDates, min, parseDate } from '../date';
import { RULES } from './rules';
import type { EmploymentInput, Scope } from './types';

// The day the reformed art. 15 ET starts applying; DT 4.ª RDL 32/2021 keeps contracts concluded
// before it under the earlier rules, so the earlier of signing and start decides.
const REFORM_DAY = parseDate(RULES.fixed_term_presumption.from);

// Only the common employment relationship is reviewed. Special relationships, temporary work
// agencies, relief contracts and minors follow rules this review does not cover; a contract that
// was signed or started before the 2021 reform is reviewed except for its fixed-term rules.
export function scope(input: EmploymentInput): Scope {
  if (input.relationship === 'public_servant') return { inScope: false, reason: 'public_servant' };
  if (input.relationship !== 'common') return { inScope: false, reason: 'special_relationship' };
  if (input.viaTempAgency) return { inScope: false, reason: 'temp_agency' };
  if (input.relief) return { inScope: false, reason: 'relief' };
  if (input.under18) return { inScope: false, reason: 'minor' };
  const concluded =
    input.signedOn === null ? input.startDate : min(input.signedOn, input.startDate);
  if (compareDates(concluded, REFORM_DAY) < 0)
    return { inScope: true, partial: true, reason: 'before_reform' };
  return { inScope: true, partial: false };
}
