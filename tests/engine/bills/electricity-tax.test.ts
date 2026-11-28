import { describe, expect, it } from 'vitest';
import { billsPhrase as say } from '../../../src/engine/bills/calculation';
import { BILLS_NORMS } from '../../../src/engine/bills/data/norms';
import { NORMS_BEFORE_FIGURE } from './norms-before-figure';
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

describe('the electricity tax of a bill due in July 2026', () => {
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
});

describe('the electricity tax of a bill due in November 2026', () => {
  it('gives two readings while the CPI figure and the validation are pending', () => {
    const item = check(november(2.4, 5.11269632), NORMS_BEFORE_FIGURE);
    expect(item).toMatchObject({
      kind: 'readings',
      question: 'official_value',
      readings: [{ when: 'lower_value' }, { when: 'higher_value' }],
    });
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
});

describe('a day with no rate loaded', () => {
  it('in 2027 is pending an official figure, never the rate of December', () => {
    const f = only(check(juneBill({ dueOn: parseDate('2027-01-08') })));
    expect(f).toMatchObject({ status: 'pending_official_data', amount: null });
    expect(f.calculation).toEqual([
      { key: 'official.missing', vars: { day: { date: '2027-01-08' } } },
    ]);
  });
});

describe('the words of the electricity tax', () => {
  const billed = (euros: number) => say('arithmetic.billed', { euros: { euros } });
  const rate = (percent: number, euros: number) =>
    say('electricity_tax.rate', {
      date: { date: '2026-07-07' },
      percent: { percent },
      euros: { euros },
    });

  it('says its base, the funding that may or may not be in it, the rate and what it billed', () => {
    const f = only(check(juneBill()));
    expect(f.calculation).toEqual([
      say('electricity_tax.base', { euros: { euros: 47.02 } }),
      say('electricity_tax.funding_either'),
      rate(5.11269632, 2.4),
      billed(2.4),
      say('tolerance.line'),
    ]);
  });

  it('leaves out the funding and the meter when the bill has neither', () => {
    const f = only(
      check(juneBill({ socialBonusFunding: null, meter: null, electricityTax: tax(2.37) })),
    );
    expect(f.status).toBe('matches');
    expect(f.calculation).toEqual([
      say('electricity_tax.base', { euros: { euros: 46.42 } }),
      rate(5.11269632, 2.37),
      billed(2.37),
      say('tolerance.line'),
    ]);
  });

  it('says a bill with no tax line is not on it, on the supply regulation', () => {
    const f = only(check(juneBill({ electricityTax: null })));
    expect(f).toMatchObject({ id: 'electricity_tax', line: null });
    expect(f.calculation).toEqual([say('electricity_tax.not_on_bill')]);
    expect(f.sources.map((s) => s.id)).toEqual(['electricity_tax']);
  });

  it('names the tax in a day it has no rate for', () => {
    expect(only(check(juneBill({ dueOn: parseDate('2027-01-08') }))).id).toBe('electricity_tax');
  });

  it('says the minimum only where it is what the tax comes to, even when it is the same', () => {
    const row = BILLS_TABLES.electricityTax[0];
    if (row === undefined) throw new Error('no rate');
    const even = {
      norms: BILLS_NORMS,
      tables: {
        electricityTax: [
          { ...row, from: '2026-01-01', until: null, value: { percent: 4, minimumPerMwh: 20 } },
        ],
      },
    };
    const input = juneBill({
      power: [{ period: 'p1', kw: 4.6, price: 0.1, unit: 'per_kw_day', days: null, amount: 10 }],
      energy: [{ period: 'p1', kwh: 100, price: 0.4, amount: 40 }],
      socialBonusFunding: null,
      meter: null,
      electricityTax: tax(2, 4),
    });
    const f = only(checkElectricityTax(input, even));
    expect(f.status).toBe('matches');
    expect(f.calculation).toContainEqual(
      say('electricity_tax.minimum', { kwh: { kwh: 100 }, euros: { euros: 2 } }),
    );
  });

  it('says which rate is wrong, when the bill prints one', () => {
    const wrong = only(check(mayBill({ electricityTax: tax(2.23, 5.11269632) })));
    expect(wrong.status).toBe('wrong_rate_for_date');
    expect(wrong.calculation).toContainEqual(
      say('tax.wrong_rate', { percent: { percent: 5.11269632 } }),
    );
    expect(wrong.calculation.at(-1)).toEqual(say('arithmetic.refund_next_bill'));
    expect(wrong.sources.map((s) => s.id)).toEqual(['electricity_tax', 'billing']);
    const unprinted = only(check(mayBill({ electricityTax: tax(2.23, null) })));
    expect(unprinted.status).toBe('wrong_rate_for_date');
    expect(unprinted.calculation).toContainEqual(say('tax.wrong_rate'));
  });

  it('takes a printed rate that is the right one for a different base, whatever the amount', () => {
    const item = only(check(mayBill({ electricityTax: tax(2.23, 0.5) })));
    expect(item.status).toBe('different_base');
    expect(item.calculation).toContainEqual(say('tax.different_base'));
  });

  it.each([['with a meter', {}]])(
    'a bill that prints no rate and matches no other is a different base, %s',
    (_, change) => {
      const input = juneBill({ ...change, electricityTax: tax(2.6, null) });
      expect(only(check(input)).status).toBe('different_base');
      const one = BILLS_TABLES.electricityTax.filter((r) => r.norm === 'law38_1992');
      const alone = checkElectricityTax(input, {
        norms: BILLS_NORMS,
        tables: { electricityTax: one },
      });
      expect(only(alone).status).toBe('different_base');
    },
  );

  it('reads the lowest rate first whatever the order of the table', () => {
    const tables = { electricityTax: [...BILLS_TABLES.electricityTax].reverse() };
    const item = checkElectricityTax(november(2.4, 5.11269632), {
      norms: NORMS_BEFORE_FIGURE,
      tables,
    });
    expect(findingsOf(item).map((f) => f.status)).toEqual(['wrong_rate_for_date', 'matches']);
  });

  it('takes the social bonus and the discounts off its base', () => {
    const bonus = {
      category: 'vulnerable',
      members: 2,
      discountedKwh: null,
      kwhSoFar: null,
      amount: 10,
    } as const;
    const f = only(
      check(juneBill({ socialBonus: bonus, discounts: [5], electricityTax: tax(1.7) })),
    );
    // 11,92 + 34,50 − 10 + 0,60 − 5 = 32,02.
    expect(f.calculation[0]).toEqual(say('electricity_tax.base', { euros: { euros: 32.02 } }));
  });
});
