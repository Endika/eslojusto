import { describe, expect, it } from 'vitest';
import { offerPass, worldsOf } from '../../../src/engine/employment/readings';
import type { Assessed, FindingStatus } from '../../../src/engine/employment/types';
import { finding } from './input';

const single = (status: FindingStatus, agreementMaySetOther = false): Assessed => ({
  kind: 'single',
  finding: finding({ status, agreementMaySetOther }),
});

describe('worldsOf', () => {
  it('keeps the answer given, or every reading for «No lo sé»', () => {
    expect(worldsOf('technical', 'not_technical')).toEqual(['not_technical']);
    expect(worldsOf('technical', null)).toEqual(['technical', 'not_technical']);
    expect(worldsOf('chaining_cutoff', null)).toEqual(['cutoff_2021_12_31', 'cutoff_2022_03_30']);
  });
});

describe('offerPass', () => {
  it.each<FindingStatus>(['over_legal_limit', 'clause_void'])(
    'opens with a concrete finding: %s',
    (status) => {
      expect(offerPass([single('within_limit'), single(status)])).toBe(true);
    },
  );

  it.each<FindingStatus>(['within_limit'])('does not open with %s alone', (status) => {
    expect(offerPass([single(status)])).toBe(false);
  });

  it('does not open for a limit the agreement may move', () => {
    expect(offerPass([single('over_legal_limit', true)])).toBe(false);
  });
});
