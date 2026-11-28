import { describe, expect, it } from 'vitest';
import { offersPass } from '../../../src/bills/telecom/offer';
import { PASS_PRICE } from '../../../src/documents/contract';
import type { TelecomReview } from '../../../src/engine/bills/telecom-review';

const counting = (...counted: number[]) =>
  counted.map((c) => ({ totals: { counted: c, upTo: c, under: 0 } }) as TelecomReview);

describe('when a telecom review offers the pass', () => {
  it('offers it from what the reviews count reaching its price', () => {
    expect(offersPass(counting(PASS_PRICE))).toBe(true);
    expect(offersPass(counting(PASS_PRICE - 0.01))).toBe(false);
    expect(offersPass(counting(PASS_PRICE / 2, PASS_PRICE / 2))).toBe(true);
    expect(offersPass([])).toBe(false);
  });
});
