import { describe, expect, it } from 'vitest';
import { BILLS_NORMS } from '../../../src/engine/bills/data/norms';
import { BILLS_TABLES } from '../../../src/engine/bills/data/tables';
import {
  reviewElectricityBill,
  UNCHECKED,
  type ElectricityReview,
} from '../../../src/engine/bills/electricity-review';
import { findingsOf } from '../../../src/engine/bills/finding';
import type { ElectricityBillInput } from '../../../src/engine/bills/types';
import { parseDate } from '../../../src/engine/date';
import { freeBill, juneBill, mayBill, meter, TODAY } from './input';

const deps = { norms: BILLS_NORMS, tables: BILLS_TABLES };

const review = (input: ElectricityBillInput): ElectricityReview => {
  const result = reviewElectricityBill(input, TODAY, deps);
  if (!result.ok) throw new Error(`invalid: ${JSON.stringify(result.errors)}`);
  return result.review;
};

const notMatching = (r: ElectricityReview) =>
  r.items
    .flatMap(findingsOf)
    .filter((f) => f.status !== 'matches' && f.status !== 'information')
    .map((f) => `${f.id}:${f.status}`);

// The free-market June bill with its own taxes: power 13,80 + 1,38 = 15,18;
//   electricity tax: 5,11269632 % × (15,18 + 34,50 + 0,60) = 2,5707 → 2,57
//   VAT: (50,28 + 2,57 + 0,80) × 21 % = 11,2665 → 11,27
//   total: 53,65 + 11,27 = 64,92
const freeJune = (change: Partial<ElectricityBillInput> = {}) =>
  freeBill({
    electricityTax: { base: 50.28, percent: 5.11269632, amount: 2.57 },
    vat: { base: 53.65, percent: 21, amount: 11.27 },
    total: 64.92,
    ...change,
  });

describe('a bill that matches', () => {
  it.each([
    ['PVPC', juneBill()],
    ['free market', freeJune()],
  ])('%s gives no difference on any line, taxes included', (_, input) => {
    const r = review(input);
    expect(notMatching(r)).toEqual([]);
    expect(r.items.flatMap(findingsOf).map((f) => f.id)).toEqual(
      expect.arrayContaining(['electricity_tax', 'vat', 'power_used']),
    );
    expect(r.totals).toEqual({ counted: 0, upTo: 0, under: 0 });
    expect(r.recurring).toBe(false);
    expect(r.unchecked).toEqual(UNCHECKED);
  });
});

describe('a bill with differences', () => {
  // The meter at 1,00 (0,20 over its price) and a service of 3 € on the PVPC. VAT stays at 10,55
  // though its base grew: (47,02 + 2,40 + 1,00) × 21 % = 10,5882 → 10,59, so it is 0,04 short.
  const input = juneBill({
    meter: meter({ amount: 1 }),
    services: [{ label: 'maintenance', amount: 3, requested: 'yes' }],
  });

  it('counts what is charged over, apart from what is charged short', () => {
    const r = review(input);
    expect(notMatching(r)).toEqual([
      'total:does_not_add_up',
      'meter:above_regulated_price',
      'vat:different_base',
      'service:not_allowed_in_pvpc',
    ]);
    expect(r.totals).toEqual({ counted: 3.2, upTo: 3.2, under: 0.04 });
    expect(r.recurring).toBe(true);
  });

  it('never counts what is only sent to review', () => {
    const r = review(
      freeJune({ services: [{ label: 'insurance', amount: 3, requested: 'unknown' }] }),
    );
    expect(notMatching(r)).toContain('service:review_it');
    expect(r.totals.counted).toBe(0);
  });
});

describe('a bill due in November 2026', () => {
  // Until the September CPI and the validation of RDL 25/2026 are in: the electricity tax 0,25 or
  // 2,40, VAT 5,02 (5,11 with the meter at 21 %) or 10,55; the bill charged the general rates.
  it('shows both readings and counts only the lowest', () => {
    const r = review(juneBill({ dueOn: parseDate('2026-11-10') }));
    const taxes = r.items.filter((i) => i.kind === 'readings');
    expect(taxes.flatMap(findingsOf).map((f) => `${f.id}:${f.status}:${f.amount}`)).toEqual([
      'electricity_tax:wrong_rate_for_date:2.15',
      'electricity_tax:matches:null',
      'vat:wrong_rate_for_date:5.44',
      'vat:matches:null',
    ]);
    expect(r.totals).toEqual({ counted: 0, upTo: 7.59, under: 0 });
  });
});

describe('the door and the input', () => {
  it('stops a bill issued before 12-06-2026 without working anything out', () => {
    const r = review(mayBill());
    expect(r.scope).toEqual({ inScope: false, reason: 'issued_before_2026_06_12' });
    expect(r.items).toEqual([]);
    expect(r.totals).toEqual({ counted: 0, upTo: 0, under: 0 });
  });

  it('returns the errors of a bill that cannot be read', () => {
    const result = reviewElectricityBill(
      juneBill({ issuedOn: parseDate('2026-12-01') }),
      TODAY,
      deps,
    );
    expect(result).toEqual({ ok: false, errors: [{ field: 'issuedOn', code: 'in_future' }] });
  });
});
