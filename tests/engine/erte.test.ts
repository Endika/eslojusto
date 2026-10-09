import { describe, expect, it } from 'vitest';
import {
  MAX_REDUCTION_PERCENT,
  MIN_REDUCTION_PERCENT,
  RED_MONTHLY_CAP,
  consumption,
  erteInputError,
  estimateErte,
  type ErteInput,
  type ErteMeasure,
  type ErteRegime,
} from '../../src/engine/erte';
import { BENEFIT_2026 } from '../../src/engine/unemployment';

const suspension: ErteMeasure = { kind: 'suspension' };
const reduction = (percent: number): ErteMeasure => ({ kind: 'reduction', percent });
const input = (over: Partial<ErteInput> = {}): ErteInput => ({
  regime: 'etop',
  measure: suspension,
  base: 1000,
  children: 0,
  ...over,
});
const exactly = (n: number) => ({ min: n, max: n });

describe('type of unemployment', () => {
  it('a suspension is total unemployment, a reduction partial', () => {
    expect(estimateErte(input()).unemployment).toBe('total');
    expect(estimateErte(input({ measure: reduction(40) })).unemployment).toBe('partial');
  });
});

describe('percentages over time', () => {
  it('ETOP pays 70 % for the first 180 days and 60 % after', () => {
    const e = estimateErte(input({ base: 1500 }));
    expect(e.firstStretch).toEqual(exactly(1050));
    expect(e.secondStretch).toEqual(exactly(900));
  });
  it.each<ErteRegime>(['force_majeure', 'red'])('%s pays 70 % throughout', (regime) => {
    const e = estimateErte(input({ regime, base: 1500 }));
    expect(e.firstStretch).toEqual(exactly(1050));
    expect(e.secondStretch).toBeNull();
  });
  it('truncates to cents like the rest of the benefit', () => {
    expect(estimateErte(input({ base: 1234.56 })).firstStretch).toEqual(exactly(864.19));
  });
});

describe('caps by children (art. 270.3)', () => {
  it('uses the maximum for the children asked', () => {
    const base = 3000;
    const at = (children: 0 | 1 | 2) => estimateErte(input({ base, children })).firstStretch;
    expect(at(0)).toEqual(exactly(BENEFIT_2026.maxCap[0]));
    expect(at(1)).toEqual(exactly(BENEFIT_2026.maxCap[1]));
    expect(at(2)).toEqual(exactly(BENEFIT_2026.maxCap[2]));
  });
  it('raises a low amount to the minimum', () => {
    expect(estimateErte(input({ base: 500, children: 0 })).firstStretch).toEqual(exactly(560));
    expect(estimateErte(input({ base: 500, children: 2 })).firstStretch).toEqual(exactly(749));
  });
  it('a force majeure ERTE is capped the same way', () => {
    const e = estimateErte(input({ regime: 'force_majeure', base: 3000, children: 1 }));
    expect(e.firstStretch).toEqual(exactly(BENEFIT_2026.maxCap[1]));
  });
  it('without an answer on children it spans the three', () => {
    expect(estimateErte(input({ base: 3000, children: null })).firstStretch).toEqual({
      min: 1225,
      max: 1575,
    });
  });
});

describe('RED cap', () => {
  it('is 225 % of the IPREM plus one sixth', () => {
    expect(RED_MONTHLY_CAP).toBe(1575);
  });
  it('caps the benefit', () => {
    expect(estimateErte(input({ regime: 'red', base: 3000 })).firstStretch).toEqual(exactly(1575));
  });
  it('has no minimum of its own', () => {
    expect(estimateErte(input({ regime: 'red', base: 500 })).firstStretch).toEqual(exactly(350));
  });
  it('ignores the children', () => {
    const a = estimateErte(input({ regime: 'red', base: 3000, children: 0 }));
    const b = estimateErte(input({ regime: 'red', base: 3000, children: null }));
    expect(a.firstStretch).toEqual(b.firstStretch);
  });
});

describe('reduction of working time (art. 270.5)', () => {
  it('is proportional to the reduction', () => {
    const e = estimateErte(input({ base: 1500, measure: reduction(40) }));
    expect(e.firstStretch).toEqual(exactly(420));
    expect(e.secondStretch).toEqual(exactly(360));
  });
  it('the whole range of reductions stays below the suspension amount', () => {
    const full = estimateErte(input({ base: 1500 })).firstStretch.max;
    for (const p of [10, 40, 70])
      expect(
        estimateErte(input({ base: 1500, measure: reduction(p) })).firstStretch.max,
      ).toBeLessThan(full);
  });
  it('applies the minimum to the full-time benefit before the proportion', () => {
    const e = estimateErte(input({ base: 500, children: 0, measure: reduction(50) }));
    expect(e.firstStretch).toEqual(exactly(280));
  });
  it('applies the RED cap to the full-time benefit before the proportion', () => {
    const e = estimateErte(input({ regime: 'red', base: 3000, measure: reduction(50) }));
    expect(e.firstStretch).toEqual(exactly(787.5));
  });
  it('applies the general maximum the same way', () => {
    const e = estimateErte(input({ base: 3000, children: 0, measure: reduction(20) }));
    expect(e.firstStretch).toEqual(exactly(245));
  });
});

describe('consumption of entitlement', () => {
  it('ETOP with a suspension uses a whole day per day', () => {
    expect(consumption(input())).toEqual({ consumes: true, share: 1 });
  });
  it('ETOP with a reduction is consumed by hours, at the reduction percentage', () => {
    expect(consumption(input({ measure: reduction(40) }))).toEqual({ consumes: true, share: 0.4 });
  });
  it.each<ErteRegime>(['force_majeure', 'red'])('%s consumes nothing', (regime) => {
    for (const measure of [suspension, reduction(40)])
      expect(consumption({ regime, measure })).toEqual({ consumes: false, share: 0 });
  });
  it('is part of the estimate', () => {
    expect(estimateErte(input({ regime: 'red' })).consumption.consumes).toBe(false);
  });
});

describe('contribution requirement and registration', () => {
  it('ETOP needs 360 days, force majeure and RED waive them', () => {
    expect(estimateErte(input()).contribution).toEqual({ kind: 'minimum', days: 360 });
    expect(estimateErte(input({ regime: 'force_majeure' })).contribution).toEqual({
      kind: 'waived',
    });
    expect(estimateErte(input({ regime: 'red' })).contribution).toEqual({ kind: 'waived' });
  });
  it('only RED asks to be registered as a job seeker', () => {
    expect(estimateErte(input({ regime: 'red' })).jobSeekerRegistration).toBe(true);
    expect(estimateErte(input()).jobSeekerRegistration).toBe(false);
    expect(estimateErte(input({ regime: 'force_majeure' })).jobSeekerRegistration).toBe(false);
  });
});

describe('invalid input', () => {
  it.each([0, -5, NaN, Infinity, 2_000_000])('rejects the base %s', (base) => {
    expect(erteInputError(input({ base }))).toBe('base');
    expect(() => estimateErte(input({ base }))).toThrow(RangeError);
  });
  it.each([0, 5, 9, 9.99, 71, 100, -3, NaN, Infinity])('rejects the reduction %s', (percent) => {
    expect(erteInputError(input({ measure: reduction(percent) }))).toBe('percent');
    expect(() => estimateErte(input({ measure: reduction(percent) }))).toThrow(RangeError);
  });
  it.each([10, 10.5, 40, 70])('accepts the reduction %s', (percent) => {
    expect(erteInputError(input({ measure: reduction(percent) }))).toBeNull();
  });
  it('keeps the bounds of arts. 262.3 LGSS and 47.7.a ET', () => {
    expect([MIN_REDUCTION_PERCENT, MAX_REDUCTION_PERCENT]).toEqual([10, 70]);
  });
  it('accepts a valid input', () => {
    expect(erteInputError(input({ measure: reduction(40) }))).toBeNull();
  });
});
