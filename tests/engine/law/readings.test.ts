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
});
