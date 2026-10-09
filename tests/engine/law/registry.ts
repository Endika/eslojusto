import type { Norm } from '../../../src/engine/law/norms';
import type { RuleBase } from '../../../src/engine/law/rules';
import type { LawSource } from '../../../src/engine/law/sources';
import {
  CREDIT_NORMS,
  NORM_REVIEW as CREDIT_NORM_REVIEW,
} from '../../../src/engine/credit/data/norms';
import { CREDIT_SOURCES } from '../../../src/engine/credit/data/sources';
import { RULES as CREDIT_RULES } from '../../../src/engine/credit/rules';
import { EMPLOYMENT_NORMS, NORM_REVIEW } from '../../../src/engine/employment/data/norms';
import {
  HOUSEHOLD_NORMS,
  NORM_REVIEW as HOUSEHOLD_NORM_REVIEW,
} from '../../../src/engine/household/data/norms';
import {
  INSURANCE_NORMS,
  NORM_REVIEW as INSURANCE_NORM_REVIEW,
} from '../../../src/engine/insurance/data/norms';
import { RULES as INSURANCE_RULES } from '../../../src/engine/insurance/rules';
import {
  MORTGAGE_NORMS,
  NORM_REVIEW as MORTGAGE_NORM_REVIEW,
} from '../../../src/engine/mortgage/data/norms';
import { MORTGAGE_SOURCES } from '../../../src/engine/mortgage/data/sources';
import { RULES as MORTGAGE_RULES } from '../../../src/engine/mortgage/rules';
import { NORMS as RENTAL_NORMS } from '../../../src/engine/rental/data/norms';

// Every section's law tables, for the checks that span them all and the monthly review list.
// A section whose rules state their output and sources lists them under `rules` and `sources`.
export interface LawSection {
  readonly name: string;
  readonly norms: Readonly<Record<string, Norm<string>>>;
  // Day each norm was last read in the BOE, where the section keeps it; null before its first reading.
  readonly normReview: Readonly<Record<string, string | null>> | null;
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
  {
    name: 'insurance',
    norms: INSURANCE_NORMS,
    normReview: INSURANCE_NORM_REVIEW,
    sources: {},
    rules: INSURANCE_RULES,
  },
  {
    name: 'credit',
    norms: CREDIT_NORMS,
    normReview: CREDIT_NORM_REVIEW,
    sources: CREDIT_SOURCES,
    rules: CREDIT_RULES,
  },
  {
    name: 'mortgage',
    norms: MORTGAGE_NORMS,
    normReview: MORTGAGE_NORM_REVIEW,
    sources: MORTGAGE_SOURCES,
    rules: MORTGAGE_RULES,
  },
];
