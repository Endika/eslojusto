import { describe, expect, it } from 'vitest';
import { BILLS_NORMS } from '../../../src/engine/bills/data/norms';
import { BILLS_TABLES } from '../../../src/engine/bills/data/tables';
import { checkMeter, type MeterDeps } from '../../../src/engine/bills/electricity-meter';
import { countedAmount, type BillItem } from '../../../src/engine/bills/finding';
import type { MeterRental } from '../../../src/engine/bills/types';
import { parseDate } from '../../../src/engine/date';
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
  it('a single-phase meter at its regulated price matches', () => {
    const f = only(check({}));
    expect(f).toMatchObject({ id: 'meter', status: 'matches', amount: null });
    expect(f.rows).toEqual([
      {
        from: '2026-01-01',
        until: null,
        norm: 'order_iet1491_2013',
        url: `${BILLS_NORMS.order_iet1491_2013.url}#dt`,
        status: 'in_force',
        doubt: null,
      },
    ]);
  });

  it('a single-phase meter over its price is counted and comes back every bill', () => {
    const item = check({ amount: 1 });
    expect(only(item)).toMatchObject({
      status: 'above_regulated_price',
      amount: 0.2,
      direction: 'over',
      recurring: true,
    });
    expect(countedAmount(item)).toBe(0.2);
  });

  it('a three-phase meter up to its price matches, and over it is counted', () => {
    expect(only(check({ phase: 'three', supplyPhase: 'three', amount: 1.34 })).status).toBe(
      'matches',
    );
    expect(only(check({ phase: 'three', supplyPhase: 'three', amount: 1.5 }))).toMatchObject({
      status: 'above_regulated_price',
      amount: 0.16,
    });
  });

  it('a three-phase meter charged to a single-phase supply is sent to review', () => {
    expect(only(check({ phase: 'three', supplyPhase: 'single', amount: 1.34 }))).toMatchObject({
      status: 'review_it',
      amount: null,
    });
  });

  it('with no phase known, over the single-phase price cannot be checked', () => {
    expect(only(check({ phase: null, supplyPhase: null, amount: 0.8 })).status).toBe('matches');
    expect(only(check({ phase: null, supplyPhase: null, amount: 1 })).status).toBe('not_checkable');
    expect(only(check({ phase: null, supplyPhase: null, amount: 1.5 }))).toMatchObject({
      status: 'above_regulated_price',
      amount: 0.16,
    });
  });

  it('a meter the person owns has no rent', () => {
    expect(only(check({ owned: true, amount: 0.8 }))).toMatchObject({
      status: 'above_regulated_price',
      amount: 0.8,
      recurring: true,
    });
    expect(only(check({ owned: true, amount: 0 })).status).toBe('matches');
  });

  it('prorates the days the meter is billed for', () => {
    // 10 days: 0,81 × 12 × 10 / 365 = 0,2663 → 0,27.
    expect(only(check({ days: 10, amount: 0.27 })).status).toBe('matches');
    expect(only(check({ days: 10, amount: 0.3 })).amount).toBe(0.03);
  });

  it('gives nothing when the bill has no meter line', () => {
    expect(checkMeter(juneBill({ meter: null }), deps)).toBeNull();
  });

  it('runs on into 2027 on the same transitional price', () => {
    const item = checkMeter(
      juneBill({ readingFrom: parseDate('2026-12-15'), readingTo: parseDate('2027-01-14') }),
      deps,
    );
    expect(item && only(item).status).toBe('matches');
  });
});
