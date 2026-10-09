import { describe, expect, it } from 'vitest';
import { BILLS_NORMS } from '../../../src/engine/bills/data/norms';
import { powerUsed } from '../../../src/engine/bills/electricity-power';
import { freeBill, juneBill, only } from './input';

describe('the power used', () => {
  it('shows the contracted power, the highest used and what a kW of P1 costs a year', () => {
    const f = only(powerUsed(juneBill(), BILLS_NORMS));
    expect(f).toMatchObject({ id: 'power_used', status: 'information', amount: null });
    expect(f.calculation).toEqual([
      { key: 'power.contracted', vars: { p1: { kw: 4.6 }, p2: { kw: 4.6 } } },
      { key: 'power.max_used', vars: { p1: { kw: 3.1 }, p2: { kw: 1.2 } } },
      { key: 'power.p1_cost_year', vars: { euros: { euros: 30.82 } } },
      { key: 'power.change_once_a_year' },
    ]);
    expect(f.sources.map((s) => s.id)).toEqual(['power_change']);
  });

  it('turns a daily price into a yearly one, and leaves it out when the prices differ', () => {
    expect(only(powerUsed(freeBill(), BILLS_NORMS)).calculation[2]).toEqual({
      key: 'power.p1_cost_year',
      vars: { euros: { euros: 36.5 } },
    });
    const twoPrices = freeBill({
      power: [
        { period: 'p1', kw: 4.6, price: 0.1, unit: 'per_kw_day', days: 10, amount: 4.6 },
        { period: 'p1', kw: 4.6, price: 0.12, unit: 'per_kw_day', days: 20, amount: 11.04 },
      ],
      maxPowerUsed: { p1: null, p2: null },
    });
    expect(only(powerUsed(twoPrices, BILLS_NORMS)).calculation.map((p) => p.key)).toEqual([
      'power.contracted',
      'power.max_used_unknown',
      'power.change_once_a_year',
    ]);
  });
});
