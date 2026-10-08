import { compareDates, parseDate } from '../date';
import type { NormSource } from '../law/sources';
import { phrase, type EmploymentPhraseKey } from './calculation';
import { findingsFor } from './finding';
import type { NormTable } from './norms';
import { RULES, ruleSource, type EmploymentRuleId } from './rules';
import { agreedDays, isFixedTerm } from './term';
import {
  INFO_ELEMENTS,
  type EmploymentInput,
  type Finding,
  type InfoElement,
  type InfoPresence,
} from './types';

// Art. 2.2 RD 723/2026: chapter II covers only relationships of over four weeks.
const SHORT_RELATION_DAYS = 4 * 7;

const DECREE_DAY = parseDate(RULES.info_before_start.from);

// Art. 3.3: these may be given by a precise reference to the law or the collective agreement.
const BY_REFERENCE: ReadonlySet<InfoElement> = new Set(['h', 'i', 'n', 'p']);

// Art. 3.3 allows it for f) 1.º and g) 1.º to 4.º only: not for the calculation of variable pay
// (f.2.º) nor the irregular distribution and the discontinuous periods (g.5.º).
const IN_PART_BY_REFERENCE: ReadonlySet<InfoElement> = new Set(['f', 'g']);

// k) algorithmic systems, l) equality plan and harassment protocol, m) LGTBI measures: owed only
// when the company uses or has them, which the contract alone cannot tell.
const ONLY_IF_USED: ReadonlySet<InfoElement> = new Set(['k', 'l', 'm']);

// j) the temporary work agency and the user company: agency contracts are outside this review.
const AGENCY_ONLY: InfoElement = 'j';

// The agreement (o) and the category (e) first: the rest of the contract is read against them.
const ORDER: readonly InfoElement[] = [
  'o',
  'e',
  ...INFO_ELEMENTS.filter((e) => e !== 'o' && e !== 'e'),
];

// Art. 7.1 for relationships that start once the decree is in force; its transitional provision,
// on request within thirty working days, for those already running.
export type InformationMoment = 'before_start' | 'on_request';

export type ElementCheck =
  | { readonly element: InfoElement; readonly applies: true; readonly finding: Finding }
  | { readonly element: InfoElement; readonly applies: false; readonly reason: 'temp_agency_only' };

export type InformationDuty =
  | {
      readonly applies: false;
      readonly reason: 'short_relation' | 'ended_before_decree';
      readonly sources: readonly NormSource[];
    }
  | {
      readonly applies: true;
      readonly moment: InformationMoment;
      readonly elements: readonly ElementCheck[];
    };

const finding = findingsFor('information');

const MOMENT: Readonly<
  Record<InformationMoment, { rule: EmploymentRuleId; key: EmploymentPhraseKey }>
> = {
  before_start: { rule: 'info_before_start', key: 'information.missing_before_start' },
  on_request: { rule: 'info_on_request', key: 'information.missing_on_request' },
};

function check(
  input: EmploymentInput,
  element: InfoElement,
  presence: InfoPresence,
  when: InformationMoment,
  norms: NormTable,
): Finding {
  const moment = MOMENT[when];
  // d) asks a fixed-term contract for its precise cause, circumstances and their link to the term.
  const cause =
    element === 'd' && isFixedTerm(input.modality) ? [phrase('information.temporary_cause')] : [];
  const shown = (key: EmploymentPhraseKey) =>
    finding('info_elements', { status: 'within_limit', calculation: [phrase(key)] }, norms);
  const flagged = (status: 'missing_requirement' | 'review_it', lead: EmploymentPhraseKey | null) =>
    finding(
      'info_elements',
      {
        status,
        calculation: [...(lead === null ? [] : [phrase(lead)]), ...cause, phrase(moment.key)],
        alsoCites: [moment.rule],
      },
      norms,
    );
  switch (presence) {
    case 'present':
      return shown('information.present');
    case 'by_reference':
      if (BY_REFERENCE.has(element)) return shown('information.by_reference');
      return flagged(
        'review_it',
        IN_PART_BY_REFERENCE.has(element)
          ? 'information.reference_covers_part'
          : 'information.reference_not_allowed',
      );
    case 'unknown':
      return flagged(
        'review_it',
        ONLY_IF_USED.has(element) ? 'information.only_if_used' : 'information.unknown',
      );
    case 'absent':
      return ONLY_IF_USED.has(element)
        ? flagged('review_it', 'information.only_if_used')
        : flagged('missing_requirement', null);
  }
}

// The elements of art. 3.2 RD 723/2026 the person found in the contract or a separate document;
// only whether each is there, never whether what it says is right.
export function reviewInformationDuty(input: EmploymentInput, norms: NormTable): InformationDuty {
  // A fixed-term contract without an end date may still last four weeks or less; it is listed.
  const days = agreedDays(input);
  if (days !== null && days <= SHORT_RELATION_DAYS)
    return {
      applies: false,
      reason: 'short_relation',
      sources: [ruleSource('info_short_relations', norms)],
    };
  if (input.endDate !== null && compareDates(input.endDate, DECREE_DAY) < 0)
    return {
      applies: false,
      reason: 'ended_before_decree',
      sources: [ruleSource('info_on_request', norms)],
    };
  const moment: InformationMoment =
    compareDates(input.startDate, DECREE_DAY) >= 0 ? 'before_start' : 'on_request';
  return {
    applies: true,
    moment,
    elements: ORDER.map((element): ElementCheck =>
      element === AGENCY_ONLY
        ? { element, applies: false, reason: 'temp_agency_only' }
        : {
            element,
            applies: true,
            finding: check(input, element, input.info[element], moment, norms),
          },
    ),
  };
}
