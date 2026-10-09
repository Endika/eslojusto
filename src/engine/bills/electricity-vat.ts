import { toIso } from '../date';
import { round2 } from '../money';
import { billsPhrase, type BillsPhraseKey } from './calculation';
import { sum } from './electricity-arithmetic';
import { billFinding, pendingOfficial, single, type BillItem } from './finding';
import type { NormTable } from './norms';
import { citeRows, rowsOn } from './period';
import type { BillsRuleId } from './rules';
import {
  acrossRates,
  discountsOf,
  distinct,
  possibleSums,
  powerAndEnergy,
  type TaxReading,
} from './tax';
import type { BillsTables, VatRate } from './tables';
import type { ElectricityBillInput } from './types';

export interface VatDeps {
  readonly norms: NormTable;
  readonly tables: Pick<BillsTables, 'vat'>;
}

const RULES: readonly BillsRuleId[] = ['vat'];

// A rate that may apply to this bill: the electricity's own, and the general one for what may not
// share the reduction.
interface Applicable {
  readonly percent: number;
  readonly general: number;
}

// The rates a row may give this bill. A reduced row reaches a supply under its power limit, or a
// holder of the social bonus as severely vulnerable; where the bill leaves that open, both rates.
function applicable(rate: VatRate, input: ElectricityBillInput, doubts: Set<BillsPhraseKey>) {
  if (rate.kind === 'general') return [{ percent: rate.percent, general: rate.percent }];
  const reduced = { percent: rate.percent, general: rate.generalPercent };
  const general = { percent: rate.generalPercent, general: rate.generalPercent };
  const bonus = input.socialBonus;
  if (bonus?.category === 'severe' && rate.severeVulnerable === true) {
    doubts.add('vat.severe_reduced');
    return [reduced];
  }
  const powers = [input.contractedPower.p1, input.contractedPower.p2];
  const within = (kw: number) =>
    rate.powerLimitIncluded ? kw <= rate.powerLimitKw : kw < rate.powerLimitKw;
  let rates: readonly Applicable[];
  if (powers.every(within)) rates = [reduced];
  // «Inferior a» 10 kW in one decree, «inferior o igual a» in the next: a supply of exactly the
  // limit gets both readings.
  else if (!rate.powerLimitIncluded && powers.every((kw) => kw <= rate.powerLimitKw)) {
    doubts.add('vat.power_at_limit');
    rates = [reduced, general];
  } else if (powers.some(within)) {
    doubts.add('vat.power_periods_apart');
    rates = [reduced, general];
  } else rates = [general];
  const maybeSevere =
    bonus !== undefined &&
    bonus !== null &&
    (bonus.category === null || (bonus.category === 'severe' && rate.severeVulnerable === null));
  if (rates.length === 1 && rates[0] === general && maybeSevere) {
    doubts.add('vat.severe_unknown');
    rates = [reduced, general];
  }
  return rates;
}

// VAT at the rate in force on the day the bill falls due (art. 75), on power, energy, the social
// bonus funding less the social bonus, the electricity tax as billed, the meter rental and the
// services. Where no norm read settles how a part enters (discounts, excess power, services, an exit
// penalty, settlements of earlier bills) the bill matches with it in or out, or at the general
// rate. The meter at the reduced rate is not confirmed in a primary source: a bill that differs
// only by charging it at the general rate is sent to review with no figure.
export function checkVat(input: ElectricityBillInput, { norms, tables }: VatDeps): BillItem {
  const line = input.vat;
  const day = toIso(input.dueOn);
  if (line === null)
    return single(
      billFinding('vat', 'not_on_bill', [billsPhrase('vat.not_on_bill')], RULES, norms),
    );
  const on = rowsOn(tables.vat, day, norms);
  if (on.kind === 'missing') return pendingOfficial('vat', on.day, RULES, norms);

  const electricity =
    powerAndEnergy(input) +
    (input.socialBonusFunding ?? 0) -
    (input.socialBonus?.amount ?? 0) +
    (input.electricityTax?.amount ?? 0);
  const meter = input.meter?.amount ?? 0;
  const services = sum(input.services.map((s) => s.amount));
  const penalty = input.exitPenalty?.amount ?? 0;
  const settled = sum(input.regularizations);
  const discounts = discountsOf(input);
  const excess = input.excessPower?.amount ?? 0;
  const shownBase = electricity + meter + services + penalty + settled - discounts + excess;

  // VAT in euros at `percent`, with the parts whose place is open each in, at the general rate or
  // out; the first sum has every part in at `percent`.
  const vatAt = ({ percent, general }: Applicable, meterPercent: number): readonly number[] => {
    const at = (p: number, amount: number) => (p / 100) * amount;
    const parts = [
      [at(percent, -discounts), 0],
      [at(percent, excess), 0],
      [at(percent, services), at(general, services), 0],
      [at(percent, penalty), at(general, penalty), 0],
      [at(percent, settled), 0],
    ].filter((options) => options[0] !== 0);
    return possibleSums(at(percent, electricity) + at(meterPercent, meter), parts);
  };
  const open = discounts + excess + services + penalty + Math.abs(settled) > 0;

  const doubts = new Set<BillsPhraseKey>();
  const options = on.rows.flatMap((row) => applicable(row.value, input, doubts));
  const tableRates = distinct(
    tables.vat.flatMap((r) =>
      r.value.kind === 'general' ? [r.value.percent] : [r.value.percent, r.value.generalPercent],
    ),
  );

  const reading = (rate: Applicable): TaxReading => {
    const expected = vatAt(rate, rate.percent);
    return {
      percent: rate.percent,
      expected,
      unsettled: rate.general !== rate.percent && meter > 0 ? vatAt(rate, rate.general) : [],
      unsettledPhrase: 'vat.meter_reduced',
      atOtherRates: tableRates
        .filter((p) => p !== rate.percent)
        .flatMap((p) => vatAt({ percent: p, general: p }, p)),
      calculation: [
        billsPhrase('vat.base', { euros: { euros: round2(shownBase) } }),
        ...(open ? [billsPhrase('tax.parts_either')] : []),
        billsPhrase('vat.rate', {
          date: { date: day },
          percent: { percent: rate.percent },
          euros: { euros: round2(expected[0] ?? 0) },
        }),
        ...[...doubts].map((key) =>
          key === 'vat.power_at_limit'
            ? billsPhrase(key, {
                kw: { kw: Math.max(input.contractedPower.p1, input.contractedPower.p2) },
              })
            : billsPhrase(key),
        ),
      ],
    };
  };

  const sorted = [...options].sort((a, b) => a.percent - b.percent);
  const low = sorted[0];
  const high = sorted.at(-1);
  if (low === undefined || high === undefined) throw new RangeError(`No VAT rate covers ${day}`);
  return acrossRates(
    {
      id: 'vat',
      billed: line.amount,
      printedPercent: line.percent,
      rules: RULES,
      rows: citeRows(on.rows, norms),
      dependsOn: on.deciding,
    },
    reading(low),
    reading(high),
    norms,
  );
}
