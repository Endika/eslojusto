import type { CivilDate } from '../date';
import {
  mortgagePhrase as p,
  type MortgageCalculation,
  type MortgagePhraseKey,
} from './calculation';
import type { MortgageSource } from './expenses';
import {
  criterionReaches,
  readRulings,
  ruleApplies,
  ruleSource,
  type Basis,
  type StatuteRuleId,
} from './rules';
import type { MortgageDeps, MortgageInput } from './types';

// Blocks shown beside the review with their source and no verdict, never applied to the case.
export type InformationBlockId =
  | 'fein_timing'
  | 'handwritten_statement'
  | 'limitation_rule'
  | 'prior_step_439bis'
  | 'loan_assignment'
  | 'complaints_service';

export interface InformationBlock {
  readonly id: InformationBlockId;
  readonly basis: Basis;
  readonly calculation: MortgageCalculation;
  readonly sources: readonly MortgageSource[];
  // 'YYYY-MM-DD' the state of the case law is given as of; null on a statute block.
  readonly statusAsOf: string | null;
}

const statute = (
  id: InformationBlockId,
  keys: readonly MortgagePhraseKey[],
  rules: readonly StatuteRuleId[],
  deps: MortgageDeps,
): InformationBlock => ({
  id,
  basis: 'statute',
  calculation: keys.map((k) => p(k)),
  sources: rules.map((rule) => ruleSource(rule, deps.norms)),
  statusAsOf: null,
});

const reaches = (id: StatuteRuleId, date: CivilDate, deps: MortgageDeps): boolean =>
  ruleApplies(id, date, deps.norms);

// When the time to ask for the set-up costs back starts to run: the rule as the courts give it,
// never worked out for the person. Only the rulings read at their source are cited.
function limitationRule(deps: MortgageDeps): readonly InformationBlock[] {
  const read = readRulings('limitation_rule', deps.sources);
  if (read === null) return [];
  return [
    {
      id: 'limitation_rule',
      basis: 'case_law',
      calculation: [p('information.limitation_rule')],
      sources: read.sources,
      statusAsOf: read.asOf,
    },
  ];
}

export function informationBlocks(
  input: MortgageInput,
  today: CivilDate,
  deps: MortgageDeps,
): readonly InformationBlock[] {
  const deed = input.deedOn;
  return [
    // 14 and 15 LCCI: the FEIN and the FiAE ten calendar days before the deed, the notary's record
    // the day before at the latest, and its mention in the deed.
    ...(reaches('fein_timing', deed, deps)
      ? [
          statute(
            'fein_timing',
            ['information.fein_timing', 'information.transparency_act'],
            ['fein_timing', 'transparency_act_free'],
            deps,
          ),
        ]
      : []),
    ...(reaches('handwritten_statement', deed, deps)
      ? [
          statute(
            'handwritten_statement',
            ['information.handwritten_statement'],
            ['handwritten_statement'],
            deps,
          ),
        ]
      : []),
    ...(criterionReaches('limitation_rule', deed) && !reaches('expenses_lcci', deed, deps)
      ? limitationRule(deps)
      : []),
    ...(reaches('prior_step_439bis', today, deps)
      ? [
          statute(
            'prior_step_439bis',
            ['information.prior_step_439bis'],
            ['prior_step_439bis'],
            deps,
          ),
        ]
      : []),
    // Still pending validation: told as what the decree-law provides.
    ...(reaches('loan_assignment', today, deps)
      ? [statute('loan_assignment', ['information.loan_assignment'], ['loan_assignment'], deps)]
      : []),
    statute('complaints_service', ['information.complaints_service'], ['complaints_service'], deps),
  ];
}
