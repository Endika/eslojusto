import type { Norm } from '../../../src/engine/law/norms';
import type { RuleBase } from '../../../src/engine/law/rules';
import type { LawSource } from '../../../src/engine/law/sources';
import { EMPLOYMENT_NORMS, NORM_REVIEW } from '../../../src/engine/employment/data/norms';
import {
  HOUSEHOLD_NORMS,
  NORM_REVIEW as HOUSEHOLD_NORM_REVIEW,
} from '../../../src/engine/household/data/norms';
import { NORMS as RENTAL_NORMS } from '../../../src/engine/rental/data/norms';

// Every section's law tables, for the checks that span them all and the monthly review list.
// A section whose rules state their output and sources lists them under `rules` and `sources`.
export interface LawSection {
  readonly name: string;
  readonly norms: Readonly<Record<string, Norm<string>>>;
  // Day each norm was last read in the BOE, where the section keeps it.
  readonly normReview: Readonly<Record<string, string>> | null;
  readonly sources: Readonly<Record<string, LawSource>>;
  readonly rules: Readonly<Record<string, RuleBase>>;
}

export const LAW_SECTIONS: readonly LawSection[] = [
  { name: 'rental', norms: RENTAL_NORMS, normReview: null, sources: {}, rules: {} },
  {
    name: 'employment',
    norms: EMPLOYMENT_NORMS,
    normReview: NORM_REVIEW,
    sources: {},
    rules: {},
  },
  {
    name: 'household',
    norms: HOUSEHOLD_NORMS,
    normReview: HOUSEHOLD_NORM_REVIEW,
    sources: {},
    rules: {},
  },
];
