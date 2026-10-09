import { describe, expect, it } from 'vitest';
import { BILLS_NORMS } from '../../../src/engine/bills/data/norms';
import { BILLS_TABLES } from '../../../src/engine/bills/data/tables';
import {
  checkPvpc,
  checkPvpcEligibility,
  checkSocialBonusFunding,
  type PvpcDeps,
} from '../../../src/engine/bills/electricity-pvpc';
import { countedAmount, findingsOf, type BillItem } from '../../../src/engine/bills/finding';
import type { NormTable } from '../../../src/engine/bills/norms';
import type { Table } from '../../../src/engine/bills/tables';
import type { ElectricityBillInput, PowerLine } from '../../../src/engine/bills/types';
import { freeBill, juneBill, only } from './input';

const deps: PvpcDeps = { norms: BILLS_NORMS, tables: BILLS_TABLES };

const byId = (input: ElectricityBillInput, with_: PvpcDeps = deps) =>
  Object.fromEntries(checkPvpc(input, with_).map((item) => [only(item).id, only(item)]));

const p1 = (amount: number): PowerLine => ({
  period: 'p1',
  kw: 4.6,
  price: 30.817413,
  unit: 'per_kw_year',
  days: null,
  amount,
});
const p2 = (amount: number): PowerLine => ({ ...p1(amount), period: 'p2', price: 0.725423 });

const funding = (input: ElectricityBillInput, with_: PvpcDeps = deps): BillItem => {
  const item = checkSocialBonusFunding(input, with_);
  if (item === null) throw new Error('no funding item');
  return item;
};

describe('who may be on the PVPC', () => {
  it.each([
    [{}, 'matches'],
    [{ contractedPower: { p1: 10, p2: 10 } }, 'matches'],
    [{ contractedPower: { p1: 10.01, p2: 4.6 } }, 'tariff_not_allowed'],
    [{ holder: 'microenterprise' }, 'matches'],
    [{ holder: 'other' }, 'tariff_not_allowed'],
    [{ holder: null }, 'not_checkable'],
    [{ retailer: 'other' }, 'review_it'],
    [{ retailer: 'unknown' }, 'not_checkable'],
  ] as const)('%j: %s', (change, status) => {
    const f = only(checkPvpcEligibility(juneBill(change), BILLS_NORMS));
    expect(f.status).toBe(status);
    expect(f.amount).toBeNull();
    expect(f.sources.map((s) => s.id)).toEqual(['pvpc_eligibility']);
  });
});

describe('the PVPC terms of the June bill', () => {
  it('match: P1 with the fixed margin, P2, and the funding across 26-06', () => {
    const f = byId(juneBill());
    expect(Object.values(f).map((x) => `${x.id}:${x.status}`)).toEqual([
      'pvpc_eligibility:matches',
      'pvpc_power_p1:matches',
      'pvpc_power_p2:matches',
      'social_bonus_funding:matches',
    ]);
    expect(f['pvpc_power_p1']?.calculation).toContainEqual({ key: 'pvpc.margin_not_updated' });
  });

  it('P1 rests on the 2016 margin, flagged in its row', () => {
    const margin = byId(juneBill())['pvpc_power_p1']?.rows.find(
      (r) => r.norm === 'order_etu1948_2016',
    );
    expect(margin).toMatchObject({ doubt: 'ccf_not_updated_since_2016', status: 'in_force' });
  });

  it('a P1 that differs from the margin is sent to review with no figure', () => {
    const f = byId(juneBill({ power: [p1(12.5), p2(0.27)] }))['pvpc_power_p1'];
    expect(f).toMatchObject({ status: 'review_it', amount: null, direction: null });
    expect(f?.calculation.at(-1)).toEqual({ key: 'pvpc.margin_differs' });
  });

  it('a P2 over the regulated price is counted and comes back every bill', () => {
    const item = checkPvpc(juneBill({ power: [p1(11.65), p2(0.5)] }), deps)[2];
    if (item === undefined) throw new Error('P2');
    // 0,50 − 0,27 = 0,23.
    expect(only(item)).toMatchObject({
      id: 'pvpc_power_p2',
      status: 'above_regulated_price',
      amount: 0.23,
      direction: 'over',
      recurring: true,
    });
    expect(countedAmount(item)).toBe(0.23);
  });

  it('a P2 under the regulated price is shown and never counted', () => {
    const item = checkPvpc(juneBill({ power: [p1(11.65), p2(0.2)] }), deps)[2];
    if (item === undefined) throw new Error('P2');
    expect(only(item)).toMatchObject({
      status: 'differs_from_official',
      amount: 0.07,
      direction: 'under',
    });
    expect(countedAmount(item)).toBe(0);
  });

  it('a free-market bill gets no PVPC terms', () => {
    expect(checkPvpc(freeBill({ socialBonusFunding: null }), deps)).toEqual([]);
  });
});

describe('the social bonus funding, by day', () => {
  // 25 days at 6,979247 €/year and 5 at 9,011295 €/year: 0,6015 → 0,60.
  it('across the change of 26-06-2026 cites both orders', () => {
    const f = only(funding(juneBill()));
    expect(f.status).toBe('matches');
    expect(f.rows.map((r) => [r.norm, r.from, r.until])).toEqual([
      ['order_ted1524_2025', '2026-01-01', '2026-06-25'],
      ['order_ted634_2026', '2026-06-26', '2026-12-31'],
    ]);
  });

  it('the new figure on every day is over the regulated price: 0,74 − 0,60', () => {
    expect(only(funding(juneBill({ socialBonusFunding: 0.74 })))).toMatchObject({
      status: 'above_regulated_price',
      amount: 0.14,
      recurring: true,
    });
  });

  it('the old figure on every day is short: 0,57 against 0,60', () => {
    expect(only(funding(juneBill({ socialBonusFunding: 0.57 })))).toMatchObject({
      status: 'differs_from_official',
      amount: 0.03,
      direction: 'under',
    });
  });

  it('must come apart on the PVPC', () => {
    expect(only(funding(juneBill({ socialBonusFunding: null }))).status).toBe('not_on_bill');
  });

  it('in the free market, one above the order is sent to review with no figure', () => {
    expect(checkSocialBonusFunding(freeBill({ socialBonusFunding: null }), deps)).toBeNull();
    expect(only(funding(freeBill({ socialBonusFunding: 0.6 }))).status).toBe('matches');
    expect(only(funding(freeBill({ socialBonusFunding: 0.4 }))).status).toBe('matches');
    expect(only(funding(freeBill({ socialBonusFunding: 0.9 })))).toMatchObject({
      status: 'review_it',
      amount: null,
    });
  });

  it('while a norm is not settled, gives both readings and counts only the lower', () => {
    const conditional = {
      ...BILLS_NORMS.rdl25_2026_november,
      inForceSince: '2026-06-01',
      inForceUntil: '2026-06-30',
    };
    const norms: NormTable = { ...BILLS_NORMS, rdl25_2026_november: conditional };
    const table: Table<number> = [
      {
        from: '2026-06-01',
        until: '2026-06-30',
        value: 9.011295,
        norm: 'rdl25_2026_november',
        url: conditional.url,
      },
      {
        from: '2026-06-01',
        until: '2026-06-30',
        value: 6.979247,
        norm: 'order_ted1524_2025',
        url: BILLS_NORMS.order_ted1524_2025.url,
        unless: ['rdl25_2026_november'],
      },
    ];
    const item = funding(juneBill({ socialBonusFunding: 0.74 }), {
      norms,
      tables: { ...BILLS_TABLES, socialBonusFunding: table },
    });
    expect(item.kind).toBe('readings');
    // 30 days at 6,979247: 0,57, so 0,17 over; at 9,011295: 0,74, matches.
    expect(findingsOf(item).map((f) => [f.status, f.amount])).toEqual([
      ['above_regulated_price', 0.17],
      ['matches', null],
    ]);
    expect(findingsOf(item).every((f) => f.pendingOn.includes('rdl25_2026_november'))).toBe(true);
    expect(countedAmount(item)).toBe(0);
  });
});
