import { describe, expect, it } from 'vitest';
import { phrase } from '../../src/engine/calculation';

describe('phrase', () => {
  it('carries its variables only when it has some', () => {
    expect(phrase('late_interest.scope')).toStrictEqual({ key: 'late_interest.scope' });
    expect(phrase('severance.cap', { tope: 720 })).toStrictEqual({
      key: 'severance.cap',
      vars: { tope: 720 },
    });
  });
});
