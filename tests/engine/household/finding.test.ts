import { describe, expect, it } from 'vitest';
import { phrase } from '../../../src/engine/household/calculation';

describe('phrase', () => {
  it('carries no vars key when it has none', () => {
    expect(phrase('notice.days')).toStrictEqual({ key: 'notice.days' });
  });
});
