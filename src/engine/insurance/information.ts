import { addMonthsClamped, max } from '../date';
import type { NormSource } from '../law/sources';
import { insurancePhrase, type InsuranceCalculation, type InsurancePhraseKey } from './calculation';
import { day } from './deadline';
import type { NormTable } from './norms';
import { ruleSource, type InsuranceRuleId } from './rules';
import type { InsuranceInput, OutOfScopeReason } from './types';

// Blocks shown beside the review with their source and no verdict.

export type InformationBlockId =
  'policy_correction' | 'questionnaire' | 'proportional_rule' | 'overinsurance' | 'out_of_scope';

export interface InformationBlock {
  readonly id: InformationBlockId;
  readonly calculation: InsuranceCalculation;
  readonly sources: readonly NormSource[];
}

const block = (
  id: InformationBlockId,
  calculation: InsuranceCalculation,
  rules: readonly InsuranceRuleId[],
  norms: NormTable,
): InformationBlock => ({
  id,
  calculation,
  sources: rules.map((rule) => ruleSource(rule, norms)),
});

const OUT_OF_SCOPE: Readonly<Record<OutOfScopeReason, InsurancePhraseKey>> = {
  life: 'information.out_of_scope.life',
  health: 'information.out_of_scope.health',
  funeral: 'information.out_of_scope.funeral',
  other_line: 'information.out_of_scope.other_line',
  before_2016: 'information.out_of_scope.before_2016',
};

export const scopeBlock = (reason: OutOfScopeReason, norms: NormTable): InformationBlock =>
  block('out_of_scope', [insurancePhrase(OUT_OF_SCOPE[reason])], [], norms);

// Art. 8 LCS: one month from the delivery of the policy, date to date (Código Civil, art. 5.1).
const CORRECTION_MONTHS = 1;

function policyCorrection(input: InsuranceInput, norms: NormTable): InformationBlock {
  const concluded = input.concludedOn;
  const received = input.policyReceivedOn;
  const delivered =
    input.policyReceived === false || concluded === null
      ? null
      : received === null
        ? concluded
        : max(concluded, received);
  return block(
    'policy_correction',
    [
      insurancePhrase('information.policy_correction'),
      delivered === null
        ? insurancePhrase('information.policy_correction.no_policy')
        : insurancePhrase('information.policy_correction.until', {
            day: day(addMonthsClamped(delivered, CORRECTION_MONTHS)),
          }),
    ],
    ['policy_correction'],
    norms,
  );
}

// A worked example of art. 30 LCS on made-up figures: a home worth 150.000 € insured for
// 100.000 € covers two thirds of a 30.000 € damage.
const EXAMPLE = { value: 150_000, insured: 100_000, damage: 30_000 };
const EXAMPLE_PAID = (EXAMPLE.damage * EXAMPLE.insured) / EXAMPLE.value;

export function informationBlocks(
  input: InsuranceInput,
  norms: NormTable,
): readonly InformationBlock[] {
  return [
    policyCorrection(input, norms),
    block(
      'questionnaire',
      [insurancePhrase('information.questionnaire')],
      ['questionnaire'],
      norms,
    ),
    block(
      'proportional_rule',
      [
        insurancePhrase('information.proportional_rule'),
        insurancePhrase('information.proportional_rule.example', {
          value: { euros: EXAMPLE.value },
          insured: { euros: EXAMPLE.insured },
          damage: { euros: EXAMPLE.damage },
          paid: { euros: EXAMPLE_PAID },
        }),
      ],
      ['proportional_rule'],
      norms,
    ),
    block(
      'overinsurance',
      [insurancePhrase('information.overinsurance')],
      ['overinsurance'],
      norms,
    ),
  ];
}
