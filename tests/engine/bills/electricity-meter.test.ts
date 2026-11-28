import { describe, expect, it } from 'vitest';
import { BILLS_NORMS } from '../../../src/engine/bills/data/norms';
import { BILLS_TABLES } from '../../../src/engine/bills/data/tables';
import { checkMeter, type MeterDeps } from '../../../src/engine/bills/electricity-meter';
import { type BillItem } from '../../../src/engine/bills/finding';
import type { MeterRental } from '../../../src/engine/bills/types';
import { parseDate } from '../../../src/engine/date';
import { billsPhrase as say } from '../../../src/engine/bills/calculation';
import { juneBill, meter, only } from './input';

const deps: MeterDeps = { norms: BILLS_NORMS, tables: BILLS_TABLES };

const check = (change: Partial<MeterRental>): BillItem => {
  const item = checkMeter(juneBill({ meter: meter(change) }), deps);
  if (item === null) throw new Error('no meter item');
  return item;
};

// 30 days: single phase 0,81 × 12 × 30 / 365 = 0,7989 → 0,80; three phase 1,36 × 12 × 30 / 365 =
// 1,3414 → 1,34.
describe('the meter rental', () => {
  it('a meter the person owns has no rent', () => {
    expect(only(check({ owned: true, amount: 0.8 }))).toMatchObject({
      status: 'above_regulated_price',
      amount: 0.8,
      recurring: true,
    });
    expect(only(check({ owned: true, amount: 0 })).status).toBe('matches');
  });

  it('gives nothing when the bill has no meter line', () => {
    expect(checkMeter(juneBill({ meter: null }), deps)).toBeNull();
  });

  const billed = (amount: number) => say('arithmetic.billed', { euros: { euros: amount } });
  const cap = (phase: number, euros: number, days = 30) =>
    say('meter.cap', { phase: { integer: phase }, days: { days }, euros: { euros } });

  it('words each verdict with the cap of the phase it was checked against', () => {
    const says = (change: Partial<MeterRental>) => only(check(change)).calculation;
    expect(says({})).toEqual([cap(1, 0.8), billed(0.8)]);
    expect(says({ amount: 1 })).toEqual([cap(1, 0.8), billed(1)]);
    expect(says({ phase: 'three', supplyPhase: 'three', amount: 1.5 })).toEqual([
      cap(3, 1.34),
      billed(1.5),
    ]);
    expect(says({ phase: 'three', supplyPhase: 'single', amount: 1.34 })).toEqual([
      cap(3, 1.34),
      say('meter.three_phase_on_single'),
      billed(1.34),
    ]);
    expect(says({ phase: null, supplyPhase: null, amount: 1 })).toEqual([
      cap(3, 1.34),
      say('meter.phase_unknown'),
      billed(1),
    ]);
    expect(says({ owned: true, amount: 0 })).toEqual([say('meter.owned'), billed(0)]);
    expect(says({ owned: true, amount: 0.8 })).toEqual([say('meter.owned'), billed(0.8)]);
  });

  it('takes a cent over the price as within it, and the next one as over', () => {
    const rent = { singlePhase: 1, threePhase: 2 };
    const row = BILLS_TABLES.meter[0];
    if (row === undefined) throw new Error('no meter row');
    const year = { ...deps, tables: { meter: [{ ...row, from: '2025-01-01', value: rent }] } };
    const at = (amount: number) =>
      only(checkMeter(juneBill({ meter: meter({ amount, days: 365 }) }), year) as BillItem);
    expect(at(12.01).status).toBe('matches');
    expect(at(12.02).status).toBe('above_regulated_price');
  });

  it('gives no figure for a day the table does not cover', () => {
    const row = BILLS_TABLES.meter[0];
    if (row === undefined) throw new Error('no meter row');
    const late = { ...deps, tables: { meter: [{ ...row, from: '2026-06-10' }] } };
    const item = checkMeter(juneBill(), late) as BillItem;
    expect(only(item)).toMatchObject({ id: 'meter', status: 'pending_official_data' });
    expect(only(item).calculation).toEqual([
      say('official.missing', { day: { date: '2026-06-01' } }),
    ]);
  });

  // 0,81 × 12 × 30 / 366 = 0,7967 in a leap year against 0,7989 over 365 days.
  describe('in a leap year, with both ways of sharing the year', () => {
    const leap = (change: Partial<MeterRental>) =>
      only(
        checkMeter(
          juneBill({
            readingFrom: parseDate('2028-05-31'),
            readingTo: parseDate('2028-06-30'),
            meter: meter(change),
          }),
          deps,
        ) as BillItem,
      );

    it('checks against the higher of the two', () => {
      expect(leap({ amount: 0.808 }).status).toBe('matches');
      expect(leap({ amount: 0.81 }).status).toBe('above_regulated_price');
    });

    it('with no phase known, takes the higher single-phase price as the one to stay under', () => {
      expect(leap({ phase: null, supplyPhase: null, amount: 0.808 }).status).toBe('matches');
      expect(leap({ phase: null, supplyPhase: null, amount: 0.81 }).status).toBe('not_checkable');
    });
  });
});
