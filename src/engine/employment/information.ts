import type { NormSource } from '../law/sources';
import { phrase, type EmploymentCalculation, type EmploymentPhraseKey } from './calculation';
import type { NormTable } from './norms';
import { ruleSource, type EmploymentRuleId } from './rules';
import type { EmploymentInput, Scope } from './types';
import { workingTimeNotes } from './working-time';

// Blocks shown beside the review with their source and no verdict and no figure.

export type InformationBlockId =
  | 'agreement'
  | 'public_holidays'
  | 'time_record'
  | 'late_payment_interest'
  | 'limitation'
  | 'information_model'
  | 'minors'
  | 'out_of_scope';

export interface InformationLink {
  readonly id: 'regcon';
  readonly url: string;
}

export interface InformationBlock {
  readonly id: InformationBlockId;
  readonly calculation: EmploymentCalculation;
  readonly sources: readonly NormSource[];
  readonly links: readonly InformationLink[];
}

// The public register of collective agreements; the review never looks up an agreement's tables.
const REGCON: InformationLink = { id: 'regcon', url: 'https://expinterweb.mites.gob.es/regcon/' };

const block = (
  id: InformationBlockId,
  keys: readonly EmploymentPhraseKey[],
  rules: readonly EmploymentRuleId[],
  norms: NormTable,
  links: readonly InformationLink[] = [],
): InformationBlock => ({
  id,
  calculation: keys.map((key) => phrase(key)),
  sources: rules.map((rule) => ruleSource(rule, norms)),
  links,
});

type OutOfScope = Extract<Scope, { inScope: false }>['reason'];

const OUT_OF_SCOPE: Readonly<Record<Exclude<OutOfScope, 'minor'>, EmploymentPhraseKey>> = {
  special_relationship: 'information.out_of_scope.special_relationship',
  public_servant: 'information.out_of_scope.public_servant',
  temp_agency: 'information.out_of_scope.temp_agency',
  relief: 'information.out_of_scope.relief',
};

// Outside the review only the reason is shown; a minor also sees the limits of arts. 6, 34.3 and
// 37.1 ET, as information.
export function scopeBlock(reason: OutOfScope, norms: NormTable): InformationBlock {
  if (reason === 'minor')
    return block(
      'minors',
      [
        'information.minors.hours',
        'information.minors.no_night_or_overtime',
        'information.minors.rest',
      ],
      ['minors_work', 'daily_9', 'weekly_rest_36'],
      norms,
    );
  return block('out_of_scope', [OUT_OF_SCOPE[reason]], [], norms);
}

export function informationBlocks(
  input: EmploymentInput,
  norms: NormTable,
): readonly InformationBlock[] {
  const notes = workingTimeNotes(input, norms);
  return [
    block(
      'agreement',
      [
        input.agreement.named ? 'information.agreement.named' : 'information.agreement.not_named',
        'information.agreement.where',
        // Art. 84.2 ET as worded by RDL 32/2021: a company agreement no longer takes priority on
        // the amount of base salary and complements; it keeps it on overtime and shift pay
        // (84.2.a), and art. 84.1 protects company agreements already in force. Text only.
        'information.agreement.sector_salary_amount_priority',
      ],
      ['agreement_salary'],
      norms,
      [REGCON],
    ),
    block('public_holidays', ['information.public_holidays'], ['public_holidays'], norms),
    {
      id: 'time_record',
      calculation: notes.map((n) => phrase(n.key)),
      sources: notes.flatMap((n) => n.sources),
      links: [],
    },
    block(
      'late_payment_interest',
      ['information.late_payment_interest'],
      ['late_payment_interest'],
      norms,
    ),
    block('limitation', ['information.limitation'], ['limitation'], norms),
    // The public employment service's model document (DA 1.ª RD 723/2026) is cited through the
    // decree alone until its publication is confirmed.
    block('information_model', ['information.model'], ['info_model'], norms),
  ];
}
