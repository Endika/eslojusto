import { describe, expect, it } from 'vitest';
import { BILLS_NORMS } from '../../../src/engine/bills/data/norms';
import { checkArithmetic, linesTotal } from '../../../src/engine/bills/electricity-arithmetic';
import { countedAmount, findingsOf } from '../../../src/engine/bills/finding';
import type { ElectricityBillInput } from '../../../src/engine/bills/types';
import { parseDate } from '../../../src/engine/date';
import { freeBill, juneBill, only } from './input';

const check = (input: ElectricityBillInput) => checkArithmetic(input, BILLS_NORMS).map(only);

const statusOf = (input: ElectricityBillInput, id: string, line: number | null = null) =>
  check(input).find((f) => f.id === id && f.line === line);

describe('the bill against its own figures', () => {
  it('a bill that adds up gives no difference at all', () => {
    const findings = check(juneBill());
    expect(findings.map((f) => `${f.id}${f.line ?? ''}:${f.status}`)).toEqual([
      'days:matches',
      'power0:matches',
      'power1:matches',
      'energy0:matches',
      'energy1:matches',
      'energy2:matches',
      'total:matches',
    ]);
    expect(findings.every((f) => f.amount === null)).toBe(true);
  });

  it('counts the days from the day after the first reading to the last one', () => {
    const days = statusOf(juneBill({ billedDays: 31 }), 'days');
    expect(days).toMatchObject({ status: 'does_not_add_up', direction: 'over', amount: null });
    expect(days?.calculation[0]).toEqual({
      key: 'arithmetic.days',
      vars: { from: { date: '2026-05-31' }, to: { date: '2026-06-30' }, days: { days: 30 } },
    });
  });

  it('a power line priced per kW and day: 4,6 × 0,1 × 30 = 13,80', () => {
    expect(statusOf(freeBill(), 'power', 0)?.status).toBe('matches');
    const over = juneBill({
      power: [{ period: 'p1', kw: 4.6, price: 0.1, unit: 'per_kw_day', days: null, amount: 13.85 }],
    });
    expect(statusOf(over, 'power', 0)).toMatchObject({
      status: 'does_not_add_up',
      amount: 0.05,
      direction: 'over',
    });
  });

  it('a power line priced per kW and year, within a cent of 11,65', () => {
    const line = {
      period: 'p1',
      kw: 4.6,
      price: 30.817413,
      unit: 'per_kw_year',
      days: null,
    } as const;
    const billed = (amount: number) =>
      statusOf(juneBill({ power: [{ ...line, amount }] }), 'power', 0);
    expect(billed(11.66)?.status).toBe('matches');
    expect(billed(11.64)?.status).toBe('matches');
    // 11,63 is 0,02 under 11,65: shown as charged short, never counted.
    const under = billed(11.63);
    expect(under).toMatchObject({ status: 'does_not_add_up', amount: 0.02, direction: 'under' });
    expect(under?.calculation.at(-1)).toEqual({ key: 'arithmetic.under_settled_later' });
  });

  it('a charge over its own price is settled in the next bill, and cites the billing rules', () => {
    const f = statusOf(
      juneBill({ energy: [{ period: 'p1', kwh: 60, price: 0.2, amount: 12.5 }] }),
      'energy',
      0,
    );
    expect(f).toMatchObject({ status: 'does_not_add_up', amount: 0.5, direction: 'over' });
    expect(f?.calculation.at(-1)).toEqual({ key: 'arithmetic.refund_next_bill' });
    expect(f?.sources.map((s) => s.id)).toEqual(['billing']);
  });

  it('never counts a sum that does not add up towards what is paid over', () => {
    const items = checkArithmetic(juneBill({ total: 70 }), BILLS_NORMS);
    expect(items.map(countedAmount)).toEqual(items.map(() => 0));
  });

  it('adds every line up to the total, with two cents of slack', () => {
    expect(linesTotal(juneBill())).toBeCloseTo(60.77, 10);
    expect(statusOf(juneBill({ total: 60.79 }), 'total')?.status).toBe('matches');
    expect(statusOf(juneBill({ total: 60.8 }), 'total')).toMatchObject({
      status: 'does_not_add_up',
      amount: 0.03,
      direction: 'over',
    });
  });

  it('takes off discounts and the social bonus, and adds services and regularizations', () => {
    const input = juneBill({
      discounts: [5],
      socialBonus: {
        category: 'vulnerable',
        members: 2,
        discountedKwh: 250,
        kwhSoFar: null,
        amount: 10,
      },
      services: [{ label: 'maintenance', amount: 4, requested: 'yes' }],
      regularizations: [-1.5],
      total: 60.77 - 5 - 10 + 4 - 1.5,
    });
    expect(statusOf(input, 'total')?.status).toBe('matches');
  });

  it('a price that changed within the period without its stretches cannot be checked', () => {
    const findings = check(juneBill({ priceChange: 'without_segments' }));
    expect(
      findings.filter((f) => f.id === 'power' || f.id === 'energy').map((f) => f.status),
    ).toEqual(Array(5).fill('not_checkable'));
    expect(findings.find((f) => f.id === 'total')?.status).toBe('matches');
  });

  it('checks each stretch on its own days when the bill gives them', () => {
    const input = juneBill({
      priceChange: 'by_segments',
      power: [
        // 4,6 × 0,1 × 20 = 9,20 and 4,6 × 0,12 × 10 = 5,52.
        { period: 'p1', kw: 4.6, price: 0.1, unit: 'per_kw_day', days: 20, amount: 9.2 },
        { period: 'p1', kw: 4.6, price: 0.12, unit: 'per_kw_day', days: 10, amount: 5.6 },
      ],
    });
    expect(
      check(input)
        .filter((f) => f.id === 'power')
        .map((f) => [f.status, f.amount]),
    ).toEqual([
      ['matches', null],
      ['does_not_add_up', 0.08],
    ]);
  });

  it('in a leap year takes 365 or 366 days, since no norm says which', () => {
    // 4,6 × 30,817413 × 30 / 366 = 11,6197 → 11,62; / 365 = 11,6515 → 11,65.
    const leap = (amount: number) =>
      juneBill({
        readingFrom: parseDate('2028-05-31'),
        readingTo: parseDate('2028-06-30'),
        power: [
          { period: 'p1', kw: 4.6, price: 30.817413, unit: 'per_kw_year', days: null, amount },
        ],
      });
    expect(statusOf(leap(11.62), 'power', 0)?.status).toBe('matches');
    expect(statusOf(leap(11.65), 'power', 0)?.status).toBe('matches');
    expect(statusOf(leap(11.65), 'power', 0)?.calculation).toContainEqual({
      key: 'readings.both_bases',
    });
    expect(statusOf(juneBill(), 'power', 0)?.calculation).not.toContainEqual({
      key: 'readings.both_bases',
    });
  });

  it('gives a single reading for every line: it rests on no table', () => {
    expect(
      checkArithmetic(juneBill(), BILLS_NORMS).every((item) => findingsOf(item).length === 1),
    ).toBe(true);
  });
});
