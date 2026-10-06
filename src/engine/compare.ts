import { round2 } from './money';
import type { Item } from './types';

export const TOLERANCE_EUROS = 1;

export type Status =
  | 'below_minimum'
  | 'matches'
  | 'above_minimum'
  | 'deduction_too_high'
  | 'deduction_within_max'
  | 'not_checkable'
  | 'no_employer_figure';

export interface ItemResult {
  readonly item: Item;
  readonly employerFigure: number | null;
  readonly status: Status;
  readonly difference: number | null;
}

export function compareItem(item: Item, employerFigure: number | null): ItemResult {
  const r = (status: Status, difference: number | null = null): ItemResult => ({
    item,
    employerFigure,
    status,
    difference,
  });
  const { range } = item;
  if (range === null) return r('not_checkable');
  if (employerFigure === null) return r('no_employer_figure');
  if (item.direction === 'deduction') {
    const excess = round2(employerFigure - range.max);
    return excess > TOLERANCE_EUROS ? r('deduction_too_high', excess) : r('deduction_within_max');
  }
  const missing = round2(range.min - employerFigure);
  if (missing > TOLERANCE_EUROS) return r('below_minimum', missing);
  if (round2(employerFigure - range.max) > TOLERANCE_EUROS) return r('above_minimum');
  return r('matches');
}
