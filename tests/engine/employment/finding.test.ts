import { describe, expect, it } from 'vitest';
import { phrase } from '../../../src/engine/employment/calculation';
import { EMPLOYMENT_NORMS } from '../../../src/engine/employment/data/norms';
import { findingOf } from '../../../src/engine/employment/finding';

describe('findingOf', () => {
  it('defaults to no calculation, no amount and not based on the answer', () => {
    const f = findingOf('trial_limits', 'trial_period', EMPLOYMENT_NORMS, {
      status: 'within_limit',
    });
    expect(f).toMatchObject({
      calculation: [],
      amount: null,
      basedOnYourAnswer: false,
      agreementMaySetOther: false,
      literal: null,
    });
  });

  it('a void clause also cites the partial nullity and says so', () => {
    const f = findingOf('trial_limits', 'trial_period', EMPLOYMENT_NORMS, {
      status: 'clause_void',
      calculation: [phrase('trial.amount_months', { amount: 1 })],
    });
    expect(f.sources.map((s) => s.id)).toEqual(['trial_limits', 'partial_nullity']);
    expect(f.calculation.map((p) => p.key)).toEqual([
      'trial.amount_months',
      'clause.partial_nullity',
    ]);
  });
});
