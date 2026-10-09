import { compareDates, parseDate } from '../date';
import { billsPhrase, type BillsPhrase } from './calculation';
import { RULES } from './rules';
import type { ElectricityBillInput, ElectricityScope, TelecomInput, TelecomScope } from './types';

// The 2.0TD access tariff of CNMC Circular 3/2020 covers up to 15 kW.
export const MAX_POWER_KW = 15;

// Postcodes of the Canary Islands (35, 38), Ceuta (51) and Melilla (52): other taxes and hours.
const OUTSIDE_PENINSULA = /^(35|38|51|52)/;

// The first day a bill may be issued on, from the billing rules it is checked against.
const BILLING_DAY = parseDate(RULES.billing.from);

// The first exit day the proportional commitment penalty applies to.
const PROPORTIONAL_DAY = parseDate(RULES.commitment_proportional.from);

// Household 2.0TD bills of the Peninsula and the Balearic Islands under the 2026 billing rules;
// anything else stops at the door and nothing is worked out.
export function electricityScope(
  input: Pick<
    ElectricityBillInput,
    'postcode' | 'accessTariff' | 'contractedPower' | 'issuedOn' | 'selfConsumption'
  >,
): ElectricityScope {
  if (OUTSIDE_PENINSULA.test(input.postcode))
    return { inScope: false, reason: 'canary_ceuta_melilla' };
  if (input.accessTariff !== '2.0TD') return { inScope: false, reason: 'not_2_0td' };
  if (Math.max(input.contractedPower.p1, input.contractedPower.p2) > MAX_POWER_KW)
    return { inScope: false, reason: 'over_15kw' };
  if (compareDates(input.issuedOn, BILLING_DAY) < 0)
    return { inScope: false, reason: 'issued_before_2026_06_12' };
  if (input.selfConsumption === 'with_surplus')
    return { inScope: false, reason: 'self_consumption_surplus' };
  return { inScope: true };
}

export function telecomScope(input: Pick<TelecomInput, 'exitRequestedOn'>): TelecomScope {
  if (compareDates(input.exitRequestedOn, PROPORTIONAL_DAY) < 0)
    return { inScope: false, reason: 'exit_before_2022' };
  return { inScope: true };
}

// Why the review stops; nothing when it goes on.
export function scopePhrases(reach: ElectricityScope | TelecomScope): readonly BillsPhrase[] {
  return reach.inScope ? [] : [billsPhrase(`scope.${reach.reason}`)];
}
