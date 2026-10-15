import { describe, expectTypeOf, it } from 'vitest';
import type { TelecomLineKind } from '../../src/engine/bills/telecom-charges';
import type { PriceIndex } from '../../src/engine/bills/types';
import { PRICE_INDEXES, TELECOM_LINE_KINDS } from '../src/domain/telecom-schema';

// The site prefills its telecom form from these labels and lists the bills' lines by kind;
// type:check fails if the engine drifts.
describe('telecom engine contract', () => {
  it('mirrors the bills engine union', () => {
    expectTypeOf<(typeof PRICE_INDEXES)[number]>().toEqualTypeOf<PriceIndex>();
    expectTypeOf<(typeof TELECOM_LINE_KINDS)[number]>().toEqualTypeOf<TelecomLineKind>();
  });
});
