import { describe, expect, it } from 'vitest';
import { compareItem } from '../../src/engine/compare';
import type { Item } from '../../src/engine/types';

const credit = (min: number, max: number): Item => ({
  id: 'holiday_pay',
  direction: 'credit',
  range: { min, max },
  calculation: [],
  dependsOnAgreement: false,
  basedOnYourAnswer: false,
  sources: [],
});

describe('compareItem', () => {
  it.each([
    // rounding, inside the 1 € tolerance

    [1000, 1100, 1101, 'matches', null],

    [1000.01, 1100, 999.01, 'matches', null],
  ])('[%f, %f] with %f → %s', (min, max, figure, status, diff) => {
    const r = compareItem(credit(min, max), figure);
    expect(r.status).toBe(status);
    if (diff !== null) expect(r.difference).toBe(diff);
  });
  it('deduction: the 1 € tolerance applies to the rounded gap', () => {
    const d: Item = { ...credit(0, 500.1), id: 'notice_deduction', direction: 'deduction' };
    expect(compareItem(d, 501.1).status).toBe('deduction_within_max');
    expect(compareItem(d, 501.11)).toMatchObject({
      status: 'deduction_too_high',
      difference: 1.01,
    });
  });
});
