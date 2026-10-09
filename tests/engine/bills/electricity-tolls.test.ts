import { describe, expect, it } from 'vitest';
import { BILLS_NORMS } from '../../../src/engine/bills/data/norms';
import { BILLS_TABLES } from '../../../src/engine/bills/data/tables';
import { checkTollsAndCharges, type TollsDeps } from '../../../src/engine/bills/electricity-tolls';
import { countedAmount } from '../../../src/engine/bills/finding';
import type { NormTable } from '../../../src/engine/bills/norms';
import type { PowerEnergyPrices, Table } from '../../../src/engine/bills/tables';
import type { ElectricityBillInput } from '../../../src/engine/bills/types';
import { parseDate } from '../../../src/engine/date';
import { freeBill, juneBill, only } from './input';

const deps: TollsDeps = { norms: BILLS_NORMS, tables: BILLS_TABLES };

const check = (input: ElectricityBillInput, with_: TollsDeps = deps) => {
  const [power, energy] = checkTollsAndCharges(input, with_);
  if (power === undefined || energy === undefined) throw new Error('two items');
  return { power, energy };
};

describe('tolls and charges of the 2.0TD tariff', () => {
  it('match the June bill: 10,75 € on power and 8,30 € on energy', () => {
    const { power, energy } = check(juneBill());
    expect(only(power)).toMatchObject({ id: 'tolls_and_charges_power', status: 'matches' });
    expect(only(energy)).toMatchObject({ id: 'tolls_and_charges_energy', status: 'matches' });
    expect(only(power).calculation[0]).toEqual({
      key: 'tolls.power',
      vars: { p1: { kw: 4.6 }, p2: { kw: 4.6 }, euros: { euros: 10.75 } },
    });
  });

  it('cite the tolls and charges rows with their days and status', () => {
    const { power } = check(juneBill());
    expect(only(power).rows).toEqual([
      {
        from: '2026-01-01',
        until: '2026-12-31',
        norm: 'cnmc_tolls_2026',
        url: BILLS_NORMS.cnmc_tolls_2026.url,
        status: 'in_force',
        doubt: null,
      },
      {
        from: '2026-01-01',
        until: '2026-12-31',
        norm: 'order_ted1524_2025',
        url: BILLS_NORMS.order_ted1524_2025.url,
        status: 'in_force',
        doubt: null,
      },
    ]);
    expect(only(power).sources.map((s) => s.id)).toEqual(['tolls', 'charges']);
    expect(only(power).pendingOn).toEqual([]);
  });

  it('show a figure different from the official one either way, never counted', () => {
    const { power, energy } = check(juneBill({ tollsAndCharges: { power: 11.75, energy: 8 } }));
    expect(only(power)).toMatchObject({
      status: 'differs_from_official',
      amount: 1,
      direction: 'over',
    });
    expect(only(energy)).toMatchObject({
      status: 'differs_from_official',
      amount: 0.3,
      direction: 'under',
    });
    expect(countedAmount(power)).toBe(0);
  });

  it('say so when the bill does not itemise them', () => {
    const { power, energy } = check(juneBill({ tollsAndCharges: { power: null, energy: 8.3 } }));
    expect(only(power).status).toBe('not_on_bill');
    expect(only(energy).status).toBe('matches');
    expect(only(check(juneBill({ tollsAndCharges: null })).energy).status).toBe('not_on_bill');
  });

  it('in the free market compare only what is itemised, and say a lower price is not flagged', () => {
    const { power } = check(freeBill());
    expect(only(power).status).toBe('matches');
    expect(only(power).calculation).toContainEqual({ key: 'tolls.free_market_price' });
    expect(only(check(juneBill()).power).calculation).not.toContainEqual({
      key: 'tolls.free_market_price',
    });
  });

  it('give no figure for a day of a year whose tables are not loaded', () => {
    const { power, energy } = check(
      juneBill({ readingFrom: parseDate('2026-12-15'), readingTo: parseDate('2027-01-14') }),
    );
    expect(only(power)).toMatchObject({ status: 'pending_official_data', amount: null });
    expect(only(power).calculation).toEqual([
      { key: 'official.missing', vars: { day: { date: '2027-01-01' } } },
    ]);
    expect(only(energy).status).toBe('pending_official_data');
  });

  it('leave the energy term unchecked when its price changes within the period', () => {
    const [row] = BILLS_TABLES.tolls;
    if (row === undefined) throw new Error('tolls');
    const split: Table<PowerEnergyPrices> = [
      { ...row, until: '2026-06-15' },
      {
        ...row,
        from: '2026-06-16',
        value: { ...row.value, energy: { ...row.value.energy, p1: 0.04 } },
      },
    ];
    const { power, energy } = check(juneBill(), {
      ...deps,
      tables: { ...BILLS_TABLES, tolls: split },
    });
    expect(only(energy).status).toBe('not_checkable');
    // The power term is still worked out day by day.
    expect(only(power).status).toBe('matches');
  });

  it('rest on a decree pending validation: shown, never counted', () => {
    const norms: NormTable = {
      ...BILLS_NORMS,
      cnmc_tolls_2026: { ...BILLS_NORMS.cnmc_tolls_2026, status: 'pending_validation' },
    };
    const { power } = check(juneBill({ tollsAndCharges: { power: 11.75, energy: 8.3 } }), {
      ...deps,
      norms,
    });
    expect(only(power)).toMatchObject({
      status: 'differs_from_official',
      amount: 1,
      pendingOn: ['cnmc_tolls_2026'],
    });
    expect(only(power).calculation.at(-1)).toEqual({ key: 'official.pending' });
  });
});
