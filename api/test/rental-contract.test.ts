import { describe, expectTypeOf, it } from 'vitest';
import type {
  ChargeKind,
  ContractType,
  DeductionKind,
  FeeKind,
  GuaranteeKind,
  LandlordType,
  UpdateClause,
} from '../../src/engine/rental/types';
import {
  CHARGE_KINDS,
  DEDUCTION_KINDS,
  FEE_CONCEPT_KINDS,
  GUARANTEE_KINDS,
  LANDLORD_TYPES,
  LEASE_USES,
  UPDATE_CLAUSE_INDEXES,
} from '../src/domain/rental-schema';

// The site prefills its rental form from these labels; type:check fails if the engine drifts.
describe('rental engine contract', () => {
  it('mirrors the rental engine unions', () => {
    expectTypeOf<(typeof LEASE_USES)[number]>().toEqualTypeOf<ContractType>();
    expectTypeOf<(typeof LANDLORD_TYPES)[number]>().toEqualTypeOf<LandlordType>();
    expectTypeOf<(typeof UPDATE_CLAUSE_INDEXES)[number]>().toEqualTypeOf<UpdateClause>();
    expectTypeOf<(typeof FEE_CONCEPT_KINDS)[number]>().toEqualTypeOf<FeeKind>();
    expectTypeOf<(typeof GUARANTEE_KINDS)[number]>().toEqualTypeOf<GuaranteeKind>();
    expectTypeOf<(typeof CHARGE_KINDS)[number]>().toEqualTypeOf<ChargeKind>();
    expectTypeOf<(typeof DEDUCTION_KINDS)[number]>().toEqualTypeOf<DeductionKind>();
  });
});
