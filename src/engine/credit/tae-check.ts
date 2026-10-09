import { toIso } from '../date';
import { assessAcross } from '../law/readings';
import { round2 } from '../money';
import { creditPhrase, type CreditPhrase } from './calculation';
import { creditFinding, single, type CreditFinding, type CreditItem } from './finding';
import type { NormTable } from './norms';
import { ruleApplies, type StatuteRuleId } from './rules';
import {
  aprFlows,
  solveApr,
  type AprFlows,
  type BalloonReading,
  type Cost,
  type FlowOptions,
  type TimeBasis,
} from './tae';
import type { CreditInput } from './types';

const PERCENT = 100;

// Annex I, observation d: the APR is given to one decimal, the next one rounding up from 5. The
// figures are rounded through twelve significant digits first so that a typed 12,05 stays 12,05.
export function roundTo(value: number, decimals: number): number {
  const scale = 10 ** decimals;
  return Math.round(Number((value * scale).toPrecision(12))) / scale;
}

export const oneDecimal = (percent: number): number => roundTo(percent, 1);

// The cost a charge or the linked insurance adds to the APR, in percentage points.
export interface Contribution {
  readonly cost: Cost;
  readonly points: number;
}

export interface AprDetail {
  // The APR that comes out of the contract's figures, in %, to two decimals, and as solved.
  readonly apr: number;
  readonly exact: number;
  readonly declared: number | null;
  readonly basis: TimeBasis;
  readonly flows: readonly {
    readonly on: string;
    readonly years: number;
    readonly amount: number;
  }[];
  readonly received: number;
  readonly totalPayable: number;
  // What the credit costs: everything paid less what was received.
  readonly totalCost: number;
  readonly contributions: readonly Contribution[];
}

export type InsuranceReading = 'insurance_counted' | 'insurance_left_out';

// One world the APR is worked out in: the linked insurance counted or not, and where an undated
// balloon falls.
interface AprWorld {
  readonly insurance: boolean;
  readonly balloon: BalloonReading;
}

const solve = (flows: AprFlows | null): number | null => {
  if (flows === null) return null;
  const solution = solveApr(flows.flows);
  return solution.kind === 'solved' ? solution.rate * PERCENT : null;
};

// The costs the APR counts in one reading, each taken out in turn.
function contributions(input: CreditInput, world: AprWorld, apr: number): readonly Contribution[] {
  const costs: Cost[] = input.charges.map((_, index) => ({ kind: 'charge', index }));
  if (input.insurance !== null && world.insurance) costs.push({ kind: 'insurance' });
  return costs.flatMap((cost) => {
    const without = solve(aprFlows(input, { ...world, leaveOut: cost }));
    return without === null ? [] : [{ cost, points: round2(apr - without) }];
  });
}

const CHARGE_PHRASE = {
  opening: 'apr.contribution.opening',
  study: 'apr.contribution.study',
  management: 'apr.contribution.management',
  other: 'apr.contribution.other',
} as const;

function contributionPhrase(input: CreditInput, c: Contribution): CreditPhrase {
  const charge = c.cost.kind === 'charge' ? input.charges[c.cost.index] : undefined;
  return creditPhrase(
    charge === undefined ? 'apr.contribution.insurance' : CHARGE_PHRASE[charge.kind],
    { points: { points: c.points } },
  );
}

function detailOf(input: CreditInput, flows: AprFlows, exact: number, world: AprWorld): AprDetail {
  return {
    apr: round2(exact),
    exact,
    declared: input.declaredApr,
    basis: flows.basis,
    flows: flows.flows.map((f) => ({ on: toIso(f.on), years: f.years, amount: round2(f.amount) })),
    received: round2(flows.received),
    totalPayable: round2(flows.totalPayable),
    totalCost: round2(flows.totalPayable - flows.received),
    contributions: contributions(input, world, exact),
  };
}

// The rules a reading of the APR rests on: the equation always, the assumptions of part II for a
// revolving card, and art. 21 for a missing or a lower declared APR.
function rulesFor(input: CreditInput, status: CreditFinding['status']): readonly StatuteRuleId[] {
  const rules: StatuteRuleId[] = ['tae_formula'];
  if (input.product === 'revolving') rules.push('tae_assumptions');
  if (status === 'contract_lower') rules.push('tae_inexact');
  if (status === 'contract_missing') rules.push('tae_missing');
  return rules;
}

// One reading of the APR in one world.
function aprReading(input: CreditInput, world: AprWorld, norms: NormTable): CreditFinding {
  const options: FlowOptions = { ...world, leaveOut: null };
  const flows = aprFlows(input, options);
  const finding = (
    status: CreditFinding['status'],
    calculation: readonly CreditPhrase[],
    detail: AprDetail | null = null,
  ) => creditFinding('apr', status, calculation, rulesFor(input, status), norms, { detail });
  if (flows === null) return finding('not_entered', [creditPhrase('item.not_entered')]);
  const exact = solve(flows);
  if (exact === null) return finding('unsolvable', [creditPhrase('apr.unsolvable')]);
  const detail = detailOf(input, flows, exact, world);
  const apr = { percent: detail.apr };
  const declared = input.declaredApr;
  const status =
    declared === null
      ? 'contract_missing'
      : oneDecimal(declared) === oneDecimal(exact)
        ? 'matches'
        : oneDecimal(declared) < oneDecimal(exact)
          ? 'contract_lower'
          : 'contract_higher';
  const insurancePhrases =
    input.insurance === null
      ? []
      : [creditPhrase(world.insurance ? 'apr.insurance_counted' : 'apr.insurance_left_out')];
  const balloonPhrases =
    input.balloon === null || input.balloon.dueOn !== null
      ? []
      : [creditPhrase(`apr.${world.balloon}`)];
  return finding(
    status,
    [
      ...(input.product === 'revolving'
        ? [creditPhrase('apr.revolving_assumption', { limit: { euros: detail.received } })]
        : []),
      creditPhrase('apr.recomputed', { apr }),
      ...(declared === null
        ? [creditPhrase('apr.contract_missing')]
        : [creditPhrase(`apr.${status}` as const, { apr, declared: { percent: declared } })]),
      creditPhrase('apr.one_decimal'),
      ...insurancePhrases,
      ...balloonPhrases,
      creditPhrase('apr.total_payable', { euros: { euros: detail.totalPayable } }),
      creditPhrase('apr.total_cost', { euros: { euros: detail.totalCost } }),
      ...(input.declaredTotalPayable === null
        ? []
        : [
            creditPhrase('apr.declared_total', {
              euros: { euros: input.declaredTotalPayable },
            }),
          ]),
      ...detail.contributions.map((c) => contributionPhrase(input, c)),
    ],
    detail,
  );
}

// Annex I as rewritten on 09-02-2013 sets the assumptions a revolving card's APR is worked out
// on. The earlier wording has not been read, so a card concluded before then is left to review.
const revolvingBeforeAssumptions = (input: CreditInput, norms: NormTable): boolean =>
  input.product === 'revolving' && !ruleApplies('tae_assumptions', input.agreedOn, norms);

const INSURANCE_WORLDS: Readonly<Record<InsuranceReading, boolean>> = {
  insurance_counted: true,
  insurance_left_out: false,
};

// Item 1: the APR worked out from the contract's own figures against the one it states. Compared
// to one decimal, shown to two. A linked insurance the person does not know to be required, and a
// balloon whose day they do not know, are worked out both ways; with both unknown, in all four.
export function checkApr(input: CreditInput, norms: NormTable): CreditItem {
  if (revolvingBeforeAssumptions(input, norms))
    return single(
      creditFinding(
        'apr',
        'review_it',
        [creditPhrase('apr.revolving_before_2013')],
        ['tae_formula', 'tae_assumptions'],
        norms,
      ),
    );
  const required = input.insurance?.required;
  const insuranceWorlds: readonly InsuranceReading[] =
    required === null
      ? ['insurance_counted', 'insurance_left_out']
      : [required === false ? 'insurance_left_out' : 'insurance_counted'];
  const balloonWorlds: readonly BalloonReading[] =
    input.balloon !== null && input.balloon.dueOn === null
      ? ['balloon_with_last', 'balloon_month_after']
      : ['balloon_month_after'];
  const [insuranceOnly] = insuranceWorlds;
  const [balloonOnly] = balloonWorlds;
  if (balloonWorlds.length === 1 && balloonOnly !== undefined)
    return assessAcross('insurance_required', insuranceWorlds, (world) =>
      aprReading(input, { insurance: INSURANCE_WORLDS[world], balloon: balloonOnly }, norms),
    );
  if (insuranceWorlds.length === 1 && insuranceOnly !== undefined)
    return assessAcross('balloon_due', balloonWorlds, (balloon) =>
      aprReading(input, { insurance: INSURANCE_WORLDS[insuranceOnly], balloon }, norms),
    );
  const both = insuranceWorlds.flatMap((i) =>
    balloonWorlds.map((b): `${InsuranceReading}.${BalloonReading}` => `${i}.${b}`),
  );
  return assessAcross('insurance_required_and_balloon_due', both, (world) => {
    const [insurance, balloon] = world.split('.') as [InsuranceReading, BalloonReading];
    return aprReading(input, { insurance: INSURANCE_WORLDS[insurance], balloon }, norms);
  });
}
