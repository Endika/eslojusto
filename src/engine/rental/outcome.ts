// Why a result can come out more than one way. The engine never picks a reading: it works out
// every one and says which doubts move the result.
export type DoubtReason =
  // Rests on a norm still pending validation by the Congress (RDL 28 and 29/2026).
  | 'pending_validation'
  // Falls inside the window of a norm later repealed, widened to its uncertain end.
  | 'repealed_window'
  // «No lo sé» on whether the landlord is a large landlord (gran tenedor).
  | 'large_landlord_unknown'
  // The reference figure came out that same day, or a CPI flash estimate was already out.
  | 'index_month_doubtful'
  // «No lo sé» on whether the update was agreed in writing.
  | 'agreement_unknown'
  // Notice by email or messaging: whether it counts as written (LAU art. 18.2) is not settled.
  | 'notice_form_doubtful'
  // No norm says whether the legal interest year has 365 (366) or 360 days.
  | 'interest_day_count';

const REASON_ORDER: readonly DoubtReason[] = [
  'pending_validation',
  'repealed_window',
  'large_landlord_unknown',
  'index_month_doubtful',
  'agreement_unknown',
  'notice_form_doubtful',
  'interest_day_count',
];

export interface Doubt {
  readonly id: string;
  readonly reason: DoubtReason;
}

// The side each open doubt takes in one reading: true when the doubtful norm, answer or later
// figure holds.
export type World = Readonly<Record<string, boolean>>;

export interface Reading<T> {
  readonly value: T;
  readonly worlds: readonly World[];
}

export type Outcome<T> =
  | { readonly kind: 'single'; readonly value: T }
  | {
      readonly kind: 'depends';
      readonly reasons: readonly DoubtReason[];
      readonly low: T;
      readonly high: T;
      // Every distinct result, with the readings that give it.
      readonly readings: readonly Reading<T>[];
    };

export interface Measure<T> {
  // Euros the result would add to the total; never negative.
  readonly amount: (value: T) => number;
  readonly same: (a: T, b: T) => boolean;
}

// Each open doubt doubles the readings; inputs are validated so a review opens far fewer.
const MAX_DOUBTS = 20;

export const uniqueById = (doubts: readonly Doubt[]): readonly Doubt[] =>
  doubts.filter((d, i) => doubts.findIndex((o) => o.id === d.id) === i);

export function worldsFor(doubts: readonly Doubt[]): readonly World[] {
  const open = uniqueById(doubts);
  if (open.length > MAX_DOUBTS) throw new RangeError(`Too many open doubts: ${open.length}`);
  let worlds: World[] = [{}];
  for (const d of open)
    worlds = worlds.flatMap((w) => [
      { ...w, [d.id]: false },
      { ...w, [d.id]: true },
    ]);
  return worlds;
}

export const worldKey = (doubts: readonly Doubt[], w: World): string =>
  doubts.map((d) => (w[d.id] === true ? '1' : '0')).join('');

// Groups results by the measure into readings: one reading is a single outcome; more give the
// lowest and highest and the reasons that move them.
export function outcomeFrom<T>(
  results: readonly { readonly world: World; readonly value: T }[],
  reasons: ReadonlySet<DoubtReason>,
  measure: Measure<T>,
): Outcome<T> {
  const first = results[0];
  if (first === undefined) throw new RangeError('No readings');
  const readings: { value: T; worlds: World[] }[] = [];
  for (const { world, value } of results) {
    const found = readings.find((r) => measure.same(r.value, value));
    if (found) found.worlds.push(world);
    else readings.push({ value, worlds: [world] });
  }
  if (readings.length === 1) return { kind: 'single', value: first.value };
  let low = first.value;
  let high = first.value;
  for (const { value } of readings) {
    if (measure.amount(value) < measure.amount(low)) low = value;
    if (measure.amount(value) > measure.amount(high)) high = value;
  }
  return {
    kind: 'depends',
    reasons: REASON_ORDER.filter((r) => reasons.has(r)),
    low,
    high,
    readings,
  };
}

// Gathers results worked out in every world of `doubts`. A doubt is a reason only when flipping
// it alone changes the result in some reading.
export function outcomeOf<T>(
  doubts: readonly Doubt[],
  results: readonly { readonly world: World; readonly value: T }[],
  measure: Measure<T>,
): Outcome<T> {
  const open = uniqueById(doubts);
  const byWorld = new Map(results.map((r) => [worldKey(open, r.world), r.value]));
  const moving = new Set<DoubtReason>();
  for (const d of open) {
    for (const { world, value } of results) {
      if (world[d.id] === true) continue;
      const flipped = byWorld.get(worldKey(open, { ...world, [d.id]: true }));
      if (flipped !== undefined && !measure.same(value, flipped)) moving.add(d.reason);
    }
  }
  return outcomeFrom(results, moving, measure);
}

export function evaluateAcross<T>(
  doubts: readonly Doubt[],
  fn: (world: World) => T,
  measure: Measure<T>,
): Outcome<T> {
  return outcomeOf(
    doubts,
    worldsFor(doubts).map((world) => ({ world, value: fn(world) })),
    measure,
  );
}

// The total counts only what holds in every reading. A result inside a repealed norm's window
// adds nothing: both readings are shown and neither is summed.
export function countedAmount<T>(outcome: Outcome<T>, amount: (value: T) => number): number {
  if (outcome.kind === 'single') return amount(outcome.value);
  if (outcome.reasons.includes('repealed_window')) return 0;
  return Math.min(amount(outcome.low), ...outcome.readings.map((r) => amount(r.value)));
}

// The most any reading gives, a repealed window included: the «y hasta» of a result.
export function highestAmount<T>(outcome: Outcome<T>, amount: (value: T) => number): number {
  if (outcome.kind === 'single') return amount(outcome.value);
  return Math.max(amount(outcome.high), ...outcome.readings.map((r) => amount(r.value)));
}

// A letter asks only for what holds in every reading, and never for a repealed window.
export function letterAmount<T>(outcome: Outcome<T>, amount: (value: T) => number): number | null {
  const counted = countedAmount(outcome, amount);
  return counted > 0 ? counted : null;
}
