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

  it.each([
    [
      'signed before 06-03-2019',
      { signedOn: f('2019-03-05'), startDate: f('2019-03-05') },
      'before_2019',
    ],
    ['a seasonal let', { contractType: 'seasonal' as const }, 'seasonal'],
    ['a room', { contractType: 'room' as const }, 'room'],
  ])('%s: out of scope, no items and no information', (_, change, reason) => {
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
    expect(r.offerPass).toBe(false);
    expect(r.unchecked).toEqual(UNCHECKED);
  });
});

describe('a contract end to end', () => {
  // Signed 01-06-2023 with a person; 900 € a month, three years, no update clause.
  const input = contract({
    signedOn: f('2023-06-01'),
    startDate: f('2023-06-01'),
    agreedMonths: 36,
    initialRent: 900,
    updateClause: 'none',
    fees: [
      { kind: 'agency_fee', amount: 500, deductedLater: false, requestedInWriting: false },
      { kind: 'solvency_check', amount: 150, deductedLater: false, requestedInWriting: false },
    ],
    deposit: 900,
    guarantees: [{ kind: 'cash', amount: 2700 }],
    advanceMonths: 2,
    charges: [
      {
        kind: 'community',
        inContract: true,
        annualAgreed: 600,
        charged: [{ year: 2024, amount: 650 }],
      },
    ],
    moveOut: {
      keysReturnedOn: f('2026-06-30'),
      returns: [{ on: f('2026-09-15'), amount: 600 }],
      deductions: [],
    },
  });
  const r = review(input);

  it('lists every item in order', () => {
    expect(r.items.map((i) => [i.kind, i.index])).toEqual([
      ['fee', 0],
      ['fee', 1],
      ['guarantees', null],
      ['advance', null],
      ['charge', 0],
      ['deposit_return', null],
      ['deposit_interest', null],
    ]);
  });

  it('counts only what holds in every reading', () => {
    // Paid over: the agency fee, 500; the community fee 650 over 600 with no rent rise, 50.
    // Owed: 300 of deposit, and interest from 31-07-2026 on 600 to 15-09 (46 days) and on 300 to
    // today (68 days) at 3,25 %: 4,27 on 365 days a year, 4,33 on 360.
    // Over the cap: 2.700 − 2 × 900 = 900 of guarantees; (2 − 1) × 900 = 900 of advance.
    expect(r.totals).toEqual({
      paidOver: { counted: 550, upTo: 550 },
      owed: { counted: 304.27, upTo: 304.33 },
      overCap: { counted: 1800, upTo: 1800 },
    });
    expect(r.offerPass).toBe(true);
  });

  it('informs with dates and sources, never with an amount', () => {
    expect(JSON.stringify(r.information)).not.toMatch(/:\s*-?\d/);
    expect(r.information.map((b) => b.id)).toContain('minimum_term');
  });

  it('offers no pass when nothing is paid over or owed in every reading', () => {
    const quiet = review(
      contract({
        signedOn: f('2026-10-07'),
        startDate: f('2026-10-07'),
        fees: [
          { kind: 'reservation', amount: 200, deductedLater: false, requestedInWriting: false },
        ],
        guarantees: [{ kind: 'cash', amount: 5000 }],
      }),
    );
    expect(quiet.totals.paidOver.counted).toBe(0);
    expect(quiet.totals.overCap.counted).toBeGreaterThan(0);
    expect(quiet.offerPass).toBe(false);
  });
});

describe("a deposit within the landlord's month", () => {
  it('stays out of the totals and the pass', () => {
    const r = review(
      contract({ moveOut: { keysReturnedOn: f('2026-10-01'), returns: [], deductions: [] } }),
    );
    const item = r.items.find((i) => i.kind === 'deposit_return');
    expect(item?.outcome).toMatchObject({ kind: 'single', value: { status: 'not_yet_due' } });
    expect(r.totals.owed).toEqual({ counted: 0, upTo: 0 });
    expect(r.offerPass).toBe(false);
  });
});

describe('rent updates', () => {
  it('come in as items and add to the totals', () => {
    // IPC April 2021 2,2 % (out 14-05-2021): 800 × 1,022 = 817,60; 12,40 a month over for the
    // twelve months from May 2021 to April 2022 = 148,80.
    const r = review(
      contract({
        signedOn: f('2019-05-10'),
        startDate: f('2019-05-20'),
        initialRent: 800,
        deposit: 800,
        updates: [
          {
            anniversary: f('2021-05-20'),
            effectiveOn: f('2021-05-20'),
            previousRent: 800,
            newRent: 830,
            chargedFrom: f('2021-05-01'),
            notice: 'letter',
            noticeOn: f('2021-04-01'),
            agreedInWriting: false,
          },
        ],
      }),
    );
    const update = r.items.find((i) => i.kind === 'rent_update');
    expect(update?.outcome).toMatchObject({ kind: 'single', value: { status: 'paid_over' } });
    expect(r.totals.paidOver.counted).toBe(148.8);
    expect(r.offerPass).toBe(true);
  });
});
