import { describe, expectTypeOf, it } from 'vitest';
import type { PriceIndex } from '../../src/engine/bills/types';
import { PRICE_INDEXES } from '../src/domain/telecom-schema';

// The site will prefill its telecom form from this label; type:check fails if the engine drifts.
describe('telecom engine contract', () => {
  it('mirrors the bills engine union', () => {
    expectTypeOf<(typeof PRICE_INDEXES)[number]>().toEqualTypeOf<PriceIndex>();
  });
});
