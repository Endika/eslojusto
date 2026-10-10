import { describe, expect, it } from 'vitest';
import { reviewBasket, type BasketBill } from '../../../src/engine/bills/basket';
import { BILLS_NORMS } from '../../../src/engine/bills/data/norms';
import { BILLS_TABLES } from '../../../src/engine/bills/data/tables';
import { reviewElectricityBill } from '../../../src/engine/bills/electricity-review';
import type { ElectricityBillInput } from '../../../src/engine/bills/types';
import { parseDate } from '../../../src/engine/date';
import { freeBill, juneBill, meter, TODAY } from './input';

const deps = { passPrice: 4.99 };

const reviewed = (input: ElectricityBillInput): BasketBill => {
  const result = reviewElectricityBill(input, TODAY, {
    norms: BILLS_NORMS,
    tables: BILLS_TABLES,
  });
  if (!result.ok) throw new Error(`invalid: ${JSON.stringify(result.errors)}`);
  return { input, review: result.review };
};

// The June bill with the meter charged above its cap: 1,00 against 0,80, 0,20 over. VAT on
// (47,02 + 2,40 + 1,00) × 21 % = 10,5882 → 10,59; total 61,01.
const meterOver = reviewed(
  juneBill({
    meter: meter({ amount: 1 }),
    vat: { base: 50.42, percent: 21, amount: 10.59 },
    total: 61.01,
  }),
);

// The same difference on other months: the basket reads only the period and the supply.
const onPeriod = (bill: BasketBill, from: string, to: string): BasketBill => ({
  ...bill,
  input: { ...bill.input, readingFrom: parseDate(from), readingTo: parseDate(to) },
});

describe('a year of bills', () => {
  it('a single small difference is not worth the pass', () => {
    // 1,20 against 0,80: 0,40 over. VAT on 50,62 × 21 % = 10,6302 → 10,63; total 61,25.
    const basket = reviewBasket(
      [
        reviewed(
          juneBill({
            meter: meter({ amount: 1.2 }),
            vat: { base: 50.62, percent: 21, amount: 10.63 },
            total: 61.25,
          }),
        ),
      ],
      deps,
    );
    expect(basket.totals.counted).toBe(0.4);
    expect(basket.recurring).toEqual([]);
    expect(basket.yearlyEstimate).toBeNull();
    expect(basket.offerPass).toBe(false);
  });

  // 0,20 a bill over 31 + 30 + 31 = 92 days: 0,60 × 365 / 92 = 2,3804 → 2,38 a year, an estimate.
  it('a meter charged over in three bills is offered with its yearly estimate', () => {
    const basket = reviewBasket(
      [
        onPeriod(meterOver, '2026-04-30', '2026-05-31'),
        meterOver,
        onPeriod(meterOver, '2026-06-30', '2026-07-31'),
      ],
      deps,
    );
    expect(basket).toMatchObject({
      bills: [0, 1, 2],
      skipped: [],
      totals: { counted: 0.6, upTo: 0.6, under: 0 },
      days: 92,
      recurring: ['meter'],
      yearlyEstimate: 2.38,
      offerPass: true,
    });
  });

  it('counts a bill uploaded twice once', () => {
    const basket = reviewBasket([meterOver, meterOver], deps);
    expect(basket.bills).toEqual([0]);
    expect(basket.skipped).toEqual([{ bill: 1, reason: 'duplicate' }]);
    expect(basket.totals.counted).toBe(0.2);
    expect(basket.offerPass).toBe(false);
  });

  it('tells two supplies with the same period apart by their fingerprint', () => {
    const basket = reviewBasket(
      [
        { ...meterOver, input: { ...meterOver.input, supplyFingerprint: 'a1' } },
        { ...meterOver, input: { ...meterOver.input, supplyFingerprint: 'b2' } },
      ],
      deps,
    );
    expect(basket.bills).toEqual([0, 1]);
  });

  it('takes a bill of the same period with a fingerprint on one copy only as the same bill', () => {
    const basket = reviewBasket(
      [meterOver, { ...meterOver, input: { ...meterOver.input, supplyFingerprint: 'a1' } }],
      deps,
    );
    expect(basket.skipped).toEqual([{ bill: 1, reason: 'duplicate' }]);
  });

  it('leaves out a bill the review does not cover', () => {
    const basket = reviewBasket([meterOver, reviewed(juneBill({ postcode: '35001' }))], deps);
    expect(basket.skipped).toEqual([{ bill: 1, reason: 'out_of_scope' }]);
    expect(basket.days).toBe(30);
  });

  // A free-market service the person did not ask for, 5,00, counted: VAT on
  // (50,28 + 2,57 + 0,80 + 5,00) × 21 % = 12,3165 → 12,32; total 70,97.
  it('is offered once what is counted reaches the price of the pass', () => {
    const basket = reviewBasket(
      [
        reviewed(
          freeBill({
            services: [{ label: 'maintenance', amount: 5, requested: 'no' }],
            electricityTax: { base: 50.28, percent: 5.11269632, amount: 2.57 },
            vat: { base: 58.65, percent: 21, amount: 12.32 },
            total: 70.97,
          }),
        ),
      ],
      deps,
    );
    expect(basket.totals.counted).toBe(5);
    expect(basket.offerPass).toBe(true);
  });

  it('a bill that matches gives nothing', () => {
    const basket = reviewBasket([reviewed(juneBill())], deps);
    expect(basket.totals).toEqual({ counted: 0, upTo: 0, under: 0 });
    expect(basket.offerPass).toBe(false);
  });
});
