import { describe, expect, it } from 'vitest';
import { BILLS_NORMS } from '../../../src/engine/bills/data/norms';
import { BILLS_TABLES } from '../../../src/engine/bills/data/tables';
import { checkVat, type VatDeps } from '../../../src/engine/bills/electricity-vat';
import { countedAmount, findingsOf, type BillItem } from '../../../src/engine/bills/finding';
import type { ElectricityBillInput, SocialBonus, VatLine } from '../../../src/engine/bills/types';
import { parseDate } from '../../../src/engine/date';
import { juneBill, mayBill, only } from './input';

const deps: VatDeps = { norms: BILLS_NORMS, tables: BILLS_TABLES };

const check = (input: ElectricityBillInput): BillItem => checkVat(input, deps);

const vat = (amount: number, percent: number | null = null): VatLine => ({
  base: null,
  percent,
  amount,
});

// The May bill falling due on another day of spring 2026, at another power. Its base is
// 43,52 + 0,40 + 0,80 = 44,72: 4,472 → 4,47 at 10 %, 9,3912 → 9,39 at 21 %.
const spring = (day: string, kw: number, line: VatLine): ElectricityBillInput =>
  mayBill({ dueOn: parseDate(day), contractedPower: { p1: kw, p2: kw }, vat: line });

const bonus = (category: SocialBonus['category']): SocialBonus => ({
  category,
  members: 2,
  discountedKwh: null,
  kwhSoFar: null,
  amount: 5,
});

const statuses = (item: BillItem) => findingsOf(item).map((f) => `${f.status}:${f.amount}`);

describe('VAT of a bill due in July 2026', () => {
  // (47,02 + 2,40 + 0,80) × 21 % = 10,5462 → 10,55.
  it('matches at 21 %', () => {
    const f = only(check(juneBill()));
    expect(f).toMatchObject({ id: 'vat', status: 'matches', amount: null });
    expect(f.rows.map((r) => [r.norm, r.from, r.until, r.status])).toEqual([
      ['law37_1992', '2026-07-01', '2026-07-31', 'in_force'],
    ]);
    expect(f.sources.map((s) => s.id)).toEqual(['vat']);
  });

  // 50,22 × 10 % = 5,022 → 5,02, against 10,55.
  it('at the reduced rate of spring is short, told apart by the rate it comes to', () => {
    const item = check(juneBill({ vat: vat(5.02) }));
    expect(only(item)).toMatchObject({
      status: 'wrong_rate_for_date',
      amount: 5.53,
      direction: 'under',
    });
    expect(countedAmount(item)).toBe(0);
  });
});

describe('VAT of a bill due in May 2026', () => {
  it('matches at 10 % for a supply under 10 kW', () => {
    const f = only(check(mayBill()));
    expect(f.status).toBe('matches');
    expect(f.rows.map((r) => [r.norm, r.from, r.until, r.status])).toEqual([
      ['rdl7_2026', '2026-04-30', '2026-05-31', 'in_force'],
    ]);
  });

  // 9,39 − 4,56: the difference is to the meter at 21 %, since the meter at the reduced rate is
  // not confirmed in a primary source, never to 4,47.
  it('at 21 % is counted, never resting on the meter at the reduced rate', () => {
    const item = check(mayBill({ vat: vat(9.39, 21) }));
    expect(only(item)).toMatchObject({
      status: 'wrong_rate_for_date',
      amount: 4.83,
      direction: 'over',
    });
    expect(countedAmount(item)).toBe(4.83);
  });

  it('over its own base at the right rate is a different base', () => {
    expect(only(check(mayBill({ vat: vat(5, 10) })))).toMatchObject({
      status: 'different_base',
      amount: 0.44,
      direction: 'over',
    });
  });

  // 10 % × 43,92 + 21 % × 0,80 = 4,392 + 0,168 = 4,56.
  it('with the meter at 21 % is sent to review with no figure', () => {
    const f = only(check(mayBill({ vat: vat(4.56, 10) })));
    expect(f).toMatchObject({ status: 'review_it', amount: null });
    expect(f.calculation.at(-1)).toEqual({ key: 'vat.meter_reduced' });
  });

  // A service of 5 €: 4,47 with it out, 4,97 at 10 %, 5,52 at 21 %.
  it.each([4.47, 4.97, 5.52])('matches at %s with a service in, out or at 21 %', (amount) => {
    const input = mayBill({
      market: 'free',
      retailer: 'other',
      services: [{ label: 'maintenance', amount: 5, requested: 'yes' }],
      vat: vat(amount),
    });
    const f = only(check(input));
    expect(f.status).toBe('matches');
    expect(f.calculation).toContainEqual({ key: 'tax.parts_either' });
  });

  // 12 kW with the social bonus of 5 €: (44,72 − 5) × 10 % = 3,972 → 3,97; × 21 % = 8,3412 → 8,34.
  it('reaches a severely vulnerable holder whatever the power', () => {
    const f = only(
      check({
        ...mayBill(),
        contractedPower: { p1: 12, p2: 12 },
        socialBonus: bonus('severe'),
        vat: vat(3.97),
      }),
    );
    expect(f.status).toBe('matches');
    expect(f.calculation).toContainEqual({ key: 'vat.severe_reduced' });
  });

  it('gives both rates over 10 kW when the bill does not say which social bonus', () => {
    const item = check({
      ...mayBill(),
      contractedPower: { p1: 12, p2: 12 },
      socialBonus: bonus(null),
      vat: vat(8.34),
    });
    expect(statuses(item)).toEqual(['wrong_rate_for_date:4.28', 'matches:null']);
    expect(countedAmount(item)).toBe(0);
  });

  it('gives both rates when one power period is under the limit and the other is not', () => {
    const item = check({ ...mayBill(), contractedPower: { p1: 9.9, p2: 12 }, vat: vat(4.47) });
    expect(statuses(item)).toEqual(['matches:null', 'wrong_rate_for_date:4.92']);
    expect(findingsOf(item)[0]?.calculation).toContainEqual({ key: 'vat.power_periods_apart' });
  });
});

describe('VAT of a supply of exactly 10 kW in April 2026', () => {
  it('gives two readings while RDL 7/2026 says «inferior a», and counts neither', () => {
    for (const [amount, expected] of [
      [4.47, ['matches:null', 'wrong_rate_for_date:4.92']],
      [9.39, ['wrong_rate_for_date:4.83', 'matches:null']],
    ] as const) {
      const item = check(spring('2026-04-20', 10, vat(amount)));
      expect(item.kind).toBe('readings');
      expect(statuses(item)).toEqual(expected);
      expect(countedAmount(item)).toBe(0);
      expect(findingsOf(item)[0]?.calculation).toContainEqual({
        key: 'vat.power_at_limit',
        vars: { kw: { kw: 10 } },
      });
    }
  });

  it('gives the reduced rate under 10 kW, and at 10 kW from 30-04-2026', () => {
    expect(only(check(spring('2026-04-20', 9.9, vat(4.47)))).status).toBe('matches');
    const f = only(check(spring('2026-04-30', 10, vat(4.47))));
    expect(f.status).toBe('matches');
    expect(f.rows.map((r) => r.norm)).toEqual(['rdl7_2026']);
  });
});

describe('VAT of a bill due in November 2026', () => {
  // 50,22 × 10 % = 5,02 or × 21 % = 10,55, until the CPI figure and the validation are in.
  it('gives two readings, the lowest counted', () => {
    const item = check(juneBill({ dueOn: parseDate('2026-11-10') }));
    expect(statuses(item)).toEqual(['wrong_rate_for_date:5.44', 'matches:null']);
    expect(countedAmount(item)).toBe(0);
    for (const f of findingsOf(item))
      expect(f.dependsOn).toEqual(['rdl25_2026_november', 'rdl25_2026']);
  });
});

describe('VAT on a day with no rate loaded', () => {
  it('is pending an official figure in 2027', () => {
    expect(only(check(juneBill({ dueOn: parseDate('2027-01-08') }))).status).toBe(
      'pending_official_data',
    );
  });

  it('a bill with no VAT line says so', () => {
    expect(only(check(juneBill({ vat: null }))).status).toBe('not_on_bill');
  });
});
