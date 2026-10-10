import { describe, expectTypeOf, it } from 'vitest';
import type {
  AccessTariff,
  ElectricityBillInput,
  EnergyPeriod,
  ExitPenalty,
  Phase,
  PowerPeriod,
  PowerPriceUnit,
  SelfConsumption,
  ServiceLabel,
  SocialBonusCategory,
} from '../../src/engine/bills/types';
import {
  ACCESS_TARIFFS,
  ELECTRICITY_MARKETS,
  ENERGY_PERIODS,
  METER_PHASES,
  POWER_PERIODS,
  POWER_PRICE_UNITS,
  PRICE_TYPES,
  READING_KINDS,
  SELF_CONSUMPTION,
  SERVICE_LABELS,
  SOCIAL_BONUS_CATEGORIES,
} from '../src/domain/electricity-schema';

// The site will prefill its electricity form from these labels; type:check fails if the engine
// drifts.
describe('electricity engine contract', () => {
  it('mirrors the bills engine unions', () => {
    expectTypeOf<(typeof ELECTRICITY_MARKETS)[number]>().toEqualTypeOf<
      ElectricityBillInput['market']
    >();
    expectTypeOf<(typeof READING_KINDS)[number]>().toEqualTypeOf<
      NonNullable<ElectricityBillInput['readingKind']>
    >();
    expectTypeOf<(typeof ACCESS_TARIFFS)[number]>().toEqualTypeOf<AccessTariff>();
    expectTypeOf<(typeof SELF_CONSUMPTION)[number]>().toEqualTypeOf<SelfConsumption>();
    expectTypeOf<(typeof POWER_PERIODS)[number]>().toEqualTypeOf<PowerPeriod>();
    expectTypeOf<(typeof ENERGY_PERIODS)[number]>().toEqualTypeOf<EnergyPeriod>();
    expectTypeOf<(typeof POWER_PRICE_UNITS)[number]>().toEqualTypeOf<PowerPriceUnit>();
    expectTypeOf<(typeof SOCIAL_BONUS_CATEGORIES)[number]>().toEqualTypeOf<SocialBonusCategory>();
    expectTypeOf<(typeof METER_PHASES)[number]>().toEqualTypeOf<Phase>();
    expectTypeOf<(typeof SERVICE_LABELS)[number]>().toEqualTypeOf<ServiceLabel>();
    expectTypeOf<(typeof PRICE_TYPES)[number]>().toEqualTypeOf<
      NonNullable<ExitPenalty['priceType']>
    >();
  });
});
