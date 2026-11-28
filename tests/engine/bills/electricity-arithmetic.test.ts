import { describe, expect, it } from 'vitest';
import { BILLS_NORMS } from '../../../src/engine/bills/data/norms';
import { billsPhrase as say } from '../../../src/engine/bills/calculation';
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

  it('takes a bill that counts the day of the first reading, starting its period on that day', () => {
    expect(statusOf(juneBill({ billedDays: 31 }), 'days')?.status).toBe('matches');
    const power = { period: 'p1', kw: 4.6, price: 0.1, unit: 'per_kw_day', days: null } as const;
    const inclusive = juneBill({ billedDays: 31, power: [{ ...power, amount: 14.26 }] });
    expect(statusOf(inclusive, 'power', 0)?.status).toBe('matches');
  });

  it('counts the days from the day after the first reading to the last one', () => {
    const days = statusOf(juneBill({ billedDays: 32 }), 'days');
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

  it('words each line with the figures it was worked from', () => {
    const euros = (e: number) => ({ euros: e });
    const billed = (e: number) => say('arithmetic.billed', { euros: euros(e) });
    const tolerance = say('tolerance.line');
    const days = say('arithmetic.days', {
      from: { date: '2026-05-31' },
      to: { date: '2026-06-30' },
      days: { days: 30 },
    });
    expect(check(freeBill({ total: 64.03 })).map((f) => f.calculation)).toEqual([
      [days],
      [
        say('arithmetic.power_per_day', {
          kw: { kw: 4.6 },
          price: { price: 0.1, unit: 'per_kw_day' },
          days: { days: 30 },
          euros: euros(13.8),
        }),
        billed(13.8),
        tolerance,
      ],
      [
        say('arithmetic.power_per_day', {
          kw: { kw: 4.6 },
          price: { price: 0.01, unit: 'per_kw_day' },
          days: { days: 30 },
          euros: euros(1.38),
        }),
        billed(1.38),
        tolerance,
      ],
      ...[
        [60, 0.2, 12],
        [70, 0.15, 10.5],
        [120, 0.1, 12],
      ].map(([kwh, price, amount]) => [
        say('arithmetic.energy', {
          kwh: { kwh },
          price: { price, unit: 'per_kwh' },
          euros: euros(amount),
        }),
        billed(amount),
        tolerance,
      ]),
      [say('arithmetic.total', { euros: euros(64.03) }), billed(64.03), say('tolerance.total')],
    ]);
  });

  it('words a price per year with its figures', () => {
    expect(statusOf(juneBill(), 'power', 1)?.calculation[0]).toEqual(
      say('arithmetic.power_per_year', {
        kw: { kw: 4.6 },
        price: { price: 0.725423, unit: 'per_kw_year' },
        days: { days: 30 },
        euros: { euros: 0.27 },
      }),
    );
  });

  it.each([
    ['over', 32, 'arithmetic.refund_next_bill', 70, 'over'],
    ['under', 28, 'arithmetic.under_settled_later', 50, 'under'],
  ] as const)(
    'a bill that counts %s its days and its total cites the billing rules and says so',
    (_, billedDays, note, total, direction) => {
      const findings = check(juneBill({ billedDays, total }));
      const days = findings.find((f) => f.id === 'days');
      const sum = findings.find((f) => f.id === 'total');
      expect(days).toMatchObject({ status: 'does_not_add_up', direction, line: null });
      expect(days?.sources.map((s) => s.id)).toEqual(['billing']);
      expect(days?.calculation.at(-1)).toEqual(
        say('arithmetic.days_mismatch', { billed: { days: billedDays } }),
      );
      expect(sum?.sources.map((s) => s.id)).toEqual(['billing']);
      expect(sum?.calculation.slice(-4)).toEqual([
        say('arithmetic.total', { euros: { euros: 60.77 } }),
        say('arithmetic.billed', { euros: { euros: total } }),
        say('tolerance.total'),
        say(note),
      ]);
    },
  );

  it('cites no rule for what matches', () => {
    expect(check(juneBill()).flatMap((f) => f.sources)).toEqual([]);
  });

  it('points to each line that cannot be checked', () => {
    const findings = check(juneBill({ priceChange: 'without_segments' }));
    expect(findings.filter((f) => f.id === 'power').map((f) => f.line)).toEqual([0, 1]);
    expect(findings.filter((f) => f.id === 'energy').map((f) => f.line)).toEqual([0, 1, 2]);
    expect(findings[1]?.calculation).toEqual([say('arithmetic.price_change_without_segments')]);
  });

  it('adds up a bill with no tax, meter or VAT line', () => {
    const bare = juneBill({ electricityTax: null, meter: null, vat: null });
    expect(linesTotal(bare)).toBeCloseTo(60.77 - 2.4 - 0.8 - 10.55, 10);
  });

  it('shares a per-year price by 365 and 366 when only one end of the period is a leap year', () => {
    const power = [
      { period: 'p1', kw: 4.6, price: 30.817413, unit: 'per_kw_year', days: null, amount: 11.62 },
    ] as const;
    const across = (readingFrom: string, readingTo: string) =>
      statusOf(
        juneBill({
          readingFrom: parseDate(readingFrom),
          readingTo: parseDate(readingTo),
          billedDays: null,
          power: [...power],
        }),
        'power',
        0,
      )?.calculation;
    expect(across('2027-12-20', '2028-01-19')).toContainEqual(say('readings.both_bases'));
    expect(across('2028-12-20', '2029-01-19')).toContainEqual(say('readings.both_bases'));
  });
});
