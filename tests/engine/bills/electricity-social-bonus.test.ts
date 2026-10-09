import { describe, expect, it } from 'vitest';
import { BILLS_NORMS } from '../../../src/engine/bills/data/norms';
import { BILLS_TABLES } from '../../../src/engine/bills/data/tables';
import {
  checkSocialBonus,
  type SocialBonusDeps,
} from '../../../src/engine/bills/electricity-social-bonus';
import { countedAmount, type BillItem } from '../../../src/engine/bills/finding';
import type { ElectricityBillInput, SocialBonus } from '../../../src/engine/bills/types';
import { parseDate } from '../../../src/engine/date';
import { juneBill, only } from './input';

const deps: SocialBonusDeps = { norms: BILLS_NORMS, tables: BILLS_TABLES };

const bonus = (change: Partial<SocialBonus>): SocialBonus => ({
  category: 'vulnerable',
  members: 3,
  discountedKwh: null,
  kwhSoFar: 500,
  amount: 10.83,
  ...change,
});

const check = (change: Partial<SocialBonus>, bill: Partial<ElectricityBillInput> = {}) => {
  const item = checkSocialBonus(juneBill({ ...bill, socialBonus: bonus(change) }), deps);
  if (item === null) throw new Error('no social bonus item');
  return item;
};

// 120 kWh, under the cap of the period: 30 × 0,20 + 40 × 0,15 + 50 × 0,10 = 17,00.
const UNDER_CAP: Partial<ElectricityBillInput> = {
  energy: [
    { period: 'p1', kwh: 30, price: 0.2, amount: 6 },
    { period: 'p2', kwh: 40, price: 0.15, amount: 6 },
    { period: 'p3', kwh: 50, price: 0.1, amount: 5 },
  ],
};

const outcome = (item: BillItem) => {
  const f = only(item);
  return { status: f.status, amount: f.amount, counted: countedAmount(item) };
};

// The June bill: 30 days, 250 kWh, power 11,92. The smallest cap of annex I shared out by day is
// 1.587 × 30 / 365 = 130,4384 kWh; its cheapest kWh are 120 × 0,10 + 10,4384 × 0,15 = 13,5658.
describe('the social bonus over the cap of the period', () => {
  // 42,5 % × (11,92 + 13,5658) = 10,8315 → 10,83.
  it('a vulnerable discount at its lowest figure matches', () => {
    const f = only(check({}));
    expect(f).toMatchObject({ id: 'social_bonus', status: 'matches', amount: null });
    expect(f.calculation).toContainEqual({ key: 'bonus.cap', vars: { kwh: { kwh: 130.44 } } });
    expect(f.calculation).toContainEqual({
      key: 'bonus.lowest',
      vars: { percent: { percent: 42.5 }, euros: { euros: 10.83 } },
    });
    expect(f.rows.map((r) => [r.norm, r.status])).toEqual([
      ['rdl7_2026', 'in_force'],
      ['rd897_2017', 'in_force'],
    ]);
    expect(f.sources.map((s) => s.id)).toEqual(['social_bonus_discount', 'social_bonus_cap']);
  });

  it('a vulnerable discount under it is counted and comes back every bill', () => {
    expect(outcome(check({ amount: 9 }))).toEqual({
      status: 'discount_lower',
      amount: 1.83,
      counted: 1.83,
    });
    expect(only(check({ amount: 9 })).recurring).toBe(true);
  });

  // 57,5 % × 25,4858 = 14,6543 → 14,65.
  it('a severe discount at the vulnerable percentage is counted', () => {
    expect(outcome(check({ category: 'severe' }))).toEqual({
      status: 'discount_lower',
      amount: 3.82,
      counted: 3.82,
    });
    expect(only(check({ category: 'severe', amount: 14.65 })).status).toBe('matches');
  });

  it('a discount over the lowest figure matches: only what every reading gives is checked', () => {
    expect(only(check({ amount: 12 })).status).toBe('matches');
  });
});

describe('the social bonus under the cap of the period', () => {
  // 42,5 % × (11,92 + 17,00) = 12,291 → 12,29; 57,5 % = 16,629 → 16,63.
  it.each([
    ['vulnerable', 12.29, 11, 1.29],
    ['severe', 16.63, 15, 1.63],
  ] as const)('%s: %s matches, %s is short by %s', (category, right, short, amount) => {
    expect(only(check({ category, amount: right }, UNDER_CAP)).status).toBe('matches');
    expect(outcome(check({ category, amount: short }, UNDER_CAP))).toEqual({
      status: 'discount_lower',
      amount,
      counted: amount,
    });
  });

  // With the year's kWh used up, only power: 42,5 % × 11,92 = 5,066 → 5,07.
  it('once the kWh of the year are used up, discounts only the power', () => {
    expect(only(check({ kwhSoFar: 1587, amount: 5.07 }, UNDER_CAP)).status).toBe('matches');
    expect(only(check({ kwhSoFar: 1587, amount: 4 }, UNDER_CAP)).amount).toBe(1.07);
  });
});

describe('a social bonus that cannot be checked', () => {
  it.each([
    [{ category: null }, 'not_checkable', 'bonus.category_unknown'],
    [{ kwhSoFar: null }, 'not_checkable', 'bonus.kwh_so_far_unknown'],
  ] as const)('%j: %s', (change, status, key) => {
    const f = only(check(change));
    expect(f).toMatchObject({ status, amount: null });
    expect(f.calculation).toEqual([{ key }]);
  });

  it('in the free market, or with another retailer, is sent to review', () => {
    for (const bill of [{ market: 'free' }, { retailer: 'other' }] as const)
      expect(only(check({}, bill))).toMatchObject({ status: 'review_it', amount: null });
  });

  it('in 2027 is pending an official figure', () => {
    const f = only(
      check({}, { readingFrom: parseDate('2026-12-15'), readingTo: parseDate('2027-01-14') }),
    );
    expect(f.status).toBe('pending_official_data');
  });

  it('gives nothing when the bill has no social bonus', () => {
    expect(checkSocialBonus(juneBill(), deps)).toBeNull();
  });
});
