import { describe, expectTypeOf, it } from 'vitest';
import type {
  INFO_ELEMENTS as ENGINE_INFO_ELEMENTS,
  ClauseLabel,
  Clause,
  Holidays,
  InfoElement,
  InfoPresence,
  Modality,
  Offer,
  Relationship,
  SalaryComponentKind,
  SalaryPeriod,
  Trial,
} from '../../src/engine/employment/types';
import {
  CLAUSE_LABELS,
  HOLIDAY_UNITS,
  INFO_ELEMENTS,
  INFO_PRESENCE,
  MODALITIES,
  RELATIONSHIP_HINTS,
  REMOTE_WORK,
  SALARY_PART_KINDS,
  SALARY_PERIODS,
  TRAINING_TYPES,
  TRIAL_UNITS,
  WAIVED_RIGHTS,
} from '../src/domain/employment-schema';

// The site prefills its employment form from these labels; type:check fails if the engine drifts.
describe('employment engine contract', () => {
  it('mirrors the employment engine unions', () => {
    expectTypeOf<(typeof MODALITIES)[number]>().toEqualTypeOf<Modality>();
    expectTypeOf<(typeof CLAUSE_LABELS)[number]>().toEqualTypeOf<ClauseLabel>();
    expectTypeOf<(typeof SALARY_PART_KINDS)[number]>().toEqualTypeOf<SalaryComponentKind>();
    expectTypeOf<(typeof INFO_ELEMENTS)[number]>().toEqualTypeOf<InfoElement>();
    expectTypeOf<(typeof INFO_PRESENCE)[number]>().toEqualTypeOf<
      Exclude<InfoPresence, 'unknown'>
    >();
    expectTypeOf<(typeof SALARY_PERIODS)[number]>().toEqualTypeOf<SalaryPeriod>();
    expectTypeOf<(typeof TRIAL_UNITS)[number]>().toEqualTypeOf<Trial['unit']>();
    expectTypeOf<(typeof HOLIDAY_UNITS)[number]>().toEqualTypeOf<Holidays['unit']>();
    expectTypeOf<(typeof REMOTE_WORK)[number]>().toEqualTypeOf<NonNullable<Offer['remote']>>();
    expectTypeOf<(typeof WAIVED_RIGHTS)[number]>().toEqualTypeOf<
      NonNullable<Clause['waivedRight']>
    >();
    expectTypeOf<(typeof TRAINING_TYPES)[number]>().toEqualTypeOf<
      Extract<Modality, `training_${string}`>
    >();
    // A special employment centre is no hint the API gives: it would tell the worker's health.
    expectTypeOf<(typeof RELATIONSHIP_HINTS)[number]>().toEqualTypeOf<
      Exclude<Relationship, 'common' | 'special_employment_centre'> | 'temp_agency' | 'relief'
    >();
  });

  it('lists the information elements in the engine’s order', () => {
    expectTypeOf<typeof INFO_ELEMENTS>().toEqualTypeOf<typeof ENGINE_INFO_ELEMENTS>();
  });
});
