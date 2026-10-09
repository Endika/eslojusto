import { describe, expectTypeOf, it } from 'vitest';
import type { CarCover, InsuranceLine } from '../../src/engine/insurance/types';
import { CAR_COVERS, INSURANCE_LINES } from '../src/domain/insurance-schema';

// The site will prefill its insurance form from these labels; type:check fails if the engine
// drifts.
describe('insurance engine contract', () => {
  it('mirrors the insurance engine unions', () => {
    expectTypeOf<(typeof INSURANCE_LINES)[number]>().toEqualTypeOf<InsuranceLine>();
    expectTypeOf<(typeof CAR_COVERS)[number]>().toEqualTypeOf<CarCover>();
  });
});
