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
import { freeBill, juneBill, TODAY } from './input';

const deps = { norms: BILLS_NORMS, tables: BILLS_TABLES };

const review = (input: ElectricityBillInput, norms = BILLS_NORMS): ElectricityReview => {
  const result = reviewElectricityBill(input, TODAY, { ...deps, norms });
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

describe('the door and the input', () => {
  it('returns the errors of a bill that cannot be read', () => {
    const result = reviewElectricityBill(
      juneBill({ issuedOn: parseDate('2026-12-01') }),
      TODAY,
      deps,
    );
    expect(result).toEqual({ ok: false, errors: [{ field: 'issuedOn', code: 'in_future' }] });
  });
});
