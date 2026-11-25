import { describe, expect, it } from 'vitest';
import { between, exact, round2 } from '../../src/engine/money';

describe('round2', () => {
  it('rounds an exact half cent away from zero, which binary floats used to hide', () => {
    expect([8.325, 2.135, 1.005, 4.145, -1.005, 1.234, 1.236].map(round2)).toEqual([
      8.33, 2.14, 1.01, 4.15, -1.01, 1.23, 1.24,
    ]);
  });
});

describe('ranges', () => {
  it('are rounded, and ordered whichever end comes first', () => {
    expect(exact(2.135)).toEqual({ min: 2.14, max: 2.14 });
    expect(between(9.999, 1.005)).toEqual({ min: 1.01, max: 10 });
  });
});
