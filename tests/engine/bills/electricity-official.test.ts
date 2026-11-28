import { describe, expect, it } from 'vitest';
import { TOLL_HOLIDAYS } from '../../../src/engine/bills/data/holidays-20td';
import { officialFigures, type PvpcHourly } from '../../../src/engine/bills/electricity-official';
import { pvpcTable } from '../../../src/engine/bills/data/pvpc-hourly';
import raw from '../../../src/engine/bills/data/pvpc-hourly.json';
import { parseDate } from '../../../src/engine/date';
import { freeBill, juneBill } from './input';

// A made-up PVPC: each hour at 100 € plus its hour, so on a working weekday P1 and P2 both average
// 115,50 €/MWh, P3 103,50 and the whole day 111,50.
const day = Array.from({ length: 24 }, (_, h) => [h, 100 + h] as const);
const pvpc: PvpcHourly = {
  coveredUntil: '2026-10-14',
  days: { '2026-10-12': day, '2026-10-13': day, '2026-10-14': day },
};
const deps = { pvpc, tollHolidays: TOLL_HOLIDAYS };

// Tuesday 13 and Wednesday 14 October 2026.
const twoDays = {
  readingFrom: parseDate('2026-10-12'),
  readingTo: parseDate('2026-10-14'),
  billedDays: 2,
  energy: [
    { period: 'p1', kwh: 60, price: 0.2, amount: 12 },
    { period: 'p2', kwh: 40, price: 0.15, amount: 6 },
    { period: 'p3', kwh: 100, price: 0.1, amount: 10 },
  ],
} as const;

describe('the official figures of the paid report', () => {
  it('sets each period of the energy beside the mean PVPC of its hours on the billed days', () => {
    expect(officialFigures(freeBill(twoDays), deps).energy).toEqual({
      kind: 'compared',
      singlePrice: false,
      periods: [
        { period: 'p1', kwh: 60, yourPrice: 0.2, pvpcPrice: 0.1155, yourCost: 12, pvpcCost: 6.93 },
        { period: 'p2', kwh: 40, yourPrice: 0.15, pvpcPrice: 0.1155, yourCost: 6, pvpcCost: 4.62 },
        {
          period: 'p3',
          kwh: 100,
          yourPrice: 0.1,
          pvpcPrice: 0.1035,
          yourCost: 10,
          pvpcCost: 10.35,
        },
      ],
      yourCost: 28,
      pvpcCost: 21.9,
    });
  });

  it('counts a toll holiday as P3 all day', () => {
    // 12 October, a Monday and a toll holiday, adds 24 P3 hours averaging 111,50.
    const energy = officialFigures(
      freeBill({ ...twoDays, readingFrom: parseDate('2026-10-11'), billedDays: 3 }),
      deps,
    ).energy;
    expect(energy?.kind === 'compared' && energy.periods.map((p) => p.pvpcPrice)).toEqual([
      0.1155, 0.1155,
      // (8 × 103,50 + 24 × 111,50 + 8 × 103,50) / 40 = 108,30.
      0.1083,
    ]);
  });

  it('compares one price for all the energy with the mean of every hour', () => {
    const energy = officialFigures(
      freeBill({ ...twoDays, energy: [{ period: 'all', kwh: 200, price: 0.14, amount: 28 }] }),
      deps,
    ).energy;
    expect(energy).toMatchObject({
      kind: 'compared',
      singlePrice: true,
      periods: [{ period: 'all', kwh: 200, pvpcPrice: 0.1115, yourCost: 28, pvpcCost: 22.3 }],
    });
  });

  it('gives no energy figure for a PVPC bill, nor while a day or its holidays are missing', () => {
    expect(officialFigures(juneBill(twoDays), deps).energy).toEqual({ kind: 'pvpc_bill' });
    const lateDay = freeBill({ ...twoDays, readingTo: parseDate('2026-10-15'), billedDays: 3 });
    expect(officialFigures(lateDay, deps).energy).toEqual({ kind: 'pending' });
    expect(officialFigures(freeBill(twoDays), { pvpc, tollHolidays: [] }).energy).toEqual({
      kind: 'pending',
    });
  });

  it('gives no figure when a period has kWh but no hour in the billed days', () => {
    // Saturday 17 and Sunday 18 October have no P1 hour, yet the bill puts 60 kWh there.
    const weekend = {
      days: Object.fromEntries(['2026-10-17', '2026-10-18'].map((d) => [d, day])),
      coveredUntil: '2026-10-18',
    };
    const bill = freeBill({
      ...twoDays,
      readingFrom: parseDate('2026-10-16'),
      readingTo: parseDate('2026-10-18'),
    });
    expect(officialFigures(bill, { pvpc: weekend, tollHolidays: TOLL_HOLIDAYS }).energy).toEqual({
      kind: 'pending',
    });
  });

  it('sets the contracted power beside the highest used and what each kW costs a year', () => {
    // 0,10 €/kW a day is 36,50 a year; 1,5 kW above the 3,1 used cost 54,75.
    expect(officialFigures(freeBill(twoDays), deps).power).toEqual([
      {
        period: 'p1',
        contracted: 4.6,
        maxUsed: 3.1,
        perKwYear: 36.5,
        unusedKw: 1.5,
        unusedPerYear: 54.75,
        aboveContracted: false,
      },
      {
        period: 'p2',
        contracted: 4.6,
        maxUsed: 1.2,
        perKwYear: 3.65,
        unusedKw: 3.4,
        unusedPerYear: 12.41,
        aboveContracted: false,
      },
    ]);
  });

  it('says when the power used went above the contracted, and gives none without it', () => {
    const above = officialFigures(
      freeBill({
        ...twoDays,
        contractedPower: { p1: 5.75, p2: 5.75 },
        maxPowerUsed: { p1: 4.868, p2: 6 },
      }),
      deps,
    ).power;
    expect(above?.map((p) => [p.aboveContracted, p.unusedKw])).toEqual([
      [false, 0.882],
      [true, 0],
    ]);
    expect(
      officialFigures(freeBill({ ...twoDays, maxPowerUsed: { p1: null, p2: null } }), deps).power,
    ).toBeNull();
  });
});

describe('the PVPC table as the report loads it', () => {
  it('takes the table in the repo', () => {
    expect(pvpcTable(raw)?.days['2026-03-29']).toHaveLength(23);
  });

  const table = (change: Record<string, unknown> = {}) => ({
    source: 's',
    url: 'u',
    coveredUntil: '2026-10-13',
    days: { '2026-10-13': day },
    ...change,
  });
  const withHour = (hour: unknown) => table({ days: { '2026-10-13': [hour, ...day.slice(1)] } });
  const withHours = (hours: unknown) => table({ days: { '2026-10-13': hours } });

  it.each([
    ['a whole day', table()],
    ['no days at all', table({ days: {} })],
    ['a day of 23 hours', withHours(day.slice(0, 23))],
    ['a day of 25 hours', withHours([...day, [23, 100]])],
    ['the last hour of the day', withHour([23, 100])],
    ['the lowest price', withHour([0, -500])],
    ['the highest price', withHour([0, 5000])],
    [
      'days not in order, covered to the last',
      table({ coveredUntil: '2026-10-14', days: { '2026-10-14': day, '2026-10-13': day } }),
    ],
  ])('takes %s', (_, raw) => {
    expect(pvpcTable(raw)).not.toBeNull();
  });

  it.each([
    ['not an object', 'table'],
    ['null', null],
    ['a source that is no text', table({ source: 1 })],
    ['a url that is no text', table({ url: 1 })],
    ['a last day that is no text', table({ coveredUntil: 20261013 })],
    ['a last day that is not a date', table({ coveredUntil: 'ayer' })],
    ['a last day with text after it', table({ coveredUntil: '2026-10-13x' })],
    ['a last day with text before it', table({ coveredUntil: 'x2026-10-13' })],
    ['days that are no object', table({ days: 'days' })],
    ['days that are null', table({ days: null })],
    ['a day that is not a date', table({ days: { ayer: day } })],
    ['a day with text after it', table({ days: { '2026-10-13x': day } })],
    ['a day with text before it', table({ days: { 'x2026-10-13': day } })],
    ['a day with no hours list', withHours('hours')],
    ['a day of 22 hours', withHours(day.slice(0, 22))],
    ['a day of 26 hours', withHours([...day, [23, 100], [23, 100]])],
    ['an hour that is no pair', withHour(5)],
    ['an hour with three values', withHour([0, 100, 1])],
    ['an hour with one value', withHour([0])],
    ['an hour that is no whole number', withHour([0.5, 100])],
    ['an hour before the first', withHour([-1, 100])],
    ['an hour after the last', withHour([24, 100])],
    ['a price that is no number', withHour([0, '100'])],
    ['a price below the lowest', withHour([0, -501])],
    ['a price above the highest', withHour([0, 5001])],
    ['a last day after the last one covered', table({ coveredUntil: '2026-10-14' })],
    [
      'a last day before the last one covered',
      table({ days: { '2026-10-13': day, '2026-10-14': day } }),
    ],
  ])('refuses %s', (_, raw) => {
    expect(pvpcTable(raw)).toBeNull();
  });
});
