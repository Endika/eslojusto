import { describe, expect, it } from 'vitest';
import { reviewBasket, type BasketBill } from '../../../src/engine/bills/basket';
import { BILLS_NORMS } from '../../../src/engine/bills/data/norms';
import { BILLS_TABLES } from '../../../src/engine/bills/data/tables';
import { reviewElectricityBill } from '../../../src/engine/bills/electricity-review';
import { billFinding, single } from '../../../src/engine/bills/finding';
import type { ElectricityBillInput } from '../../../src/engine/bills/types';
import { parseDate } from '../../../src/engine/date';
import { juneBill, meter, TODAY } from './input';

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
  it.each([
    ['the first', 'a1', null],
    ['the second', null, 'a1'],
  ])(
    'takes a bill of the same period with a fingerprint on %s copy only as the same bill',
    (_, a, b) => {
      const basket = reviewBasket(
        [
          { ...meterOver, input: { ...meterOver.input, supplyFingerprint: a } },
          { ...meterOver, input: { ...meterOver.input, supplyFingerprint: b } },
        ],
        deps,
      );
      expect(basket.skipped).toEqual([{ bill: 1, reason: 'duplicate' }]);
    },
  );

  it.each([
    ['start', '2026-05-30', '2026-06-30'],
    ['end', '2026-05-31', '2026-07-01'],
  ])('counts a bill whose period differs in its %s as another bill', (_, from, to) => {
    const basket = reviewBasket([meterOver, onPeriod(meterOver, from, to)], deps);
    expect(basket.bills).toEqual([0, 1]);
  });

  describe('the yearly estimate', () => {
    const over = (id: 'meter' | 'service', amount: number) =>
      single(billFinding(id, 'paid_over', [], [], BILLS_NORMS, { amount, direction: 'over' }));
    const withItems = (from: string, to: string, ...items: ReturnType<typeof over>[]) => {
      const { input, review } = onPeriod(meterOver, from, to);
      return { input, review: { ...review, items, totals: { counted: 0, upTo: 0, under: 0 } } };
    };

    it('adds up only the items that recur', () => {
      const basket = reviewBasket(
        [
          withItems('2026-05-31', '2026-06-30', over('meter', 0.2), over('service', 5)),
          withItems('2026-06-30', '2026-07-30', over('meter', 0.2)),
        ],
        deps,
      );
      expect(basket.recurring).toEqual(['meter']);
      expect(basket.yearlyEstimate).toBe(2.43);
    });

    it('gives none when the bills cover no day', () => {
      const basket = reviewBasket(
        [
          withItems('2026-06-01', '2026-06-01', over('meter', 0.2)),
          withItems('2026-06-02', '2026-06-02', over('meter', 0.2)),
        ],
        deps,
      );
      expect(basket.recurring).toEqual(['meter']);
      expect(basket.yearlyEstimate).toBeNull();
    });
  });
});
