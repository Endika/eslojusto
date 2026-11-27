import { describe, expect, it } from 'vitest';
import { notEntered } from '../../../src/engine/rental/item';

describe('item readings', () => {
  it('say an item was not entered, with the rules behind it', () => {
    expect(notEntered(['guarantee_cap'])).toStrictEqual({
      status: 'not_entered',
      amount: null,
      calculation: [{ key: 'item.not_entered' }],
      rules: ['guarantee_cap'],
    });
  });
});
