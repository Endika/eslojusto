import { toIso } from '../date';
import { round2 } from '../money';
import { billsPhrase } from './calculation';
import { sum } from './electricity-arithmetic';
import { billFinding, pendingOfficial, single, type BillItem } from './finding';
import type { NormTable } from './norms';
import { citeRows, rowsOn } from './period';
import type { BillsRuleId } from './rules';
import {
  acrossRates,
  discountsOf,
  distinct,
  kwhBilled,
  possibleSums,
  powerAndEnergy,
  type TaxReading,
} from './tax';
import type { BillsTables, ElectricityTaxRate } from './tables';
import type { ElectricityBillInput } from './types';

export interface ElectricityTaxDeps {
  readonly norms: NormTable;
  readonly tables: Pick<BillsTables, 'electricityTax'>;
}

const RULES: readonly BillsRuleId[] = ['electricity_tax'];

// The electricity tax at the rate in force on the day the bill falls due (art. 95), never on the
// days of consumption: the rate times power, energy and social bonus funding less the social bonus,
// and never under its floor per MWh consumed. Whether the funding belongs in the base no primary
// source read settles, nor discounts, excess power and settlements of earlier bills: a bill
// matches with them in or out. The
// meter rental stays out; a bill that differs only by it is sent to review with no figure.
export function checkElectricityTax(
  input: ElectricityBillInput,
  { norms, tables }: ElectricityTaxDeps,
): BillItem {
  const line = input.electricityTax;
  const day = toIso(input.dueOn);
  if (line === null)
    return single(
      billFinding(
        'electricity_tax',
        'not_on_bill',
        [billsPhrase('electricity_tax.not_on_bill')],
        RULES,
        norms,
      ),
    );
  const on = rowsOn(tables.electricityTax, day, norms);
  if (on.kind === 'missing') return pendingOfficial('electricity_tax', on.day, RULES, norms);

  const kwh = kwhBilled(input);
  const funding = input.socialBonusFunding ?? 0;
  const certain = powerAndEnergy(input) - (input.socialBonus?.amount ?? 0);
  const otherParts = [
    input.excessPower?.amount ?? 0,
    -discountsOf(input),
    sum(input.regularizations),
  ]
    .filter((value) => value !== 0)
    .map((value) => [value, 0]);
  const bases = possibleSums(certain, [...(funding > 0 ? [[funding, 0]] : []), ...otherParts]);
  const meter = input.meter?.amount ?? 0;
  const tableRates = distinct(tables.electricityTax.map((r) => r.value.percent));

  const reading = (rate: ElectricityTaxRate): TaxReading => {
    const floor = (rate.minimumPerMwh / 1000) * kwh;
    const tax = (base: number) => Math.max((rate.percent / 100) * base, floor);
    const shown = bases[0] ?? certain;
    const atOthers = tableRates
      .filter((p) => p !== rate.percent)
      .flatMap((p) => bases.map((b) => Math.max((p / 100) * b, floor)));
    return {
      percent: rate.percent,
      expected: bases.map(tax),
      unsettled: meter > 0 ? bases.map((b) => tax(b + meter)) : [],
      unsettledPhrase: 'electricity_tax.meter_outside',
      atOtherRates: atOthers,
      calculation: [
        billsPhrase('electricity_tax.base', { euros: { euros: round2(shown) } }),
        ...(funding > 0 ? [billsPhrase('electricity_tax.funding_either')] : []),
        ...(otherParts.length > 0 ? [billsPhrase('tax.parts_either')] : []),
        billsPhrase('electricity_tax.rate', {
          date: { date: day },
          percent: { percent: rate.percent },
          euros: { euros: round2(tax(shown)) },
        }),
        ...(floor >= (rate.percent / 100) * shown
          ? [
              billsPhrase('electricity_tax.minimum', {
                kwh: { kwh },
                euros: { euros: round2(floor) },
              }),
            ]
          : []),
      ],
    };
  };

  const rates = on.rows.map((r) => r.value).sort((a, b) => a.percent - b.percent);
  const low = rates[0];
  const high = rates.at(-1);
  if (low === undefined || high === undefined) throw new RangeError(`No rate covers ${day}`);
  return acrossRates(
    {
      id: 'electricity_tax',
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
