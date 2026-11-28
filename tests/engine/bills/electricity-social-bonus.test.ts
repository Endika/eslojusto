import { describe, expect, it } from 'vitest';
import { billsPhrase as say } from '../../../src/engine/bills/calculation';
import { BILLS_NORMS } from '../../../src/engine/bills/data/norms';
import { NORMS_BEFORE_FIGURE } from './norms-before-figure';
import { BILLS_TABLES } from '../../../src/engine/bills/data/tables';
import {
  checkSocialBonus,
  type SocialBonusDeps,
} from '../../../src/engine/bills/electricity-social-bonus';
import { type BillItem } from '../../../src/engine/bills/finding';
import type { Table } from '../../../src/engine/bills/tables';
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
    for (const bill of [{ market: 'free' }, { retailer: 'other' }] as const) {
      const f = only(check({}, bill));
      expect(f).toMatchObject({ status: 'review_it', amount: null });
      expect(f.calculation).toEqual([say('bonus.free_market')]);
    }
  });

  it('in 2027 is pending an official figure', () => {
    const f = only(
      check({}, { readingFrom: parseDate('2026-12-15'), readingTo: parseDate('2027-01-14') }),
    );
    expect(f.status).toBe('pending_official_data');
  });
});

describe('the words of the social bonus', () => {
  const billed = (euros: number) => say('arithmetic.billed', { euros: { euros } });
  const lowest = (euros: number) =>
    say('bonus.lowest', { percent: { percent: 42.5 }, euros: { euros } });

  it('says the cap, the kWh the bill discounted when it says so, the lowest figure and its own', () => {
    const cap = say('bonus.cap', { kwh: { kwh: 130.44 } });
    expect(only(check({})).calculation).toEqual([
      cap,
      lowest(10.83),
      billed(10.83),
      say('tolerance.line'),
    ]);
    expect(only(check({ discountedKwh: 100 })).calculation).toEqual([
      cap,
      say('bonus.discounted_kwh', { kwh: { kwh: 100 } }),
      lowest(10.83),
      billed(10.83),
      say('tolerance.line'),
    ]);
  });

  it('takes a cent short as within the tolerance, and two as short', () => {
    expect(only(check({ amount: 10.82 })).status).toBe('matches');
    expect(only(check({ amount: 10.81 }))).toMatchObject({
      status: 'discount_lower',
      amount: 0.02,
    });
  });
});

describe('the social bonus when the tables change within the period', () => {
  const row = <V>(from: string, until: string | null, value: V, norm = 'rd897_2017' as const) => ({
    from,
    until,
    value,
    norm,
    url: BILLS_NORMS[norm].url,
  });
  const percents = (a: number, b: number) =>
    [
      row('2026-01-01', '2026-06-14', { vulnerable: a, severe: a + 10 }),
      row('2026-06-15', null, { vulnerable: b, severe: b + 10 }),
    ] satisfies Table<{ vulnerable: number; severe: number }>;
  const caps = (a: number, b: number) =>
    [
      row('2026-01-01', '2026-06-14', [a, 2222, 2698, 4761]),
      row('2026-06-15', null, [b, 2222, 2698, 4761]),
    ] satisfies Table<readonly number[]>;
  const withTables = (tables: Partial<SocialBonusDeps['tables']>, norms = BILLS_NORMS) => ({
    norms,
    tables: { ...BILLS_TABLES, ...tables },
  });
  const run = (
    change: Partial<SocialBonus>,
    custom: SocialBonusDeps,
    bill: Partial<ElectricityBillInput> = {},
  ) =>
    only(checkSocialBonus(juneBill({ ...bill, socialBonus: bonus(change) }), custom) as BillItem);

  it('takes the lowest percentage and the lowest cap of the year', () => {
    // 40 % of (11,92 + the cheapest 50 kWh at 0,10 = 5,00) = 6,768 → 6,77, with 1.000 − 950 left.
    const f = run(
      { kwhSoFar: 950, amount: 6.77 },
      withTables({ socialBonusDiscount: percents(40, 42.5), socialBonusCaps: caps(1000, 1587) }),
    );
    expect(f.status).toBe('matches');
    expect(f.calculation).toContainEqual(say('bonus.cap', { kwh: { kwh: 50 } }));
    expect(f.calculation).toContainEqual(
      say('bonus.lowest', { percent: { percent: 40 }, euros: { euros: 6.77 } }),
    );
  });

  it('takes the cap over the real length of a leap year when it is the lower', () => {
    // 1.587 × 30 / 366 = 130,0820 over the real year, 130,4384 over 365 days.
    const f = run(
      {},
      withTables({
        socialBonusDiscount: [row('2026-01-01', null, { vulnerable: 42.5, severe: 57.5 })],
        socialBonusCaps: [row('2026-01-01', null, [1587, 2222, 2698, 4761])],
      }),
      { readingFrom: parseDate('2028-05-31'), readingTo: parseDate('2028-06-30') },
    );
    expect(f.calculation).toContainEqual(say('bonus.cap', { kwh: { kwh: 130.08 } }));
  });

  describe('while a norm the tables rest on is not settled', () => {
    const open = {
      ...NORMS_BEFORE_FIGURE.rdl25_2026_november,
      inForceSince: '2026-06-01',
      inForceUntil: '2026-06-30',
    };
    const norms = { ...BILLS_NORMS, rdl25_2026_november: open };
    const unsettled = <V>(value: V) => [
      { ...row('2026-06-01', '2026-06-30', value), norm: 'rdl25_2026_november' as const },
    ];

    it.each([['the caps', { socialBonusCaps: unsettled([1587, 2222, 2698, 4761]) }]])(
      'cannot be checked when %s depend on it',
      (_, tables) => {
        const f = run({}, withTables(tables, norms));
        expect(f).toMatchObject({ status: 'not_checkable', amount: null });
        expect(f.calculation).toEqual([say('official.pending')]);
        expect(f.rows).toHaveLength(2);
      },
    );
  });

  it.each([
    ['discounts', 'socialBonusDiscount'],
    ['caps', 'socialBonusCaps'],
  ] as const)('gives no figure for a day the %s do not cover', (_, name) => {
    const late = BILLS_TABLES[name].map((r) => ({ ...r, from: '2026-06-10' }));
    const f = run({}, withTables({ [name]: late }));
    expect(f).toMatchObject({ id: 'social_bonus', status: 'pending_official_data' });
    expect(f.calculation).toEqual([say('official.missing', { day: { date: '2026-06-01' } })]);
    expect(f.sources.map((r) => r.id)).toEqual(['social_bonus_discount', 'social_bonus_cap']);
  });
});
