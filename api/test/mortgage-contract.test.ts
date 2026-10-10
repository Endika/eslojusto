import { describe, expectTypeOf, it } from 'vitest';
import type {
  ClauseLabel,
  InvoiceKind,
  LoanKind,
  MortgageInput,
  OperationKind,
  PrepaymentOption,
  RateType,
} from '../../src/engine/mortgage/types';
import {
  AJD_CONCEPTS,
  MORTGAGE_BORROWERS,
  MORTGAGE_CLAUSE_LABELS,
  MORTGAGE_LOAN_KINDS,
  MORTGAGE_OPERATION_KINDS,
  MORTGAGE_PURPOSES,
  MORTGAGE_RATE_TYPES,
  NOTARY_CONCEPTS,
  PREPAYMENT_OPTIONS,
  REGISTRY_CONCEPTS,
} from '../src/domain/mortgage-schema';

// The site will prefill its mortgage form from these labels; type:check fails if the engine
// drifts. A page that is no mortgage, and an option nobody read, are left out rather than labelled.
describe('mortgage engine contract', () => {
  it('mirrors the mortgage engine unions', () => {
    expectTypeOf<(typeof MORTGAGE_BORROWERS)[number]>().toEqualTypeOf<MortgageInput['borrower']>();
    expectTypeOf<(typeof MORTGAGE_PURPOSES)[number]>().toEqualTypeOf<MortgageInput['purpose']>();
    expectTypeOf<(typeof MORTGAGE_LOAN_KINDS)[number]>().toEqualTypeOf<
      Exclude<LoanKind, 'not_mortgage'>
    >();
    expectTypeOf<(typeof MORTGAGE_RATE_TYPES)[number]>().toEqualTypeOf<RateType>();
    expectTypeOf<(typeof PREPAYMENT_OPTIONS)[number]>().toEqualTypeOf<
      Exclude<PrepaymentOption, 'unknown'>
    >();
    expectTypeOf<(typeof MORTGAGE_OPERATION_KINDS)[number]>().toEqualTypeOf<OperationKind>();
    expectTypeOf<(typeof MORTGAGE_CLAUSE_LABELS)[number]>().toEqualTypeOf<ClauseLabel>();
  });

  it('names every notary, registry and tax kind of invoice the engine knows', () => {
    expectTypeOf<`notary_${(typeof NOTARY_CONCEPTS)[number]}`>().toEqualTypeOf<
      Extract<InvoiceKind, `notary_${string}`>
    >();
    expectTypeOf<`registry_${(typeof REGISTRY_CONCEPTS)[number]}`>().toEqualTypeOf<
      Extract<InvoiceKind, `registry_${string}`>
    >();
    expectTypeOf<`ajd_${(typeof AJD_CONCEPTS)[number]}`>().toEqualTypeOf<
      Extract<InvoiceKind, `ajd_${string}`>
    >();
  });
});
