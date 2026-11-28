import { describe, expect, it } from 'vitest';
import { parseDate as f } from '../../../src/engine/date';
import { RENTAL_TABLES } from '../../../src/engine/rental/data/tables';
import { reviewRental, UNCHECKED, type RentalReview } from '../../../src/engine/rental/review';
import type { RentalInput } from '../../../src/engine/rental/types';
import { contract } from './fixtures';

const TODAY = f('2026-10-07');

const review = (input: RentalInput): RentalReview => {
  const r = reviewRental(input, TODAY, RENTAL_TABLES);
  if (!r.ok) throw new Error(`invalid: ${JSON.stringify(r.errors)}`);
  return r.review;
};

describe('the door', () => {
  it('returns the input errors and works nothing out', () => {
    const r = reviewRental(contract({ initialRent: 0 }), TODAY, RENTAL_TABLES);
    expect(r).toEqual({
      ok: false,
      errors: [{ field: 'initialRent', code: 'amount_out_of_range' }],
    });
  });

  it.each([['a room', { contractType: 'room' as const }, 'room']])(
    '%s: out of scope, no items and no information',
    (_, change, reason) => {
      const r = review(
        contract({
          fees: [
            { kind: 'agency_fee', amount: 500, deductedLater: false, requestedInWriting: false },
          ],
          ...change,
        }),
      );
      expect(r.scope).toEqual({ inScope: false, reason });
      expect(r.items).toEqual([]);
      expect(r.information).toEqual([]);
      expect(r.totals).toStrictEqual({
        paidOver: { counted: 0, upTo: 0 },
        owed: { counted: 0, upTo: 0 },
        overCap: { counted: 0, upTo: 0 },
      });
      expect(r.offerPass).toBe(false);
      expect(r.unchecked).toEqual(UNCHECKED);
    },
  );
});
