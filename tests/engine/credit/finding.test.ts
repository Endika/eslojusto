import { describe, expect, it } from 'vitest';
import { CREDIT_NORMS } from '../../../src/engine/credit/data/norms';
import { creditFinding } from '../../../src/engine/credit/finding';

describe('creditFinding', () => {
  it('has no days left for an open status without a deadline', () => {
    expect(creditFinding('withdrawal', 'open', [], [], CREDIT_NORMS)).toMatchObject({
      lastDay: null,
      daysLeft: null,
    });
  });
});
