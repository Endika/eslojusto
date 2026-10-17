import { addDays, ordinal, toIso } from '../date';
import { round2 } from '../money';
import { energyPeriodAt } from './electricity-hours';
import { billingPeriod } from './period';
import type { HolidayCalendar } from './tables';
import type { ElectricityBillInput, EnergyLinePeriod, PowerPeriod } from './types';

// The hourly PVPC 2.0TD energy term, tolls and charges included, as REE publishes it: for each day,
// [local hour it starts, €/MWh], the hour repeated when clocks go back.
export interface PvpcHourly {
  readonly coveredUntil: string;
  readonly days: Readonly<Record<string, readonly (readonly [number, number])[]>>;
}

export interface EnergyAgainstPvpc {
  readonly period: EnergyLinePeriod;
  readonly kwh: number;
  // €/kWh: yours, from what the bill charges, and the plain mean of the PVPC hours of the period.
  readonly yourPrice: number;
  readonly pvpcPrice: number;
  readonly yourCost: number;
  readonly pvpcCost: number;
}

export type EnergyFigures =
  | { readonly kind: 'pvpc_bill' }
  // A day with no PVPC loaded yet, or a year whose toll holidays are not.
  | { readonly kind: 'pending' }
  | {
      readonly kind: 'compared';
      readonly periods: readonly EnergyAgainstPvpc[];
      // One price for all the energy: compared with the mean of every hour.
      readonly singlePrice: boolean;
      readonly yourCost: number;
      readonly pvpcCost: number;
    };

export interface PowerAgainstUse {
  readonly period: PowerPeriod;
  readonly contracted: number;
  readonly maxUsed: number | null;
  // € a kW contracted costs a year at the bill's own price; null when its lines differ.
  readonly perKwYear: number | null;
  // kW contracted above the highest used, and what they cost a year.
  readonly unusedKw: number;
  readonly unusedPerYear: number | null;
  readonly aboveContracted: boolean;
}

interface OfficialFigures {
  // Null when the bill has no energy lines.
  readonly energy: EnergyFigures | null;
  // Null when the bill prints no highest power used.
  readonly power: readonly PowerAgainstUse[] | null;
}

export interface OfficialDeps {
  readonly pvpc: PvpcHourly;
  readonly tollHolidays: HolidayCalendar;
}

const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;

// The plain mean of the PVPC hours of each period over the billed days, €/kWh; null when a day or
// its year's toll holidays are missing.
function pvpcMeans(
  input: ElectricityBillInput,
  { pvpc, tollHolidays }: OfficialDeps,
): Readonly<Record<EnergyLinePeriod, number | null>> | null {
  const { from, to } = billingPeriod(input);
  const sums: Record<EnergyLinePeriod, { total: number; hours: number }> = {
    p1: { total: 0, hours: 0 },
    p2: { total: 0, hours: 0 },
    p3: { total: 0, hours: 0 },
    all: { total: 0, hours: 0 },
  };
  for (let i = 1; i <= ordinal(to) - ordinal(from); i++) {
    const day = addDays(from, i);
    const hours = pvpc.days[toIso(day)];
    if (hours === undefined) return null;
    for (const [hour, price] of hours) {
      const period = energyPeriodAt(day, hour, tollHolidays);
      if (period === 'missing') return null;
      for (const sum of [sums[period], sums.all]) {
        sum.total += price;
        sum.hours += 1;
      }
    }
  }
  // No hour of a period in the billed days, as in a bill of a weekend: no mean to compare with.
  const mean = ({ total, hours }: { total: number; hours: number }) =>
    hours === 0 ? null : round6(total / hours / 1000);
  return { p1: mean(sums.p1), p2: mean(sums.p2), p3: mean(sums.p3), all: mean(sums.all) };
}

function energyFigures(input: ElectricityBillInput, deps: OfficialDeps): EnergyFigures | null {
  if (input.energy.length === 0) return null;
  if (input.market === 'pvpc') return { kind: 'pvpc_bill' };
  const means = pvpcMeans(input, deps);
  if (means === null) return { kind: 'pending' };
  const singlePrice = input.energy.some((l) => l.period === 'all');
  const order: readonly EnergyLinePeriod[] = singlePrice ? ['all'] : ['p1', 'p2', 'p3'];
  const periods: EnergyAgainstPvpc[] = [];
  for (const period of order) {
    const lines = input.energy.filter((l) => (singlePrice ? true : l.period === period));
    const kwh = lines.reduce((s, l) => s + l.kwh, 0);
    if (kwh <= 0) continue;
    const pvpcPrice = means[period];
    // kWh in a period none of the billed hours fall in: the bill's dates and lines disagree.
    if (pvpcPrice === null) return { kind: 'pending' };
    const yourCost = round2(lines.reduce((s, l) => s + l.kwh * l.price, 0));
    periods.push({
      period,
      kwh,
      yourPrice: round6(yourCost / kwh),
      pvpcPrice,
      yourCost,
      pvpcCost: round2(kwh * pvpcPrice),
    });
  }
  return {
    kind: 'compared',
    periods,
    singlePrice,
    yourCost: round2(periods.reduce((s, p) => s + p.yourCost, 0)),
    pvpcCost: round2(periods.reduce((s, p) => s + p.pvpcCost, 0)),
  };
}

// What a kW of `period` costs a year at the bill's own price; null when its lines differ.
function perKwYear(input: ElectricityBillInput, period: PowerPeriod): number | null {
  const prices = new Set(
    input.power
      .filter((l) => l.period === period)
      .map((l) => round6(l.unit === 'per_kw_day' ? l.price * 365 : l.price)),
  );
  const [price, ...more] = [...prices];
  return price === undefined || more.length > 0 ? null : price;
}

function powerFigures(input: ElectricityBillInput): readonly PowerAgainstUse[] | null {
  if (input.maxPowerUsed.p1 === null && input.maxPowerUsed.p2 === null) return null;
  return (['p1', 'p2'] as const).map((period) => {
    const contracted = input.contractedPower[period];
    const maxUsed = input.maxPowerUsed[period];
    const price = perKwYear(input, period);
    const unusedKw = maxUsed === null ? 0 : Math.max(0, round6(contracted - maxUsed));
    return {
      period,
      contracted,
      maxUsed,
      perKwYear: price === null ? null : round2(price),
      unusedKw,
      unusedPerYear: price === null || maxUsed === null ? null : round2(unusedKw * price),
      aboveContracted: maxUsed !== null && maxUsed > contracted,
    };
  });
}

// The bill's energy beside the PVPC of the same days and its power beside the power used: official
// figures with no verdict, for the paid report. The PVPC is the plain mean of each period's hours,
// which the report says is an estimate.
export function officialFigures(input: ElectricityBillInput, deps: OfficialDeps): OfficialFigures {
  return { energy: energyFigures(input, deps), power: powerFigures(input) };
}
