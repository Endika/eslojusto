import { addMonthsClamped, compareDates, daysInMonth, ordinal, type CivilDate } from '../date';
import type { CreditInput } from './types';

// The APR equation of annex I LCC: Σ Aₖ (1 + X)^(−tₖ) = 0, with what the consumer receives positive,
// what they pay negative and tₖ in years from the first drawdown.

// Normalised months when every payment is monthly and falls on the same day of the month; days
// otherwise. Annex I, observation c, sets the year (365 days, 366 in a leap year, or twelve
// normalised months) but not how to split a time that is not a whole number of periods; the split
// into whole periods and days is the method of annex II, observation c, of Ley 5/2019, the
// mortgage credit law, taken here as the calculation criterion.
export type TimeBasis = 'normalised_months' | 'days';

export interface CashFlow {
  readonly on: CivilDate;
  readonly years: number;
  readonly amount: number;
}

// A cost the APR counts, which the review takes out one at a time to say how much it adds.
export type Cost =
  { readonly kind: 'charge'; readonly index: number } | { readonly kind: 'insurance' };

export interface AprFlows {
  readonly basis: TimeBasis;
  readonly flows: readonly CashFlow[];
  // What reached the consumer, and everything they pay back or pay apart.
  readonly received: number;
  readonly totalPayable: number;
}

// Where a balloon whose day the person does not know falls: with the last instalment or a month
// after it.
export type BalloonReading = 'balloon_with_last' | 'balloon_month_after';

export interface FlowOptions {
  // Whether the linked insurance counts as a cost of the credit.
  readonly insurance: boolean;
  readonly leaveOut: Cost | null;
  // Read only when the balloon has no day.
  readonly balloon: BalloonReading;
}

const MONTHS_A_YEAR = 12;

const isMonthEnd = (date: CivilDate): boolean => date.d === daysInMonth(date.y, date.m);

// The due day `k` months after `first`, date to date.
export const monthlyDue = (first: CivilDate, k: number): CivilDate => addMonthsClamped(first, k);

// Whether `on` falls `k` months after `first`: date to date, or on the last day of each month when
// the first falls on the last day of its month.
const followsMonthly = (first: CivilDate, k: number, on: CivilDate): boolean => {
  const due = monthlyDue(first, k);
  if (compareDates(on, due) === 0) return true;
  return isMonthEnd(first) && on.y === due.y && on.m === due.m && isMonthEnd(on);
};

// Days of the whole year counted back from `end` to the same day of the year before: 366 when
// that year holds a 29 February.
const yearLength = (end: CivilDate): number =>
  ordinal(end) - ordinal(addMonthsClamped(end, -MONTHS_A_YEAR));

// Years from `from` to `to`: the whole periods of `periodMonths` counted back from `to`, then the
// days left back to `from`, the first day left out and the last one counted, over the days of the
// year counted back from the last day (Ley 5/2019, annex II, observation c, ii and iii).
export function yearsBetween(from: CivilDate, to: CivilDate, periodMonths: number): number {
  if (compareDates(to, from) < 0) return -yearsBetween(to, from, periodMonths);
  let periods = Math.floor(((to.y - from.y) * MONTHS_A_YEAR + (to.m - from.m)) / periodMonths) + 1;
  while (periods > 0 && compareDates(addMonthsClamped(to, -periods * periodMonths), from) < 0)
    periods--;
  // Date to date forwards, a month with no equivalent day ends on its last one: 31-01 to 29-02
  // is a whole month.
  const next = (periods + 1) * periodMonths;
  if (compareDates(addMonthsClamped(from, next), to) === 0) return next / MONTHS_A_YEAR;
  const stubEnd = addMonthsClamped(to, -periods * periodMonths);
  const days = ordinal(stubEnd) - ordinal(from);
  return (periods * periodMonths) / MONTHS_A_YEAR + (days === 0 ? 0 : days / yearLength(stubEnd));
}

const periodMonthsOf = (basis: TimeBasis): number =>
  basis === 'normalised_months' ? 1 : MONTHS_A_YEAR;

interface Due {
  readonly on: CivilDate;
  readonly amount: number;
}

// The month `on` falls on counted from `first`, or null when it is off that monthly grid.
function monthIndex(first: CivilDate, on: CivilDate): number | null {
  const k = (on.y - first.y) * MONTHS_A_YEAR + (on.m - first.m);
  return k >= 0 && followsMonthly(first, k, on) ? k : null;
}

// The day of the balloon: the contract's, or the one the reading takes.
export function balloonDue(
  lastInstalment: CivilDate,
  dueOn: CivilDate | null,
  reading: BalloonReading,
): CivilDate {
  if (dueOn !== null) return dueOn;
  return reading === 'balloon_with_last' ? lastInstalment : monthlyDue(lastInstalment, 1);
}

interface Plan {
  readonly basis: TimeBasis;
  // Each payment with its month from the first one, null when the plan is read in days.
  readonly dues: readonly (Due & { readonly month: number | null })[];
}

// The instalments in date order, then the balloon. A plan whose payments all follow month by
// month from the first one is read in normalised months, and in days otherwise.
function dues(input: CreditInput, reading: BalloonReading): Plan {
  const plan = input.instalments;
  const instalments: readonly Due[] =
    plan === null
      ? []
      : plan.kind === 'regular'
        ? Array.from({ length: plan.count }, (_, k) => ({
            on: monthlyDue(plan.firstDueOn, k),
            amount: plan.amount,
          }))
        : [...plan.rows]
            .sort((a, b) => compareDates(a.dueOn, b.dueOn))
            .map((r) => ({ on: r.dueOn, amount: r.amount }));
  const first = instalments[0];
  const last = instalments.at(-1);
  if (first === undefined || last === undefined) return { basis: 'normalised_months', dues: [] };
  const all =
    input.balloon === null
      ? instalments
      : [
          ...instalments,
          { on: balloonDue(last.on, input.balloon.dueOn, reading), amount: input.balloon.amount },
        ];
  const months = all.map((d) => monthIndex(first.on, d.on));
  const monthly = months.every((k, i) => k !== null && (i >= instalments.length || k === i));
  return {
    basis: monthly ? 'normalised_months' : 'days',
    dues: all.map((d, i) => ({ ...d, month: monthly ? (months[i] ?? null) : null })),
  };
}

const sameCost = (a: Cost | null, b: Cost): boolean =>
  a !== null &&
  a.kind === b.kind &&
  (a.kind === 'insurance' || (b.kind === 'charge' && a.index === b.index));

// Annex I, part II: an open-end credit is taken as drawn in full, for one year, the capital repaid
// in 12 equal monthly instalments from a month after the drawdown with interest on what is left.
// Charges and the annual fee are paid at the drawdown.
const REVOLVING_INSTALMENTS = 12;
const PERCENT_A_MONTH = 1_200;

function revolvingFlows(input: CreditInput, options: FlowOptions): AprFlows {
  const start = input.drawnOn;
  const limit = input.card?.limit ?? input.principal;
  const monthly = (input.card?.nominalRate ?? input.nominalRate) / PERCENT_A_MONTH;
  const flows: CashFlow[] = [{ on: start, years: 0, amount: limit }];
  const upfront = [
    input.card?.annualFee ?? 0,
    ...input.charges.map((c, index) =>
      sameCost(options.leaveOut, { kind: 'charge', index }) ? 0 : c.amount,
    ),
  ].reduce((a, b) => a + b, 0);
  const insurance = counted(input, options);
  const singlePremium = insurance?.single === true ? insurance.premium : 0;
  if (upfront + singlePremium > 0)
    flows.push({ on: start, years: 0, amount: -(upfront + singlePremium) });
  const capital = limit / REVOLVING_INSTALMENTS;
  for (let k = 1; k <= REVOLVING_INSTALMENTS; k++) {
    const left = limit - capital * (k - 1);
    const periodic = insurance !== null && !insurance.single ? insurance.premium : 0;
    flows.push({
      on: addMonthsClamped(start, k),
      years: k / MONTHS_A_YEAR,
      amount: -(capital + left * monthly + periodic),
    });
  }
  return withTotals('normalised_months', flows);
}

const counted = (input: CreditInput, options: FlowOptions) =>
  input.insurance !== null &&
  options.insurance &&
  !sameCost(options.leaveOut, { kind: 'insurance' })
    ? input.insurance
    : null;

function withTotals(basis: TimeBasis, flows: readonly CashFlow[]): AprFlows {
  let received = 0;
  let totalPayable = 0;
  for (const f of flows)
    if (f.amount > 0) received += f.amount;
    else totalPayable -= f.amount;
  return { basis, flows, received, totalPayable };
}

// The contract's cash flows as annex I counts them, or null when there are no instalments to
// count. A cost left out, deducted or financed, counts as money the consumer received.
export function aprFlows(input: CreditInput, options: FlowOptions): AprFlows | null {
  if (input.product === 'revolving') return revolvingFlows(input, options);
  const plan = dues(input, options.balloon);
  const first = plan.dues[0];
  if (first === undefined) return null;
  const start = input.drawnOn;
  const period = periodMonthsOf(plan.basis);
  const at = (on: CivilDate) => yearsBetween(start, on, period);
  // In normalised months the payments after the first are whole months apart.
  const firstYears = at(first.on);
  const dueYears = (month: number | null, on: CivilDate) =>
    month === null ? at(on) : firstYears + month / MONTHS_A_YEAR;

  let received =
    input.netDisbursed ??
    input.principal -
      input.charges.filter((c) => c.how === 'deducted').reduce((sum, c) => sum + c.amount, 0);
  const flows: CashFlow[] = [];
  input.charges.forEach((charge, index) => {
    const left = sameCost(options.leaveOut, { kind: 'charge', index });
    if (charge.how === 'paid') {
      if (!left)
        flows.push({ on: charge.paidOn, years: at(charge.paidOn), amount: -charge.amount });
    } else if (left) received += charge.amount;
  });

  const insurance = input.insurance;
  const countedInsurance = counted(input, options);
  if (insurance !== null && insurance.single && insurance.financed && countedInsurance === null)
    received += insurance.premium;
  if (countedInsurance?.single === true && !countedInsurance.financed)
    flows.push({ on: start, years: 0, amount: -countedInsurance.premium });
  const periodic =
    countedInsurance !== null && !countedInsurance.single ? countedInsurance.premium : 0;

  plan.dues.forEach((due, i) => {
    const isBalloon = input.balloon !== null && i === plan.dues.length - 1;
    flows.push({
      on: due.on,
      years: dueYears(due.month, due.on),
      amount: -(due.amount + (isBalloon ? 0 : periodic)),
    });
  });
  flows.unshift({ on: start, years: 0, amount: received });
  return withTotals(plan.basis, flows);
}

export type AprSolution =
  { readonly kind: 'solved'; readonly rate: number } | { readonly kind: 'unsolvable' };

// The search runs over this interval of the yearly rate, as a fraction, first on a grid to count
// the changes of sign.
const LOWEST = -0.99;
const HIGHEST = 10;
const GRID = 1_000;
const TOLERANCE = 1e-12;
const MAX_STEPS = 200;

const presentValue = (flows: readonly CashFlow[], x: number): number =>
  flows.reduce((sum, f) => sum + f.amount * (1 + x) ** -f.years, 0);

const slope = (flows: readonly CashFlow[], x: number): number =>
  flows.reduce((sum, f) => sum - f.years * f.amount * (1 + x) ** (-f.years - 1), 0);

// The interval around the one change of sign of the equation, or null when it changes sign more
// than once or never.
function bracketOf(flows: readonly CashFlow[]): readonly [number, number] | null {
  let found: readonly [number, number] | null = null;
  let changes = 0;
  let last: { readonly x: number; readonly sign: number } | null = null;
  for (let k = 0; k <= GRID; k++) {
    const x = LOWEST + ((HIGHEST - LOWEST) * k) / GRID;
    const sign = Math.sign(presentValue(flows, x));
    if (sign === 0) continue;
    if (last !== null && sign !== last.sign) {
      changes++;
      found = [last.x, x];
    }
    last = { x, sign };
  }
  return changes === 1 ? found : null;
}

// The root of the annex I equation as a yearly fraction (0.1661 for 16,61 %): Newton's method kept
// inside the bracket by bisection. Without exactly one change of sign there is no single rate, and
// no figure is given.
export function solveApr(flows: readonly CashFlow[]): AprSolution {
  const bracket = bracketOf(flows);
  if (bracket === null) return { kind: 'unsolvable' };
  let [lo, hi] = bracket;
  const rising = presentValue(flows, hi) > 0;
  let x = (lo + hi) / 2;
  for (let step = 0; step < MAX_STEPS; step++) {
    const value = presentValue(flows, x);
    if (value === 0) break;
    if (value > 0 === rising) hi = x;
    else lo = x;
    const d = slope(flows, x);
    const newton = d === 0 ? Number.NaN : x - value / d;
    const next = newton > lo && newton < hi ? newton : (lo + hi) / 2;
    const done = Math.abs(next - x) < TOLERANCE;
    x = next;
    if (done) break;
  }
  return { kind: 'solved', rate: x };
}
