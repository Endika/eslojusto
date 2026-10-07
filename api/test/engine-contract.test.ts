import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  Cause,
  ContributionPeriod,
  FinalPayInput,
  FixedTermType,
  ItemId,
} from '../../src/engine/types';
import { CAUSES, FIXED_TERM_TYPES, ITEM_IDS, SCHEMAS } from '../src/domain/extraction-schema';

// The site prefills its form from these names; type:check fails if the engine drifts.
describe('engine contract', () => {
  it('mirrors the engine unions', () => {
    expectTypeOf<(typeof CAUSES)[number]>().toEqualTypeOf<Cause>();
    expectTypeOf<(typeof FIXED_TERM_TYPES)[number]>().toEqualTypeOf<FixedTermType>();
    expectTypeOf<(typeof ITEM_IDS)[number]>().toEqualTypeOf<ItemId>();
  });

  it('names settlement fields after FinalPayInput keys or item ids', () => {
    const inputKeys: readonly (keyof FinalPayInput)[] = [
      'startDate',
      'endDate',
      'cause',
      'fixedTermType',
      'monthlySalary',
    ];
    const own = ['detectedKind', 'totalAccrued'];
    expect(Object.keys(SCHEMAS.settlement.fields).sort()).toEqual(
      [...inputKeys, ...ITEM_IDS, ...own].sort(),
    );
  });

  it('names work-history rows after ContributionPeriod', () => {
    const keys: readonly (keyof ContributionPeriod)[] = ['startDate', 'endDate'];
    expect(Object.keys(SCHEMAS.work_history.lists['contracts']?.item ?? {}).sort()).toEqual(
      [...keys].sort(),
    );
  });
});
