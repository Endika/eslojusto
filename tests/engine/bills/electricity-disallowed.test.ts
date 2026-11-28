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
  return {
    id: f.id,
    status: f.status,
    amount: f.amount,
    direction: f.direction,
    counted: countedAmount(item),
    says: f.calculation.map((p) => p.key),
    rules: f.sources.map((r) => r.id),
  };
};

describe('excess power on the 2.0TD tariff', () => {
  const check = (maximeter: boolean | null) =>
    present(checkExcessPower(juneBill({ excessPower: { amount: 4.2, maximeter } }), BILLS_NORMS));

  it('without a maximeter is sent to review with its figure, never counted', () => {
    expect(summary(check(false))).toEqual({
      id: 'excess_power',
      status: 'review_it',
      amount: 4.2,
      direction: 'over',
      counted: 0,
      says: ['excess.no_maximeter'],
      rules: [],
    });
  });

  it('with a maximeter, or not knowing, cannot be checked', () => {
    expect(only(check(true)).calculation).toEqual([{ key: 'excess.maximeter' }]);
    expect(only(check(null)).calculation).toEqual([{ key: 'excess.maximeter_unknown' }]);
    expect(summary(check(null))).toMatchObject({ status: 'not_checkable', amount: null });
    expect(only(check(true)).id).toBe('excess_power');
  });

  it.each([null, 0, -1])('gives nothing when the excess is %s', (amount) => {
    const excessPower = amount === null ? null : { amount, maximeter: false };
    expect(checkExcessPower(juneBill({ excessPower }), BILLS_NORMS)).toBeNull();
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
      {
        id: 'service',
        status: 'not_allowed_in_pvpc',
        amount: 4.5,
        direction: 'over',
        counted: 4.5,
        says: ['service.pvpc'],
        rules: ['services_pvpc'],
      },
    ]);
    expect(only(items[0] as BillItem)).toMatchObject({ recurring: true, line: 0 });
  });

  it('in the free market follow «¿Lo pediste?», each on its own rules', () => {
    const unrequested = ['additional_services', 'unsolicited_services'];
    expect(
      check(freeBill({ services: [service('yes'), service('no'), service('unknown')] })),
    ).toEqual([
      {
        id: 'service',
        status: 'information',
        amount: 4.5,
        direction: null,
        counted: 0,
        says: ['service.requested'],
        rules: ['additional_services'],
      },
      {
        id: 'service',
        status: 'paid_over',
        amount: 4.5,
        direction: 'over',
        counted: 4.5,
        says: ['service.not_requested'],
        rules: unrequested,
      },
      {
        id: 'service',
        status: 'review_it',
        amount: 4.5,
        direction: 'over',
        counted: 0,
        says: ['service.requested_unknown'],
        rules: unrequested,
      },
    ]);
  });

  it('leaves out a service with no charge', () => {
    const free = { ...service('no'), amount: 0 };
    expect(check(freeBill({ services: [free, service('no')] }))).toHaveLength(1);
    expect(checkServices(freeBill({ services: [free] }), BILLS_NORMS)).toEqual([]);
  });
});
