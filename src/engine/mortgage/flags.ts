import { toIso, type CivilDate } from '../date';
import { round2 } from '../money';
import {
  mortgagePhrase as p,
  type MortgageCalculation,
  type MortgagePhrase,
  type MortgagePhraseKey,
} from './calculation';
import type { MortgageSource } from './expenses';
import {
  criterionReaches,
  readRulings,
  ruleApplies,
  ruleSource,
  type Basis,
  type CaseLawRuleId,
  type MortgageRuleId,
  type StatuteRuleId,
} from './rules';
import type { Clause, ClauseLabel, MortgageDeps, MortgageInput } from './types';

// The clauses that carry a flag. The rest feed the costs and fees, or are only read.
export const FLAG_LABELS = [
  'floor_clause',
  'irph',
  'default_interest',
  'early_termination',
  'rounding_up',
  'opening_fee',
  'insurance_required',
] as const satisfies readonly ClauseLabel[];

export type FlagLabel = (typeof FLAG_LABELS)[number];

export type FlagState = 'in_deed' | 'not_in_deed' | 'unreadable';

// What a law or a court says about the clause, never a verdict on it. A case-law part shows only
// the rulings read at their source, and the oldest day any of them was last read.
export interface FlagPart {
  readonly basis: Basis;
  readonly rule: MortgageRuleId;
  readonly calculation: MortgageCalculation;
  readonly sources: readonly MortgageSource[];
  // 'YYYY-MM-DD' the state of the case law is given as of; null on a statute part.
  readonly statusAsOf: string | null;
}

export interface ClauseFlag {
  readonly label: FlagLabel;
  readonly state: FlagState;
  // What the review reads in the deed's figures, before any law or ruling.
  readonly calculation: MortgageCalculation;
  readonly parts: readonly FlagPart[];
}

// Three points over the ordinary rate by law from the LCCI; two before it, by case law.
const LCCI_DEFAULT_POINTS = 3;
const CASE_LAW_DEFAULT_POINTS = 2;
// Late interest on a loan for the main home from 15-05-2013: three times the legal interest.
const LH114_TIMES = 3;
// Art. 24 LCCI: arrears of at least twelve monthly instalments in the first half of the term.
const LCCI_MIN_INSTALMENTS = 12;

const statutePart = (
  rule: StatuteRuleId,
  keys: readonly MortgagePhrase[],
  deps: MortgageDeps,
): FlagPart => ({
  basis: 'statute',
  rule,
  calculation: keys,
  sources: [ruleSource(rule, deps.norms)],
  statusAsOf: null,
});

// A court's criterion, shown with the rulings already read at their source; none read, no part.
function caseLawPart(
  rule: CaseLawRuleId,
  keys: readonly MortgagePhrase[],
  deps: MortgageDeps,
): readonly FlagPart[] {
  const read = readRulings(rule, deps.sources);
  if (read === null) return [];
  return [
    { basis: 'case_law', rule, calculation: keys, sources: read.sources, statusAsOf: read.asOf },
  ];
}

const applies = (id: StatuteRuleId, date: CivilDate, deps: MortgageDeps): boolean =>
  ruleApplies(id, date, deps.norms);

const percent = (value: number) => ({ percent: round2(value) });

function floorParts(clause: Clause, input: MortgageInput, deps: MortgageDeps) {
  const vars =
    clause.floorPercent === undefined ? undefined : { floor: percent(clause.floorPercent) };
  if (applies('floor_statute', input.deedOn, deps)) {
    if (input.rateType === 'fixed') return { calculation: [p('flags.floor_fixed')], parts: [] };
    const key = input.rateType === 'mixed' ? 'flags.floor_statute_mixed' : 'flags.floor_statute';
    return { calculation: [], parts: [statutePart('floor_statute', [p(key, vars)], deps)] };
  }
  if (!criterionReaches('floor_case_law', input.deedOn)) return { calculation: [], parts: [] };
  return {
    calculation: [],
    parts: caseLawPart('floor_case_law', [p('flags.floor_case_law', vars)], deps),
  };
}

// The highest legal interest from the deed's year to today's, of the years published.
function highestLegalRate(from: CivilDate, today: CivilDate, deps: MortgageDeps): number | null {
  const first = toIso(from);
  const last = toIso(today);
  const rates = deps.legalInterest
    .filter((period) => period.until >= first && period.from <= last)
    .map((period) => period.rate);
  return rates.length === 0 ? null : Math.max(...rates);
}

function defaultInterestParts(
  clause: Clause,
  input: MortgageInput,
  today: CivilDate,
  deps: MortgageDeps,
): readonly FlagPart[] {
  const { defaultRate, ordinaryRate } = clause;
  const deed = input.deedOn;
  const known = defaultRate !== undefined && ordinaryRate !== undefined;
  if (applies('default_interest_statute', deed, deps)) {
    if (!known)
      return [statutePart('default_interest_statute', [p('flags.default_interest_lcci')], deps)];
    const legal = round2(ordinaryRate + LCCI_DEFAULT_POINTS);
    const vars = {
      default: percent(defaultRate),
      ordinary: percent(ordinaryRate),
      legal: percent(legal),
    };
    const differs = Math.abs(defaultRate - legal) > 0.005;
    return [
      statutePart(
        'default_interest_statute',
        [
          p('flags.default_interest_lcci'),
          p(
            differs ? 'flags.default_interest_lcci_differs' : 'flags.default_interest_lcci_matches',
            vars,
          ),
        ],
        deps,
      ),
    ];
  }

  const parts: FlagPart[] = [];
  // Art. 114 LH caps late interest only on a loan to buy the main home, mortgaged on that home,
  // which this review does not ask: its phrases carry that condition.
  if (applies('default_interest_lh114', deed, deps)) {
    const highest = highestLegalRate(deed, today, deps);
    const limit = highest === null ? null : round2(highest * LH114_TIMES);
    const above = defaultRate !== undefined && limit !== null && defaultRate > limit;
    parts.push(
      statutePart(
        'default_interest_lh114',
        [
          p('flags.default_interest_lh114'),
          ...(above
            ? [
                p('flags.default_interest_lh114_above', {
                  default: percent(defaultRate),
                  limit: percent(limit),
                }),
              ]
            : []),
        ],
        deps,
      ),
    );
  }
  if (criterionReaches('default_interest_case_law', deed)) {
    const reference = known ? round2(ordinaryRate + CASE_LAW_DEFAULT_POINTS) : null;
    const above = known && reference !== null && defaultRate > reference;
    parts.push(
      ...caseLawPart(
        'default_interest_case_law',
        [
          p('flags.default_interest_case_law'),
          ...(above
            ? [
                p('flags.default_interest_case_law_above', {
                  default: percent(defaultRate),
                  ordinary: percent(ordinaryRate),
                  reference: percent(reference),
                }),
              ]
            : []),
        ],
        deps,
      ),
    );
  }
  return parts;
}

// Art. 24 LCCI sets the least arrears that allow calling in the whole loan; its first transitional
// provision, 4, applies it to earlier deeds too unless their clause favours the borrower.
function earlyTerminationParts(
  clause: Clause,
  input: MortgageInput,
  deps: MortgageDeps,
): readonly FlagPart[] {
  const earlier = !applies('early_termination', input.deedOn, deps);
  const missed = clause.missedInstalments;
  const fewer = missed !== undefined && missed < LCCI_MIN_INSTALMENTS;
  const statute = statutePart(
    'early_termination',
    [
      p('flags.early_termination'),
      ...(earlier ? [p('flags.early_termination_earlier_deed')] : []),
      ...(fewer ? [p('flags.early_termination_fewer', { instalments: { integer: missed } })] : []),
    ],
    deps,
  );
  if (!earlier || !criterionReaches('early_termination_case_law', input.deedOn)) return [statute];
  return [
    statute,
    ...caseLawPart('early_termination_case_law', [p('flags.early_termination_case_law')], deps),
  ];
}

// The fee in euros and, with the capital lent, as a share of it. No range of usual fees is given.
function openingFeeAmount(clause: Clause, input: MortgageInput): MortgageCalculation {
  const fee = clause.feeAmount;
  if (fee === undefined) return [];
  const amount = p('flags.opening_fee_amount', { fee: { euros: fee } });
  if (input.loanAmount === null) return [amount];
  return [amount, p('flags.opening_fee_share', { share: percent((fee / input.loanAmount) * 100) })];
}

function openingFeeParts(
  clause: Clause,
  input: MortgageInput,
  deps: MortgageDeps,
): readonly FlagPart[] {
  // 14.4: no fee for a service the opening fee already covers, from the LCCI on.
  const duplicate =
    clause.duplicateFee === true && applies('opening_fee_duplicate', input.deedOn, deps)
      ? [statutePart('opening_fee_duplicate', [p('flags.opening_fee_duplicate')], deps)]
      : [];
  return [
    ...duplicate,
    ...caseLawPart('opening_fee_case_law', [p('flags.opening_fee_case_law')], deps),
  ];
}

interface Reading {
  readonly calculation: MortgageCalculation;
  readonly parts: readonly FlagPart[];
}

const only = (key: MortgagePhraseKey): Reading => ({ calculation: [p(key)], parts: [] });

function readClause(
  label: FlagLabel,
  clause: Clause,
  input: MortgageInput,
  today: CivilDate,
  deps: MortgageDeps,
): Reading {
  switch (label) {
    case 'floor_clause':
      return floorParts(clause, input, deps);
    case 'irph':
      return { calculation: [], parts: caseLawPart('irph', [p('flags.irph')], deps) };
    case 'default_interest':
      return { calculation: [], parts: defaultInterestParts(clause, input, today, deps) };
    case 'early_termination':
      return { calculation: [], parts: earlyTerminationParts(clause, input, deps) };
    // Its rule lives in the consumer protection law, not among the norms this review reads yet.
    case 'rounding_up':
      return only('flags.rounding_up');
    case 'opening_fee':
      return {
        calculation: openingFeeAmount(clause, input),
        parts: openingFeeParts(clause, input, deps),
      };
    case 'insurance_required':
      return applies('insurance_tied', input.deedOn, deps)
        ? {
            calculation: [],
            parts: [statutePart('insurance_tied', [p('flags.insurance_tied')], deps)],
          }
        : only('flags.insurance_before_lcci');
  }
}

const isFlagLabel = (label: ClauseLabel): label is FlagLabel =>
  (FLAG_LABELS as readonly ClauseLabel[]).includes(label);

// A floor of 0 % only keeps the rate from going below zero, as art. 21.4 LCCI allows: no floor.
const zeroFloor = (clause: Clause): boolean =>
  clause.label === 'floor_clause' && clause.floorPercent === 0;

// One flag per clause the person confirmed or the reading found, in the order they came. What the
// law or a court says is given beside it, with its source, and never as a verdict on the clause.
export function reviewFlags(
  input: MortgageInput,
  today: CivilDate,
  deps: MortgageDeps,
): readonly ClauseFlag[] {
  const seen = new Set<FlagLabel>();
  const flags: ClauseFlag[] = [];
  for (const clause of input.clauses) {
    const { label } = clause;
    if (!isFlagLabel(label) || seen.has(label)) continue;
    seen.add(label);
    if (clause.present === null) {
      flags.push({ label, state: 'unreadable', calculation: [], parts: [] });
    } else if (!clause.present) {
      flags.push({ label, state: 'not_in_deed', calculation: [], parts: [] });
    } else if (zeroFloor(clause)) {
      flags.push({ label, state: 'not_in_deed', calculation: [p('flags.floor_zero')], parts: [] });
    } else {
      flags.push({ label, state: 'in_deed', ...readClause(label, clause, input, today, deps) });
    }
  }
  return flags;
}
