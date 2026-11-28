import { describe, expect, it } from 'vitest';
import {
  consumption,
  belowFullTimeMinimum,
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
  it.each<ErteRegime>(['red'])('%s consumes nothing', (regime) => {
    for (const measure of [suspension, reduction(40)])
      expect(consumption({ regime, measure })).toEqual({ consumes: false, share: 0 });
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
});

describe('invalid input', () => {
  it.each([0, 2_000_000])('rejects the base %s', (base) => {
    expect(erteInputError(input({ base }))).toBe('base');
    expect(() => estimateErte(input({ base }))).toThrow(RangeError);
  });
  it.each([9])('rejects the reduction %s', (percent) => {
    expect(erteInputError(input({ measure: reduction(percent) }))).toBe('percent');
    expect(() => estimateErte(input({ measure: reduction(percent) }))).toThrow(RangeError);
  });
  it('accepts the largest base', () => {
    expect(erteInputError(input({ base: 1_000_000 }))).toBeNull();
  });
});

describe('belowFullTimeMinimum', () => {
  const min = BENEFIT_2026.minBaseAtep;
  it.each<ErteRegime>(['etop'])('%s: true only under the minimum base', (regime) => {
    expect(belowFullTimeMinimum(input({ regime, base: min - 0.01 }))).toBe(true);
    expect(belowFullTimeMinimum(input({ regime, base: min }))).toBe(false);
    expect(belowFullTimeMinimum(input({ regime, base: min + 0.01 }))).toBe(false);
  });
});
