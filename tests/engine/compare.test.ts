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
    [1000, 1100, 900, 'below_minimum', 100],
    [1000, 1100, 999.5, 'matches', null], // rounding, inside the 1 € tolerance
    [1000, 1100, 1050, 'matches', null],
    [1000, 1100, 1101, 'matches', null],
    [1000, 1100, 1200, 'above_minimum', null],
    [1000.01, 1100, 999.01, 'matches', null],
    [1000.01, 1100, 999, 'below_minimum', 1.01],
    [1000, 1100.2, 1101.2, 'matches', null],
  ])('[%f, %f] with %f → %s', (min, max, figure, status, diff) => {
    const r = compareItem(credit(min, max), figure);
    expect(r.status).toBe(status);
    if (diff !== null) expect(r.difference).toBe(diff);
  });
  it('no range → not checkable even with a figure', () => {
    expect(compareItem({ ...credit(0, 0), range: null }, 500).status).toBe('not_checkable');
  });
  it('no figure → no_employer_figure', () => {
    expect(compareItem(credit(1, 2), null).status).toBe('no_employer_figure');
  });
  it('deduction above the allowed maximum', () => {
    const d: Item = { ...credit(0, 500), id: 'notice_deduction', direction: 'deduction' };
    expect(compareItem(d, 700)).toMatchObject({ status: 'deduction_too_high', difference: 200 });
    expect(compareItem(d, 400).status).toBe('deduction_within_max');
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
