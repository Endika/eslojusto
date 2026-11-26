import { expect, it } from 'vitest';
import { INSURANCE_NORMS } from '../../../src/engine/insurance/data/norms';
import { finding } from '../../../src/engine/insurance/deadline';

it('a finding with no deadline has no days left, whatever its status', () => {
  expect(finding('premium', 'open', [], [], INSURANCE_NORMS).daysLeft).toBeNull();
});
