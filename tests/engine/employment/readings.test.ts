import { describe, expect, it } from 'vitest';
import { assessAcross, offerPass, worldsOf } from '../../../src/engine/employment/readings';
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

describe('assessAcross', () => {
  it('is a single finding when every reading agrees', () => {
    const assessed = assessAcross('small_company', worldsOf('small_company', null), () =>
      finding({ status: 'within_limit' }),
    );
    expect(assessed).toEqual({ kind: 'single', finding: finding({ status: 'within_limit' }) });
  });

  it('labels each reading when they differ', () => {
    // A three-month trial: within the limit for a technician, over it otherwise.
    const assessed = assessAcross('technical', worldsOf('technical', null), (world) =>
      finding({
        status: world === 'technical' ? 'within_limit' : 'over_legal_limit',
        basedOnYourAnswer: true,
      }),
    );
    expect(assessed).toEqual({
      kind: 'readings',
      question: 'technical',
      readings: [
        {
          when: 'technical',
          finding: finding({ status: 'within_limit', basedOnYourAnswer: true }),
        },
        {
          when: 'not_technical',
          finding: finding({ status: 'over_legal_limit', basedOnYourAnswer: true }),
        },
      ],
    });
  });

  it('tells readings apart by any field, amounts included', () => {
    const assessed = assessAcross('complement_kind', worldsOf('complement_kind', null), (world) =>
      finding({
        status: 'below_minimum',
        amount: world === 'complement_fixed' ? { min: 50, max: 50 } : { min: 950, max: 950 },
      }),
    );
    expect(assessed.kind).toBe('readings');
  });

  it('with an answer given there is one world and one finding', () => {
    const assessed = assessAcross('technical', worldsOf('technical', 'technical'), () =>
      finding({ status: 'over_legal_limit' }),
    );
    expect(assessed).toEqual({ kind: 'single', finding: finding({ status: 'over_legal_limit' }) });
  });

  it('needs at least one world', () => {
    expect(() => assessAcross('technical', [], () => finding())).toThrow(RangeError);
  });
});

describe('offerPass', () => {
  it.each<FindingStatus>(['below_minimum', 'over_legal_limit', 'clause_void', 'becomes_permanent'])(
    'opens with a concrete finding: %s',
    (status) => {
      expect(offerPass([single('within_limit'), single(status)])).toBe(true);
    },
  );

  it.each<FindingStatus>([
    'missing_requirement',
    'within_limit',
    'depends_on_agreement',
    'review_it',
    'not_applicable_to_date',
    'not_entered',
    'not_reviewed_in_this_version',
    'not_published',
  ])('does not open with %s alone', (status) => {
    expect(offerPass([single(status)])).toBe(false);
  });

  it('does not open for a limit the agreement may move', () => {
    expect(offerPass([single('over_legal_limit', true)])).toBe(false);
  });

  it('does not open when the only concrete finding holds in one reading only', () => {
    const assessed = assessAcross('technical', worldsOf('technical', null), (world) =>
      finding({ status: world === 'technical' ? 'within_limit' : 'over_legal_limit' }),
    );
    expect(offerPass([assessed, single('review_it')])).toBe(false);
  });

  it('opens when every reading is concrete, even if they differ', () => {
    const assessed = assessAcross('complement_kind', worldsOf('complement_kind', null), (world) =>
      finding({
        status: 'below_minimum',
        amount: world === 'complement_fixed' ? { min: 50, max: 50 } : { min: 950, max: 950 },
      }),
    );
    expect(offerPass([assessed])).toBe(true);
  });

  it('is false with nothing assessed', () => {
    expect(offerPass([])).toBe(false);
  });
});
