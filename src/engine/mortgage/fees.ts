import { addMonthsClamped, compareDates, toIso, type CivilDate } from '../date';
import { assessAcross, type Across } from '../law/readings';
import { round2 } from '../money';
import { mortgagePhrase as p, type MortgageCalculation, type MortgagePhrase } from './calculation';
import type { MortgageSource } from './expenses';
import type { NormTable } from './norms';
import {
  activeRules,
  ruleApplies,
  ruleSource,
  ruleStanding,
  STATUTE_RULES,
  type StatuteRuleId,
} from './rules';
import type { MortgageDeps, MortgageInput, Operation, OperationKind } from './types';

// `above_cap` is the only status whose euros reach a total.
export type FeeStatus = 'above_cap' | 'within_cap' | 'not_checkable' | 'review_it';

export interface FeeFinding {
  // Position in the input's operations.
  readonly index: number;
  readonly kind: OperationKind;
  readonly status: FeeStatus;
  // % of the capital repaid the law allows, and that cap in euros; null without a cap to give.
  readonly capPercent: number | null;
  readonly cap: number | null;
  // Euros charged over the cap, on an `above_cap` finding only.
  readonly amount: number | null;
  readonly calculation: MortgageCalculation;
  readonly sources: readonly MortgageSource[];
}

// What an operation's cap depends on when the person or the law leaves it open: a mixed rate read
// as fixed or as variable; the option of art. 23.5 the deed picks; for a deed before the LCCI,
// whether its art. 23.6 and the window of 2022-2024 reach it (`lcci_reach`) or not; under
// Ley 41/2007, whether a variable rate is revised at least once a year (art. 9); and, for the
// fixed stretch of a mixed rate, whether the ten years of art. 23.7 run from the deed or from the
// day the fixed rate applies.
export type RateReading = 'fixed' | 'variable';
export type OptionReading = 'option_a' | 'option_b';
export type ReachReading = 'deed_regime' | 'lcci_reach';
export type RevisionReading = 'revised_yearly' | 'revised_less_often';
export type StretchReading = 'from_deed' | 'from_fixed_rate';

export type FeeQuestion =
  | 'rate_type'
  | 'prepayment_option'
  | 'earlier_deed'
  | 'rate_revision'
  | 'rate_type_and_prepayment_option'
  | 'rate_type_and_earlier_deed'
  | 'rate_type_and_rate_revision'
  | 'earlier_deed_and_rate_revision'
  | 'rate_type_and_earlier_deed_and_rate_revision'
  | 'rate_type_and_fixed_stretch'
  | 'rate_type_and_prepayment_option_and_fixed_stretch';

export type FeeReading =
  | RateReading
  | `${RateReading}.${OptionReading}`
  | `${RateReading}.${ReachReading}`
  | `${RateReading}.${RevisionReading}`
  | `${RateReading}.${ReachReading}.${RevisionReading}`
  | `${RateReading}.${StretchReading}`;

export type FeeItem = Across<FeeQuestion, FeeReading, FeeFinding>;

export interface FeeTotal {
  // What holds in every reading: the lowest one. The only figure a total or a letter carries.
  readonly counted: number;
  // The most any reading gives.
  readonly upTo: number;
}

interface World {
  readonly rate: RateReading;
  readonly option: OptionReading | null;
  readonly reach: ReachReading | null;
  // Null when the revision cannot change the cap, or when the person gave it.
  readonly revision: RevisionReading | null;
  // Null unless the two counts of art. 23.7 can give different caps.
  readonly stretch: StretchReading | null;
}

type Cap =
  | {
      readonly kind: 'cap';
      readonly percent: number;
      readonly rules: readonly StatuteRuleId[];
      readonly phrases: readonly MortgagePhrase[];
      // A cap of the LCCI, which also binds the compensation to the lender's financial loss.
      readonly lossBound: boolean;
    }
  | {
      readonly kind: 'none';
      readonly status: 'not_checkable' | 'review_it';
      readonly rules: readonly StatuteRuleId[];
      readonly phrases: readonly MortgagePhrase[];
    };

// Art. 23.5 has the deed pick an option only from the LCCI on: an earlier deed has none to ask.
export const deedPicksOption = (deed: CivilDate): boolean =>
  toIso(deed) >= STATUTE_RULES.prepayment_lcci_variable.from;

// Art. 9 Ley 41/2007: no compensation for the interest rate risk when the rate is revised at most
// every twelve months.
const YEARLY_REVISION_MONTHS = 12;

const PREPAYMENT: ReadonlySet<OperationKind> = new Set([
  'partial_prepayment',
  'full_prepayment',
  'creditor_subrogation',
]);

// Art. 23.7: 2 % in the first ten years, 1,5 % after.
const FIXED_FIRST_YEARS = 10;

// Whether the operation falls within the first `years` of the contract, counted from the deed.
const withinYears = (deed: CivilDate, on: CivilDate, years: number): boolean =>
  compareDates(on, addMonthsClamped(deed, years * 12)) < 0;

const cap = (
  percent: number,
  rules: readonly StatuteRuleId[],
  phrases: readonly MortgagePhrase[],
  lossBound = false,
): Cap => ({ kind: 'cap', percent, rules, phrases, lossBound });

const none = (
  status: 'not_checkable' | 'review_it',
  phrase: MortgagePhrase['key'],
  rules: readonly StatuteRuleId[],
): Cap => ({ kind: 'none', status, rules, phrases: [p(phrase)] });

// A cap that falls to nothing once its first years are over.
function periodCap(
  deed: CivilDate,
  on: CivilDate,
  percent: number,
  years: number,
  rule: StatuteRuleId,
  key: 'fees.lcci_variable' | 'fees.conversion',
  lossBound: boolean,
): Cap {
  const vars = { percent: { percent }, years: { integer: years } };
  if (withinYears(deed, on, years)) return cap(percent, [rule], [p(key, vars)], lossBound);
  return cap(0, [rule], [p(key, vars), p('fees.after_period', { years: { integer: years } })]);
}

// The wording of art. 23.6 in force on `on`, if any.
const conversionWording = (on: CivilDate, norms: NormTable) =>
  activeRules(on, norms).find(({ rule }) => rule.id.startsWith('conversion_cap'));

// The wording of art. 23.6 in force on the day of the switch: 0,15 % in its first three years
// until 23-11-2022, 0,05 % after; nothing once the first three years are over. From 24-11-2022 a
// switch that repays no capital allows nothing; the 2019 wording only capped the compensation for
// what was repaid, so a fee on a switch without repayment is left unchecked under it.
function conversionCap(operation: Operation, deed: CivilDate, norms: NormTable): Cap {
  const wording = conversionWording(operation.on, norms);
  if (wording === undefined) return none('not_checkable', 'fees.earlier_deed_novation', []);
  const id = wording.rule.id;
  if (wording.doubt !== null) return none('review_it', 'fees.doubtful_norm', [id]);
  if (operation.principal === 0)
    return id === 'conversion_cap_2019'
      ? none('not_checkable', 'fees.conversion_no_repayment_2019', [id])
      : cap(0, [id], [p('fees.conversion_no_repayment')]);
  const percent = id === 'conversion_cap_2019' ? 0.15 : 0.05;
  return periodCap(deed, operation.on, percent, 3, id, 'fees.conversion', false);
}

// The caps on early repayment for the deed's own regime.
function prepaymentCap(
  operation: Operation,
  input: MortgageInput,
  world: World,
  deps: MortgageDeps,
) {
  const deed = input.deedOn;
  const { on } = operation;
  const lcci = ruleStanding('prepayment_lcci_variable', deed, deps.norms);
  if (lcci === 'doubt')
    return none('review_it', 'fees.doubtful_norm', ['prepayment_lcci_variable']);
  if (lcci === 'applies') {
    // 23.7: 2 % of the capital repaid in the first ten years, 1,5 % after. Counted from the day
    // the fixed rate applies, a day not asked, they may run past the deed's tenth year.
    if (world.rate === 'fixed') {
      const first = withinYears(deed, on, FIXED_FIRST_YEARS);
      if (!first && world.stretch === 'from_fixed_rate')
        return none('not_checkable', 'fees.lcci_fixed_from_fixed_rate', ['prepayment_lcci_fixed']);
      return cap(
        first ? 2 : 1.5,
        ['prepayment_lcci_fixed'],
        [
          p(first ? 'fees.lcci_fixed_first' : 'fees.lcci_fixed_after', {
            years: { integer: FIXED_FIRST_YEARS },
          }),
        ],
        true,
      );
    }
    // 23.5: a) 0,15 % in the first five years or b) 0,25 % in the first three; nothing after.
    return world.option === 'option_b'
      ? periodCap(deed, on, 0.25, 3, 'prepayment_lcci_variable', 'fees.lcci_variable', true)
      : periodCap(deed, on, 0.15, 5, 'prepayment_lcci_variable', 'fees.lcci_variable', true);
  }
  const law41 = ruleStanding('prepayment_law41', deed, deps.norms);
  if (law41 === 'doubt') return none('review_it', 'fees.doubtful_norm', ['prepayment_law41']);
  // Before Ley 41/2007 the caps came from a regime this review has not read.
  if (law41 === 'no') return none('not_checkable', 'fees.before_2007', []);
  // Art. 9: a rate fixed for more than twelve months may add the compensation the deed agreed for
  // the interest rate risk, which the review cannot weigh. A variable rate revised at most every
  // twelve months has art. 8 alone: 0,5 % in the first five years, 0,25 % after.
  const revision =
    world.revision ??
    ((input.rateRevisionMonths ?? Infinity) <= YEARLY_REVISION_MONTHS
      ? 'revised_yearly'
      : 'revised_less_often');
  if (world.rate === 'fixed')
    return none('not_checkable', 'fees.law41_fixed', ['prepayment_law41']);
  if (revision === 'revised_less_often')
    return none('not_checkable', 'fees.law41_revised_less_often', ['prepayment_law41']);
  const first = withinYears(deed, on, 5);
  return cap(
    first ? 0.5 : 0.25,
    ['prepayment_law41'],
    [p(first ? 'fees.law41_first' : 'fees.law41_after', { years: { integer: 5 } })],
  );
}

const lcciDeed = (input: MortgageInput, norms: NormTable): boolean =>
  ruleApplies('prepayment_lcci_variable', input.deedOn, norms);

// Whether the window without compensation covers the operation, for a variable rate.
const windowOn = (operation: Operation, rate: RateReading, norms: NormTable) =>
  rate === 'variable'
    ? activeRules(operation.on, norms).find(({ rule }) => rule.id === 'fee_free_window')
    : undefined;

function capFor(operation: Operation, input: MortgageInput, world: World, deps: MortgageDeps): Cap {
  const reachesLcci = lcciDeed(input, deps.norms) || world.reach === 'lcci_reach';
  const window = windowOn(operation, world.rate, deps.norms);
  if (window !== undefined && reachesLcci) {
    if (window.doubt !== null) return none('review_it', 'fees.doubtful_norm', ['fee_free_window']);
    return cap(0, ['fee_free_window'], [p('fees.window')]);
  }
  if (operation.kind !== 'fixed_rate_novation') return prepaymentCap(operation, input, world, deps);
  if (input.rateType === 'fixed') return none('not_checkable', 'fees.already_fixed', []);
  // A switch under a deed before the LCCI, outside its reach, follows a regime not read here.
  if (!reachesLcci) return none('not_checkable', 'fees.earlier_deed_novation', []);
  return conversionCap(operation, input.deedOn, deps.norms);
}

const sourcesOf = (rules: readonly StatuteRuleId[], norms: NormTable) =>
  [...new Set(rules)].map((id) => ruleSource(id, norms));

function finding(
  operation: Operation,
  index: number,
  input: MortgageInput,
  world: World,
  deps: MortgageDeps,
): FeeFinding {
  const c = capFor(operation, input, world, deps);
  const notes: MortgagePhrase[] = [];
  const noteRules: StatuteRuleId[] = [];
  // A new lender that takes the loan over may also switch it to a fixed rate, whose cap is lower.
  if (operation.kind === 'creditor_subrogation') notes.push(p('fees.subrogation'));
  // 23.3: on full repayment, the unused part of an ancillary insurance's premium.
  if (
    operation.kind === 'full_prepayment' &&
    operation.hadInsurance === true &&
    ruleStanding('unused_premium', input.deedOn, deps.norms) === 'applies'
  ) {
    notes.push(p('fees.unused_premium'));
    noteRules.push('unused_premium');
  }
  const base = { index, kind: operation.kind };
  if (c.kind === 'none')
    return {
      ...base,
      status: c.status,
      capPercent: null,
      cap: null,
      amount: null,
      calculation: [...c.phrases, ...notes],
      sources: sourcesOf([...c.rules, ...noteRules], deps.norms),
    };
  const capEuros = round2((operation.principal * c.percent) / 100);
  const over = round2(operation.feeCharged - capEuros);
  const above = over > 0;
  const vars = {
    charged: { euros: operation.feeCharged },
    principal: { euros: operation.principal },
    cap: { euros: capEuros },
  };
  // 23.8: within the cap, the compensation may still exceed the lender's loss, unknown here.
  const loss = !above && c.lossBound && capEuros > 0;
  return {
    ...base,
    status: above ? 'above_cap' : 'within_cap',
    capPercent: c.percent,
    cap: capEuros,
    amount: above ? over : null,
    calculation: [
      ...c.phrases,
      above ? p('fees.above_cap', { ...vars, over: { euros: over } }) : p('fees.within_cap', vars),
      ...(loss ? [p('fees.financial_loss')] : []),
      ...notes,
    ],
    sources: sourcesOf(
      [...c.rules, ...(loss ? (['financial_loss_cap'] as const) : []), ...noteRules],
      deps.norms,
    ),
  };
}

// The readings an operation is worked out in: only the points that can change its cap split it.
function worlds(operation: Operation, input: MortgageInput, deps: MortgageDeps): readonly World[] {
  const prepayment = PREPAYMENT.has(operation.kind);
  const rates: readonly RateReading[] =
    input.rateType === 'mixed'
      ? ['fixed', 'variable']
      : [input.rateType === 'fixed' ? 'fixed' : 'variable'];
  const option = input.prepaymentOption;
  const law41 = ruleApplies('prepayment_law41', input.deedOn, deps.norms);
  // Art. 9 Ley 41/2007 turns on the revision only for a variable-rate repayment under its regime.
  const revisions = (rate: RateReading, reach: ReachReading | null) =>
    prepayment && law41 && rate === 'variable' && reach !== 'lcci_reach'
      ? input.rateRevisionMonths === null
        ? (['revised_yearly', 'revised_less_often'] as const)
        : [null]
      : [null];
  // Within the deed's first ten years both counts of art. 23.7 give 2 %.
  const stretches: readonly (StretchReading | null)[] =
    prepayment &&
    input.rateType === 'mixed' &&
    !withinYears(input.deedOn, operation.on, FIXED_FIRST_YEARS)
      ? ['from_deed', 'from_fixed_rate']
      : [null];
  return rates.flatMap((rate): World[] => {
    if (lcciDeed(input, deps.norms)) {
      if (rate === 'fixed')
        return stretches.map((stretch) => ({
          rate,
          option: null,
          reach: null,
          revision: null,
          stretch,
        }));
      const options: readonly (OptionReading | null)[] = !prepayment
        ? [null]
        : option === 'a_015_5y'
          ? ['option_a']
          : option === 'b_025_3y'
            ? ['option_b']
            : ['option_a', 'option_b'];
      return options.map((o) => ({ rate, option: o, reach: null, revision: null, stretch: null }));
    }
    const reaches =
      windowOn(operation, rate, deps.norms) !== undefined ||
      (!prepayment && conversionWording(operation.on, deps.norms) !== undefined);
    const reachReadings: readonly (ReachReading | null)[] = reaches
      ? ['deed_regime', 'lcci_reach']
      : [null];
    return reachReadings.flatMap((reach) =>
      revisions(rate, reach).map((revision) => ({
        rate,
        option: null,
        reach,
        revision,
        stretch: null,
      })),
    );
  });
}

const readingOf = (w: World): FeeReading =>
  [w.rate, w.option, w.reach, w.revision, w.stretch]
    .filter((x) => x !== null)
    .join('.') as FeeReading;

const QUESTION_PARTS = [
  ['rate', 'rate_type'],
  ['option', 'prepayment_option'],
  ['reach', 'earlier_deed'],
  ['revision', 'rate_revision'],
  ['stretch', 'fixed_stretch'],
] as const;

function questionOf(ws: readonly World[]): FeeQuestion {
  const varies = (key: keyof World) =>
    new Set(ws.flatMap((w) => (w[key] === null ? [] : [w[key]]))).size > 1;
  const parts = QUESTION_PARTS.filter(([key]) => varies(key)).map(([, part]) => part);
  return (parts.length === 0 ? 'rate_type' : parts.join('_and_')) as FeeQuestion;
}

// Each early repayment, switch to a fixed rate or change of lender against the cap the law set on
// its compensation. Where the deed or the law leaves the cap open, every reading is worked out.
export function reviewFees(input: MortgageInput, deps: MortgageDeps): readonly FeeItem[] {
  return input.operations.map((operation, index) => {
    const ws = worlds(operation, input, deps);
    const byReading = new Map(ws.map((w) => [readingOf(w), w]));
    return assessAcross(questionOf(ws), [...byReading.keys()], (reading) =>
      finding(operation, index, input, byReading.get(reading) as World, deps),
    );
  });
}

export const feeFindings = (item: FeeItem): readonly FeeFinding[] =>
  item.kind === 'single' ? [item.finding] : item.readings.map((r) => r.finding);

const overCap = (f: FeeFinding): number => (f.status === 'above_cap' ? (f.amount ?? 0) : 0);

export function feeTotal(items: readonly FeeItem[]): FeeTotal {
  let counted = 0;
  let upTo = 0;
  for (const item of items) {
    const amounts = feeFindings(item).map(overCap);
    counted += Math.min(...amounts);
    upTo += Math.max(...amounts);
  }
  return { counted: round2(counted), upTo: round2(upTo) };
}

// The capital the example of repaying today is worked out on.
export const TODAY_EXAMPLE = 10_000;

export interface TodayCap {
  readonly status: 'cap' | 'not_checkable' | 'review_it';
  // The law's cap, and the lower one the deed sets, if it sets one.
  readonly capPercent: number | null;
  readonly deedPercent: number | null;
  // The most the lender may charge for repaying TODAY_EXAMPLE euros today.
  readonly cap: number | null;
  // The next day the law's cap changes, and to what; null when it changes no more.
  readonly next: { readonly on: CivilDate; readonly percent: number } | null;
  readonly calculation: MortgageCalculation;
  readonly sources: readonly MortgageSource[];
}

export type TodayItem = Across<FeeQuestion, FeeReading, TodayCap>;

// The anniversaries on which a cap can change: the end of the first 3 or 5 years of a variable
// rate and of the first 10 of a fixed one.
const CHANGE_YEARS = [3, 5, FIXED_FIRST_YEARS] as const;

function nextChange(
  operation: Operation,
  input: MortgageInput,
  world: World,
  deps: MortgageDeps,
  percent: number,
): TodayCap['next'] {
  const days = CHANGE_YEARS.map((years) => addMonthsClamped(input.deedOn, years * 12))
    .filter((on) => compareDates(on, operation.on) > 0)
    .sort(compareDates);
  for (const on of days) {
    const later = capFor({ ...operation, on }, input, world, deps);
    if (later.kind === 'none') return null;
    if (later.percent !== percent) return { on, percent: later.percent };
  }
  return null;
}

function todayCap(
  operation: Operation,
  input: MortgageInput,
  world: World,
  deps: MortgageDeps,
): TodayCap {
  const c = capFor(operation, input, world, deps);
  if (c.kind === 'none')
    return {
      status: c.status,
      capPercent: null,
      deedPercent: null,
      cap: null,
      next: null,
      calculation: c.phrases,
      sources: sourcesOf(c.rules, deps.norms),
    };
  const own = world.rate === 'fixed' ? input.deedPercents.fixed : input.deedPercents.variable;
  const deedPercent = own !== undefined && own < c.percent ? own : null;
  const percent = deedPercent ?? c.percent;
  // 23.8: within the cap, the compensation may still exceed the lender's loss, unknown here.
  const loss = c.lossBound && percent > 0;
  return {
    status: 'cap',
    capPercent: c.percent,
    deedPercent,
    cap: round2((TODAY_EXAMPLE * percent) / 100),
    next: nextChange(operation, input, world, deps, c.percent),
    calculation: [
      ...c.phrases,
      ...(deedPercent === null
        ? []
        : [p('fees.deed_lower', { percent: { percent: deedPercent } })]),
      ...(loss ? [p('fees.financial_loss')] : []),
    ],
    sources: sourcesOf(
      [...c.rules, ...(loss ? (['financial_loss_cap'] as const) : [])],
      deps.norms,
    ),
  };
}

// What the law lets the lender charge for repaying capital today, in every reading the deed or
// the law leaves open: the figures of the deed and the law, never a recommendation.
export function prepaymentToday(
  input: MortgageInput,
  today: CivilDate,
  deps: MortgageDeps,
): TodayItem {
  const operation: Operation = {
    on: today,
    kind: 'partial_prepayment',
    principal: TODAY_EXAMPLE,
    feeCharged: 0,
    hadInsurance: null,
  };
  const ws = worlds(operation, input, deps);
  const byReading = new Map(ws.map((w) => [readingOf(w), w]));
  return assessAcross(questionOf(ws), [...byReading.keys()], (reading) =>
    todayCap(operation, input, byReading.get(reading) as World, deps),
  );
}
