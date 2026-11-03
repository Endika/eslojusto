import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  isValidEvent,
  VALIDATION_CODES,
  validationCode,
  type ValidationCode,
} from '../../src/analytics/events';
import type { FieldErrorCode as Bills } from '../../src/bills/result';
import type { FieldErrorCode as FinalPay } from '../../src/calculator/form';
import type { FieldErrorCode as Credit } from '../../src/credit/form';
import type { FieldErrorCode as Employment } from '../../src/employment/form';
import type { FieldErrorCode as Household } from '../../src/household/form';
import type { FieldErrorCode as Insurance } from '../../src/insurance/form';
import type { FieldErrorCode as Mortgage } from '../../src/mortgage/form';
import type { FieldErrorCode as Rental } from '../../src/rental/form';

// What validationCode sends for a form's code: a «missing_<field>» code goes as «missing_value».
type Sent<C extends string> = C extends 'missing_choice'
  ? C
  : C extends `missing_${string}`
    ? 'missing_value'
    : C;

describe('validation codes', () => {
  it('cover every code a form can reject an answer with', () => {
    expectTypeOf<Sent<Bills>>().toExtend<ValidationCode>();
    expectTypeOf<Sent<FinalPay>>().toExtend<ValidationCode>();
    expectTypeOf<Sent<Credit>>().toExtend<ValidationCode>();
    expectTypeOf<Sent<Employment>>().toExtend<ValidationCode>();
    expectTypeOf<Sent<Household>>().toExtend<ValidationCode>();
    expectTypeOf<Sent<Insurance>>().toExtend<ValidationCode>();
    expectTypeOf<Sent<Mortgage>>().toExtend<ValidationCode>();
    expectTypeOf<Sent<Rental>>().toExtend<ValidationCode>();
  });

  it('are listed once and never name a field', () => {
    expect(new Set(VALIDATION_CODES).size).toBe(VALIDATION_CODES.length);
    for (const code of VALIDATION_CODES)
      if (code.startsWith('missing_')) expect(['missing_value', 'missing_choice']).toContain(code);
  });

  it('send a code naming its field as a missing value', () => {
    expect(validationCode('missing_children')).toBe('missing_value');
    expect(validationCode('missing_fixed_term_type')).toBe('missing_value');
    expect(validationCode('missing_choice')).toBe('missing_choice');
    expect(validationCode('end_before_start')).toBe('end_before_start');
    expect(validationCode('percent_missing')).toBe('percent_missing');
  });

  it('let an error through only with a listed code', () => {
    const error = { section: 'fechas', field: 'endDate' };
    expect(isValidEvent('validation_error', { ...error, code: 'end_before_start' })).toBe(true);
    expect(isValidEvent('validation_error', { ...error, code: '2026-13-01' })).toBe(false);
    expect(isValidEvent('validation_error', error)).toBe(false);
  });
});
