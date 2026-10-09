import { describe, expect, it } from 'vitest';
import { BILLS_NORMS } from '../../../src/engine/bills/data/norms';
import { BILLS_TABLES } from '../../../src/engine/bills/data/tables';
import {
  checkElectricityTax,
  type ElectricityTaxDeps,
} from '../../../src/engine/bills/electricity-tax';
import { countedAmount, findingsOf, type BillItem } from '../../../src/engine/bills/finding';
import type { NormTable } from '../../../src/engine/bills/norms';
import type { ElectricityBillInput, ElectricityTaxLine } from '../../../src/engine/bills/types';
import { parseDate } from '../../../src/engine/date';
import { juneBill, mayBill, only } from './input';

const deps: ElectricityTaxDeps = { norms: BILLS_NORMS, tables: BILLS_TABLES };

const tax = (amount: number, percent: number | null = 5.11269632): ElectricityTaxLine => ({
  base: null,
  percent,
  amount,
});

const check = (input: ElectricityBillInput, norms: NormTable = BILLS_NORMS): BillItem =>
  checkElectricityTax(input, { ...deps, norms });

// A bill of June consumption falling due in November 2026, when RDL 25/2026 lowers the rate to
// 0,5 % only if the September CPI says so: 0,5 % × 47,02 = 0,2351, under the floor of 0,25.
const november = (amount: number, percent: number | null = null) =>
  juneBill({ dueOn: parseDate('2026-11-10'), electricityTax: tax(amount, percent) });

const met = (norms: NormTable, value: boolean): NormTable => {
  const norm = norms.rdl25_2026_november;
  if (norm.condition === undefined) throw new Error('no condition');
  return {
    ...norms,
    rdl25_2026_november: { ...norm, condition: { ...norm.condition, met: value } },
  };
};
const validated = (norms: NormTable): NormTable => ({
  ...norms,
  rdl25_2026: { ...norms.rdl25_2026, status: 'in_force', statusSince: '2026-10-30' },
});
const repealed = (norms: NormTable): NormTable => ({
  ...norms,
  rdl25_2026: {
    ...norms.rdl25_2026,
    status: 'repealed',
    inForceUntil: '2026-10-30',
    statusSince: '2026-10-30',
  },
});

describe('the electricity tax of a bill due in July 2026', () => {
  // 5,11269632 % × (11,92 + 34,50 + 0,60) = 2,4040 → 2,40; without the funding 2,3733 → 2,37.
  it('matches at the general rate of the day it falls due', () => {
    const f = only(check(juneBill()));
    expect(f).toMatchObject({ id: 'electricity_tax', status: 'matches', amount: null });
    expect(f.rows).toEqual([
      {
        from: '2026-07-01',
        until: '2026-07-31',
        norm: 'law38_1992',
        url: `${BILLS_NORMS.law38_1992.url}#a99`,
        status: 'in_force',
        doubt: null,
      },
    ]);
    expect(f.calculation).toContainEqual({
      key: 'electricity_tax.rate',
      vars: {
        date: { date: '2026-07-07' },
        percent: { percent: 5.11269632 },
        euros: { euros: 2.4 },
      },
    });
    expect(f.sources.map((s) => s.id)).toEqual(['electricity_tax']);
  });

  it('matches with the social bonus funding out of the base, which no source read settles', () => {
    expect(only(check(juneBill({ electricityTax: tax(2.37) }))).status).toBe('matches');
  });

  // The difference is to the nearest base: 0,25 − 2,37 = −2,12.
  it('charged at the May rate, is shown short and never counted', () => {
    const item = check(juneBill({ electricityTax: tax(0.25, 0.5) }));
    expect(only(item)).toMatchObject({
      status: 'wrong_rate_for_date',
      amount: 2.12,
      direction: 'under',
    });
    expect(countedAmount(item)).toBe(0);
  });

  // 2,60 − 2,44: the difference is to the base with the meter rental in, which no primary source
  // read rules out, never to 2,40.
  it('over its own base is counted as a different base, never resting on the meter rental', () => {
    const item = check(juneBill({ electricityTax: tax(2.6) }));
    expect(only(item)).toMatchObject({
      status: 'different_base',
      amount: 0.16,
      direction: 'over',
    });
    expect(countedAmount(item)).toBe(0.16);
  });

  it('printing the rate rounded to two decimals is not a different rate', () => {
    expect(only(check(juneBill({ electricityTax: tax(2.4, 5.11) }))).status).toBe('matches');
    expect(only(check(juneBill({ electricityTax: tax(2.6, 5.11) }))).status).toBe('different_base');
  });

  // A settlement of 10 € in the base or out: 5,11269632 % × 57,02 = 2,9152 → 2,92.
  it('matches with a settlement of earlier bills in its base, which no source read settles', () => {
    const f = only(check(juneBill({ regularizations: [10], electricityTax: tax(2.92) })));
    expect(f.status).toBe('matches');
    expect(f.calculation).toContainEqual({ key: 'tax.parts_either' });
  });

  // (47,02 + 0,80) × 5,11269632 % = 2,4449 → 2,44.
  it('with the meter rental in its base is sent to review with no figure', () => {
    const f = only(check(juneBill({ electricityTax: tax(2.44) })));
    expect(f).toMatchObject({ status: 'review_it', amount: null });
    expect(f.calculation.at(-1)).toEqual({ key: 'electricity_tax.meter_outside' });
  });

  it('a bill with no electricity tax line says so', () => {
    expect(only(check(juneBill({ electricityTax: null }))).status).toBe('not_on_bill');
  });
});

describe('the electricity tax of a bill due in May 2026', () => {
  it('takes the floor of 1 € per MWh over 0,5 % of its base', () => {
    const f = only(check(mayBill()));
    expect(f.status).toBe('matches');
    expect(f.calculation).toContainEqual({
      key: 'electricity_tax.minimum',
      vars: { kwh: { kwh: 400 }, euros: { euros: 0.4 } },
    });
    expect(f.rows.map((r) => [r.norm, r.from, r.until, r.status])).toEqual([
      ['rdl7_2026', '2026-03-22', '2026-05-31', 'in_force'],
    ]);
  });

  it('0,5 % without its floor is short and never counted', () => {
    const item = check(mayBill({ electricityTax: tax(0.22, 0.5) }));
    expect(only(item)).toMatchObject({
      status: 'different_base',
      amount: 0.18,
      direction: 'under',
    });
    expect(countedAmount(item)).toBe(0);
  });

  // 5,11269632 % × 43,52 = 2,2250 → 2,23.
  it('at the general rate it is counted, whether the bill prints the rate or not', () => {
    for (const percent of [5.11269632, null]) {
      const item = check(mayBill({ electricityTax: tax(2.23, percent) }));
      expect(only(item)).toMatchObject({
        status: 'wrong_rate_for_date',
        amount: 1.83,
        direction: 'over',
      });
      expect(countedAmount(item)).toBe(1.83);
    }
  });
});

describe('the electricity tax of a bill due in November 2026', () => {
  it('gives two readings while the CPI figure and the validation are pending', () => {
    const item = check(november(2.4, 5.11269632));
    expect(item.kind).toBe('readings');
    const [low, high] = findingsOf(item);
    expect(low).toMatchObject({ status: 'wrong_rate_for_date', amount: 2.15, direction: 'over' });
    expect(high?.status).toBe('matches');
    for (const f of findingsOf(item)) {
      expect(f.dependsOn).toEqual(['rdl25_2026_november', 'rdl25_2026']);
      expect(f.calculation).toContainEqual({ key: 'tax.rate_depends' });
      expect(f.rows.map((r) => [r.norm, r.status])).toEqual([
        ['rdl25_2026_november', 'conditional'],
        ['law38_1992', 'in_force'],
      ]);
    }
    expect(countedAmount(item)).toBe(0);
  });

  it('still gives two readings once the CPI condition is met while the decree awaits validation', () => {
    const item = check(november(2.4, 5.11269632), met(BILLS_NORMS, true));
    expect(item.kind).toBe('readings');
    for (const f of findingsOf(item)) expect(f.dependsOn).toEqual(['rdl25_2026']);
    expect(countedAmount(item)).toBe(0);
  });

  it('counts only the lowest reading when both are over', () => {
    // 6 % on its base is over both rates: 2,82 − 0,25 = 2,57 and, to the base with the meter
    // rental in, 2,82 − 2,44 = 0,38.
    const item = check(november(2.82, 6));
    expect(findingsOf(item).map((f) => f.amount)).toEqual([2.57, 0.38]);
    expect(countedAmount(item)).toBe(0.38);
  });

  it('takes one reading once the review settles the month, changing only the norms', () => {
    const reduced = validated(met(BILLS_NORMS, true));
    expect(only(check(november(0.25, 0.5), reduced)).status).toBe('matches');
    const item = check(november(2.4, 5.11269632), reduced);
    expect(only(item)).toMatchObject({ status: 'wrong_rate_for_date', amount: 2.15 });
    expect(countedAmount(item)).toBe(2.15);
    expect(only(check(november(2.4), met(BILLS_NORMS, false))).status).toBe('matches');
    expect(only(check(november(2.4), repealed(met(BILLS_NORMS, true)))).status).toBe('matches');
  });
});

describe('a day with no rate loaded', () => {
  it('in 2027 is pending an official figure, never the rate of December', () => {
    const f = only(check(juneBill({ dueOn: parseDate('2027-01-08') })));
    expect(f).toMatchObject({ status: 'pending_official_data', amount: null });
    expect(f.calculation).toEqual([
      { key: 'official.missing', vars: { day: { date: '2027-01-08' } } },
    ]);
  });

  it('with a month taken out of the table, is pending instead of reusing the month before', () => {
    const tables = {
      electricityTax: BILLS_TABLES.electricityTax.filter((r) => r.from !== '2026-07-01'),
    };
    const f = only(checkElectricityTax(juneBill(), { norms: BILLS_NORMS, tables }));
    expect(f.status).toBe('pending_official_data');
  });
});
