import { describe, expect, it } from 'vitest';
import { assessAcross } from '../../../src/engine/law/readings';

type World = 'low' | 'high';

describe('assessAcross', () => {
  it('is one finding when every world agrees', () => {
    expect(
      assessAcross('q', ['low', 'high'] as const, () => ({ amount: { min: 1, max: 1 } })),
    ).toEqual({
      kind: 'single',
      finding: { amount: { min: 1, max: 1 } },
    });
  });

  it('keeps each world’s finding when they differ, nested data included', () => {
    const worlds: readonly World[] = ['low', 'high'];
    const result = assessAcross('q', worlds, (w) => ({
      amount: { min: 0, max: w === 'low' ? 1 : 2 },
      list: [w],
    }));
    expect(result).toEqual({
      kind: 'readings',
      question: 'q',
      readings: [
        { when: 'low', finding: { amount: { min: 0, max: 1 }, list: ['low'] } },
        { when: 'high', finding: { amount: { min: 0, max: 2 }, list: ['high'] } },
      ],
    });
  });

  it('compares arrays and objects, not their identity', () => {
    const result = assessAcross('q', ['low', 'high'] as const, () => ({ list: [1, { a: 2 }] }));
    expect(result.kind).toBe('single');
  });

  it('refuses to assess no world', () => {
    expect(() => assessAcross('q', [], () => 1)).toThrow(RangeError);
  });

  it.each<[string, unknown, unknown]>([
    ['numbers', 1, 2],
    ['a number and an object', 1, {}],
    ['an object and a number', {}, 1],
    ['null and an object', null, {}],
    ['an object and null', {}, null],
    ['an array and an object', [], {}],
    ['an object and an array', {}, []],
    ['objects of different size', { a: 1, b: 2 }, { a: 1 }],
    ['objects of different keys', { a: undefined }, { b: undefined }],
  ])('tells %s apart', (_, low, high) => {
    const result = assessAcross('q', ['low', 'high'] as const, (w) => (w === 'low' ? low : high));
    expect(result.kind).toBe('readings');
  });

  it('is not single when only the last world differs', () => {
    const result = assessAcross('q', ['a', 'b', 'c'], (w) => (w === 'c' ? 2 : 1));
    expect(result.kind).toBe('readings');
  });
});
