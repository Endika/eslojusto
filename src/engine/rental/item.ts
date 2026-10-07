import { rentalPhrase, type RentalCalculation } from './calculation';
import { evaluateAcross, type Doubt, type Measure, type Outcome, type World } from './outcome';
import type { NormTable } from './norms';
import { ruleSource, type RentalSource, type RuleId } from './rules';
import type { ItemStatus } from './types';

// One reading of an item other than a rent update.
export interface ItemReading {
  readonly status: ItemStatus;
  // Euros behind a paid_over, owed or over_cap result; null when the result carries no figure.
  readonly amount: number | null;
  readonly calculation: RentalCalculation;
  readonly rules: readonly RuleId[];
}

export const itemReading = (
  status: ItemStatus,
  amount: number | null,
  calculation: RentalCalculation,
  rules: readonly RuleId[],
): ItemReading => ({ status, amount, calculation, rules });

export const notEntered = (rules: readonly RuleId[]): ItemReading =>
  itemReading('not_entered', null, [rentalPhrase('item.not_entered')], rules);

// The results that carry euros into a total.
export const FIGURED_STATUSES: ReadonlySet<ItemStatus> = new Set(['paid_over', 'owed', 'over_cap']);

export const itemAmount = (r: ItemReading): number =>
  FIGURED_STATUSES.has(r.status) ? (r.amount ?? 0) : 0;

const itemMeasure: Measure<ItemReading> = {
  amount: itemAmount,
  same: (a, b) => a.status === b.status && a.amount === b.amount,
};

export const readAcross = (
  doubts: readonly Doubt[],
  fn: (world: World) => ItemReading,
): Outcome<ItemReading> => evaluateAcross(doubts, fn, itemMeasure);

export const single = (value: ItemReading): Outcome<ItemReading> => ({ kind: 'single', value });

export type ItemKind =
  'fee' | 'guarantees' | 'guarantee' | 'advance' | 'charge' | 'deposit_return' | 'deposit_interest';

export interface ItemResult {
  readonly kind: ItemKind;
  // Position in its input list (fees, guarantees, charges); null for an item of its own.
  readonly index: number | null;
  // The calendar year a charge item covers; null otherwise.
  readonly year: number | null;
  readonly outcome: Outcome<ItemReading>;
  readonly sources: readonly RentalSource[];
}

export function itemResult(
  kind: ItemKind,
  where: { readonly index?: number; readonly year?: number },
  outcome: Outcome<ItemReading>,
  norms: NormTable,
): ItemResult {
  const values = outcome.kind === 'single' ? [outcome.value] : outcome.readings.map((r) => r.value);
  const rules = [...new Set(values.flatMap((v) => v.rules))];
  return {
    kind,
    index: where.index ?? null,
    year: where.year ?? null,
    outcome,
    sources: rules.map((id) => ruleSource(id, norms)),
  };
}
