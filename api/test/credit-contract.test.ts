import { describe, expectTypeOf, it } from 'vitest';
import type {
  ChargeKind,
  ChargePayment,
  CreditInput,
  CreditProduct,
} from '../../src/engine/credit/types';
import {
  LOAN_CHARGE_KINDS,
  LOAN_CHARGE_PAYMENTS,
  LOAN_PRODUCTS,
  LOAN_RATE_TYPES,
} from '../src/domain/credit-schema';

// The site will prefill its credit form from these labels; type:check fails if the engine drifts.
describe('credit engine contract', () => {
  it('mirrors the credit engine unions', () => {
    expectTypeOf<(typeof LOAN_PRODUCTS)[number]>().toEqualTypeOf<CreditProduct>();
    expectTypeOf<(typeof LOAN_CHARGE_KINDS)[number]>().toEqualTypeOf<ChargeKind>();
    expectTypeOf<(typeof LOAN_CHARGE_PAYMENTS)[number]>().toEqualTypeOf<ChargePayment>();
    expectTypeOf<(typeof LOAN_RATE_TYPES)[number]>().toEqualTypeOf<CreditInput['rateType']>();
  });
});
