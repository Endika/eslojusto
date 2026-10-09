import { describe, expect, it } from 'vitest';
import { BILLS_NORMS } from '../../../src/engine/bills/data/norms';
import { checkExcessPower, checkServices } from '../../../src/engine/bills/electricity-disallowed';
import { countedAmount, type BillItem } from '../../../src/engine/bills/finding';
import type { ElectricityBillInput, Service } from '../../../src/engine/bills/types';
import { freeBill, juneBill, only } from './input';

const present = (item: BillItem | null): BillItem => {
  if (item === null) throw new Error('no item');
  return item;
};

const summary = (item: BillItem) => {
  const f = only(item);
  return { status: f.status, amount: f.amount, counted: countedAmount(item) };
};

describe('excess power on the 2.0TD tariff', () => {
  const check = (maximeter: boolean | null) =>
    present(checkExcessPower(juneBill({ excessPower: { amount: 4.2, maximeter } }), BILLS_NORMS));

  it('without a maximeter is sent to review with its figure, never counted', () => {
    expect(summary(check(false))).toEqual({ status: 'review_it', amount: 4.2, counted: 0 });
  });

  it('with a maximeter, or not knowing, cannot be checked', () => {
    expect(only(check(true)).calculation).toEqual([{ key: 'excess.maximeter' }]);
    expect(only(check(null)).calculation).toEqual([{ key: 'excess.maximeter_unknown' }]);
    expect(summary(check(null))).toMatchObject({ status: 'not_checkable', amount: null });
  });

  it('gives nothing when there is no excess', () => {
    expect(checkExcessPower(juneBill(), BILLS_NORMS)).toBeNull();
  });
});

describe('services besides the supply', () => {
  const service = (requested: Service['requested']): Service => ({
    label: 'maintenance',
    amount: 4.5,
    requested,
  });
  const check = (input: ElectricityBillInput) => checkServices(input, BILLS_NORMS).map(summary);

  it('are not allowed on a PVPC bill, whatever the answer, and come back every bill', () => {
    const items = checkServices(juneBill({ services: [service('yes')] }), BILLS_NORMS);
    expect(items.map(summary)).toEqual([
      { status: 'not_allowed_in_pvpc', amount: 4.5, counted: 4.5 },
    ]);
    expect(only(items[0] as BillItem)).toMatchObject({ recurring: true, line: 0 });
    expect(only(items[0] as BillItem).sources.map((s) => s.id)).toEqual(['services_pvpc']);
  });

  it('in the free market follow «¿Lo pediste?»', () => {
    expect(
      check(freeBill({ services: [service('yes'), service('no'), service('unknown')] })),
    ).toEqual([
      { status: 'information', amount: 4.5, counted: 0 },
      { status: 'paid_over', amount: 4.5, counted: 4.5 },
      { status: 'review_it', amount: 4.5, counted: 0 },
    ]);
  });

  it('not asked for rests on the supply regulation and the consumer law', () => {
    const [item] = checkServices(freeBill({ services: [service('no')] }), BILLS_NORMS);
    expect(only(item as BillItem).sources.map((s) => s.id)).toEqual([
      'additional_services',
      'unsolicited_services',
    ]);
  });
});
