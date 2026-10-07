import { describe, expect, it } from 'vitest';
import { parseDate as f } from '../../../src/engine/date';
import { NORMS } from '../../../src/engine/rental/data/norms';
import { scope } from '../../../src/engine/rental/scope';
import type { ContractType } from '../../../src/engine/rental/types';
import { contract } from './fixtures';

describe('scope gate', () => {
  it.each([
    ['2019-03-05', { inScope: false, reason: 'before_2019' }],
    ['2019-03-06', { inScope: true }],
    ['2026-10-08', { inScope: true }],
  ])('a main home signed on %s', (day, expected) => {
    expect(scope(contract({ signedOn: f(day) }), NORMS)).toEqual(expected);
  });

  it.each<ContractType>(['seasonal', 'room', 'other_use', 'protected', 'old_rent'])(
    'stops a %s contract with its own reason, whatever its date',
    (contractType) => {
      expect(scope(contract({ contractType }), NORMS)).toEqual({
        inScope: false,
        reason: contractType,
      });
      expect(scope(contract({ contractType, signedOn: f('2010-01-01') }), NORMS)).toEqual({
        inScope: false,
        reason: contractType,
      });
    },
  );

  it('reads the start of RDL 7/2019 from the norm table it is given', () => {
    const later = { ...NORMS, rdl7_2019: { ...NORMS.rdl7_2019, inForceSince: '2019-04-01' } };
    expect(scope(contract({ signedOn: f('2019-03-20') }), later)).toEqual({
      inScope: false,
      reason: 'before_2019',
    });
  });
});
