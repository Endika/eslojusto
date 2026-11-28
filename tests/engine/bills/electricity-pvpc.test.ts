import { describe, expect, it } from 'vitest';
import { billsPhrase as say } from '../../../src/engine/bills/calculation';
import { BILLS_NORMS } from '../../../src/engine/bills/data/norms';
import { NORMS_BEFORE_FIGURE } from './norms-before-figure';
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
import { parseDate } from '../../../src/engine/date';
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
    [{}, 'matches', say('pvpc.eligible')],
    [{ contractedPower: { p1: 10, p2: 10 } }, 'matches', say('pvpc.eligible')],
    [
      { contractedPower: { p1: 10.01, p2: 4.6 } },
      'tariff_not_allowed',
      say('pvpc.power_over_10kw', { p1: { kw: 10.01 }, p2: { kw: 4.6 } }),
    ],
    [
      { contractedPower: { p1: 4.6, p2: 10.01 } },
      'tariff_not_allowed',
      say('pvpc.power_over_10kw', { p1: { kw: 4.6 }, p2: { kw: 10.01 } }),
    ],
    [{ holder: 'microenterprise' }, 'matches', say('pvpc.eligible')],
    [{ holder: 'other' }, 'tariff_not_allowed', say('pvpc.holder_not_allowed')],
    [{ holder: null }, 'not_checkable', say('pvpc.holder_unknown')],
    [{ retailer: 'other' }, 'review_it', say('pvpc.not_reference_retailer')],
    [{ retailer: 'unknown' }, 'not_checkable', say('pvpc.retailer_unknown')],
  ] as const)('%j: %s', (change, status, phrase) => {
    const f = only(checkPvpcEligibility(juneBill(change), BILLS_NORMS));
    expect(f.status).toBe(status);
    expect(f.amount).toBeNull();
    expect(f.calculation).toEqual([phrase]);
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

describe('the words and rules of the PVPC terms', () => {
  const billed = (euros: number) => say('arithmetic.billed', { euros: { euros } });
  const rulesOf = (f: { sources: readonly { id: string }[] }) => f.sources.map((r) => r.id);

  it('word each term with its figures and cite its own rules', () => {
    const f = byId(juneBill());
    expect(f['pvpc_power_p1']?.calculation).toEqual([
      say('pvpc.power_p1', { kw: { kw: 4.6 }, euros: { euros: 11.65 } }),
      billed(11.65),
      say('pvpc.margin_not_updated'),
    ]);
    expect(rulesOf(f['pvpc_power_p1'] as never)).toEqual(['tolls', 'charges', 'pvpc_margin']);
    expect(f['pvpc_power_p2']?.calculation).toEqual([
      say('pvpc.power_p2', { kw: { kw: 4.6 }, euros: { euros: 0.27 } }),
      billed(0.27),
    ]);
    expect(rulesOf(f['pvpc_power_p2'] as never)).toEqual(['tolls', 'charges']);
    expect(f['social_bonus_funding']?.calculation).toEqual([
      say('funding.days', { euros: { euros: 0.6 } }),
      billed(0.6),
    ]);
  });

  it('give no term for a power with no line, and keep the rest', () => {
    const ids = (power: PowerLine[]) => checkPvpc(juneBill({ power }), deps).map((i) => only(i).id);
    expect(ids([p2(0.27)])).toEqual(['pvpc_eligibility', 'pvpc_power_p2', 'social_bonus_funding']);
    expect(ids([p1(11.65)])).toEqual(['pvpc_eligibility', 'pvpc_power_p1', 'social_bonus_funding']);
  });

  it('say which day no row covers, instead of a figure', () => {
    const row = <V>(table: Table<V>): Table<V> => table.map((r) => ({ ...r, from: '2026-06-10' }));
    const late = (name: 'tolls' | 'pvpcMargin' | 'socialBonusFunding'): PvpcDeps => ({
      norms: BILLS_NORMS,
      tables: { ...BILLS_TABLES, [name]: row(BILLS_TABLES[name] as Table<unknown>) },
    });
    const pending = (name: 'tolls' | 'pvpcMargin' | 'socialBonusFunding') =>
      Object.values(byId(juneBill(), late(name)))
        .filter((f) => f.status === 'pending_official_data')
        .map((f) => [f.id, f.calculation, rulesOf(f)]);
    const missing = [say('official.missing', { day: { date: '2026-06-01' } })];
    expect(pending('tolls')).toEqual([
      ['pvpc_power_p1', missing, ['tolls', 'charges', 'pvpc_margin']],
      ['pvpc_power_p2', missing, ['tolls', 'charges']],
    ]);
    expect(pending('pvpcMargin')).toEqual([
      ['pvpc_power_p1', missing, ['tolls', 'charges', 'pvpc_margin']],
    ]);
    expect(pending('socialBonusFunding')).toEqual([
      [
        'social_bonus_funding',
        missing,
        ['social_bonus_funding_until_june', 'social_bonus_funding'],
      ],
    ]);
    const freeLate = checkPvpc(freeBill({ socialBonusFunding: 0.6 }), late('socialBonusFunding'));
    expect(freeLate.map((i) => only(i).status)).toEqual(['pending_official_data']);
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
    const f = only(funding(juneBill({ socialBonusFunding: null })));
    expect(f).toMatchObject({ id: 'social_bonus_funding', status: 'not_on_bill' });
    expect(f.calculation).toEqual([say('funding.not_on_bill')]);
    expect(f.rows).toHaveLength(2);
  });

  it('in the free market, one above the order is sent to review with no figure', () => {
    expect(checkSocialBonusFunding(freeBill({ socialBonusFunding: null }), deps)).toBeNull();
    expect(only(funding(freeBill({ socialBonusFunding: 0.6 }))).status).toBe('matches');
    expect(only(funding(freeBill({ socialBonusFunding: 0.4 }))).status).toBe('matches');
    const above = only(funding(freeBill({ socialBonusFunding: 0.9 })));
    expect(above).toMatchObject({ id: 'social_bonus_funding', status: 'review_it', amount: null });
    expect(only(funding(freeBill({ socialBonusFunding: 0.6 })))).toMatchObject({
      id: 'social_bonus_funding',
      status: 'matches',
    });
    expect(above.calculation).toEqual([
      say('funding.days', { euros: { euros: 0.6 } }),
      say('arithmetic.billed', { euros: { euros: 0.9 } }),
      say('funding.free_market_above'),
    ]);
  });

  // A whole leap year at 3,65 €/year: 3,65 over 366 days, or 3,66 over 365.
  it('in the free market, one within a cent of the highest of the two bases is not above it', () => {
    const table: Table<number> = [
      {
        from: '2027-01-01',
        until: null,
        value: 3.65,
        norm: 'order_ted634_2026',
        url: BILLS_NORMS.order_ted634_2026.url,
      },
    ];
    const leap = (socialBonusFunding: number) =>
      only(
        funding(
          freeBill({
            readingFrom: parseDate('2027-12-31'),
            readingTo: parseDate('2028-12-31'),
            billedDays: null,
            socialBonusFunding,
          }),
          { norms: BILLS_NORMS, tables: { ...BILLS_TABLES, socialBonusFunding: table } },
        ),
      ).status;
    expect(leap(3.67)).toBe('matches');
    expect(leap(3.68)).toBe('review_it');
  });

  it('while a norm is not settled, gives both readings and counts only the lower', () => {
    const conditional = {
      ...NORMS_BEFORE_FIGURE.rdl25_2026_november,
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
