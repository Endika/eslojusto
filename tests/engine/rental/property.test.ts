import { describe, expect, it } from 'vitest';
import {
  addDays,
  compareDates,
  fromOrdinal,
  ordinal,
  parseDate as f,
  type CivilDate,
} from '../../../src/engine/date';
import { round2 } from '../../../src/engine/money';
import { anniversaryIn } from '../../../src/engine/rental/anniversary';
import { RENTAL_TABLES } from '../../../src/engine/rental/data/tables';
import type { NormId, NormTable } from '../../../src/engine/rental/norms';
import { countedAmount, type Outcome } from '../../../src/engine/rental/outcome';
import { itemAmount } from '../../../src/engine/rental/item';
import { rentUpdateAmount } from '../../../src/engine/rental/rent-update';
import {
  reviewRental,
  type RentalItemResult,
  type RentalReview,
} from '../../../src/engine/rental/review';
import { RULES, type RuleId } from '../../../src/engine/rental/rules';
import type {
  Charge,
  ChargeKind,
  DeductionKind,
  Fee,
  FeeKind,
  Guarantee,
  GuaranteeKind,
  NoticeForm,
  RentalInput,
  RentUpdateInput,
  ReviewDeps,
  UpdateClause,
} from '../../../src/engine/rental/types';
import { contract } from './fixtures';

const CASES = 300;

// mulberry32: small, seeded and deterministic.
function prng(seed: number) {
  let a = seed;
  const r = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
  const pick = <T>(xs: readonly T[]): T => xs[int(0, xs.length - 1)] as T;
  const day = (from: CivilDate, to: CivilDate): CivilDate =>
    fromOrdinal(int(ordinal(from), Math.max(ordinal(from), ordinal(to))));
  return { r, int, pick, day };
}
type Rng = ReturnType<typeof prng>;

const TODAYS = ['2026-10-07', '2026-12-01', '2027-06-30'].map(f);
const CLAUSES: readonly UpdateClause[] = [
  'none',
  'ipc',
  'irav',
  'igc',
  'fixed_percent',
  'unspecified_index',
  'other',
];
const FEE_KINDS: readonly FeeKind[] = [
  'agency_fee',
  'formalisation',
  'solvency_check',
  'reservation',
  'management',
  'other',
];
const GUARANTEE_KINDS: readonly GuaranteeKind[] = ['cash', 'bank_guarantee', 'insurance', 'other'];
const NOTICES: readonly NoticeForm[] = ['letter', 'receipt_note', 'email', 'verbal', 'none'];
const CHARGE_KINDS: readonly ChargeKind[] = ['community', 'property_tax', 'waste', 'other'];
const DEDUCTIONS: readonly DeductionKind[] = ['damage', 'cleaning', 'wear', 'other'];

function randomInput(g: Rng, today: CivilDate): RentalInput {
  const signedOn = g.day(f('2019-03-06'), today);
  const startDate = g.day(signedOn, addDays(signedOn, 30));
  const rent = g.int(400, 2000);
  const updateClause = g.pick(CLAUSES);
  const fees: Fee[] = Array.from({ length: g.int(0, 2) }, () => ({
    kind: g.pick(FEE_KINDS),
    amount: g.int(50, 1500),
    deductedLater: g.r() < 0.2,
    requestedInWriting: g.pick([true, false, null]),
  }));
  const guarantees: Guarantee[] = Array.from({ length: g.int(0, 2) }, () => ({
    kind: g.pick(GUARANTEE_KINDS),
    amount: g.r() < 0.2 ? null : rent * g.int(1, 3),
  }));
  const updates: RentUpdateInput[] = [];
  let previous = rent;
  for (let y = startDate.y + 1; updates.length < 3; y++) {
    const anniversary = anniversaryIn(startDate, y);
    if (compareDates(anniversary, today) > 0) break;
    if (g.r() < 0.4) continue;
    const newRent = round2(previous * (1 + g.int(0, 60) / 1000));
    const notice = g.pick(NOTICES);
    updates.push({
      anniversary,
      effectiveOn: anniversary,
      previousRent: previous,
      newRent,
      chargedFrom: { y: anniversary.y, m: anniversary.m, d: 1 },
      notice,
      noticeOn: notice === 'verbal' || notice === 'none' ? null : addDays(anniversary, -20),
      agreedInWriting: g.pick([true, false, null]),
    });
    previous = newRent;
  }
  const charges: Charge[] = Array.from({ length: g.int(0, 2) }, () => ({
    kind: g.pick(CHARGE_KINDS),
    inContract: g.r() < 0.8,
    annualAgreed: g.r() < 0.2 ? null : g.int(200, 900),
    charged: Array.from({ length: g.int(0, 2) }, () => ({
      year: g.int(startDate.y, today.y),
      amount: g.int(200, 1100),
    })),
  }));
  const keys = g.r() < 0.4 ? g.day(startDate, today) : null;
  const moveOut =
    keys === null
      ? null
      : {
          keysReturnedOn: keys,
          returns: Array.from({ length: g.int(0, 2) }, () => ({
            on: g.day(keys, today),
            amount: g.int(100, g.r() < 0.2 ? 2 * rent : rent),
          })),
          deductions: Array.from({ length: g.int(0, 1) }, () => ({
            kind: g.pick(DEDUCTIONS),
            amount: g.int(20, 300),
          })),
        };
  return contract({
    signedOn,
    startDate,
    landlordType: g.pick(['person', 'company']),
    largeLandlord: g.pick([true, false, null]),
    agreedMonths: g.pick([12, 36, 60, 61, 84, 120]),
    initialRent: rent,
    updateClause,
    ...(updateClause === 'fixed_percent' ? { fixedPercent: g.int(0, 5) } : {}),
    region: g.pick(['MD', 'CT', 'PV', 'AN']),
    stressedZone: g.pick([true, false, null]),
    fees,
    deposit: g.r() < 0.2 ? null : rent * g.int(1, 2),
    guarantees,
    advanceMonths: g.pick([null, 0, 1, 2, 3]),
    updates,
    charges,
    moveOut,
  });
}

// The norm changes a vote could bring: validation, or repeal with a last day inside the window.
function alterNorm(g: Rng, norms: NormTable): { id: NormId; norms: NormTable } {
  const id = g.pick<NormId>(['rdl29_2026', 'rdl28_2026', 'rdl8_2026', 'rdl26_2026']);
  const norm = norms[id];
  const changed =
    norm.status === 'pending_validation' && g.r() < 0.5
      ? { ...norm, status: 'in_force' as const, statusSince: '2026-11-05' }
      : norm.status === 'pending_validation'
        ? {
            ...norm,
            status: 'repealed' as const,
            inForceUntil: '2026-11-05',
            statusSince: '2026-11-06',
          }
        : { ...norm, status: 'in_force' as const, endUncertainUntil: undefined };
  return { id, norms: { ...norms, [id]: changed } };
}

const reviewOf = (input: RentalInput, today: CivilDate, deps: ReviewDeps): RentalReview | null => {
  const r = reviewRental(input, today, deps);
  return r.ok ? r.review : null;
};

// The result an item gives in each reading, with no wording: what a change of norm may move.
function resultOf(item: RentalItemResult): unknown {
  const outcome = item.outcome as Outcome<{ status: string; amount?: number | null }>;
  const summary = (v: { status: string; amount?: number | null; accumulated?: number }) => [
    v.status,
    v.amount ?? null,
    v.accumulated ?? null,
  ];
  return outcome.kind === 'single'
    ? [summary(outcome.value)]
    : outcome.readings.map((x) => summary(x.value)).sort();
}

// An item rests on a norm when a source cites one of its rules, or when its readings carry the
// doubt the norm's status opens.
function restsOn(item: RentalItemResult, id: NormId, norms: NormTable): boolean {
  if (item.sources.some((s) => RULES[s.id as RuleId].norm === id)) return true;
  if (item.outcome.kind !== 'depends') return false;
  const reason = norms[id].status === 'repealed' ? 'repealed_window' : 'pending_validation';
  return item.outcome.reasons.includes(reason);
}

const keyOf = (item: RentalItemResult) =>
  `${item.kind}:${item.index}:${'year' in item ? item.year : ''}`;

// Each reading's status and euros, read straight from the item: a rent update's are its
// accumulated difference when paid over; any other item's, its amount when it carries one.
function readingsOf(item: RentalItemResult): { status: string; amount: number }[] {
  const values: { status: string; amount?: number | null; accumulated?: number }[] =
    item.outcome.kind === 'single'
      ? [item.outcome.value]
      : item.outcome.readings.map((r) => r.value);
  return values.map((v) => ({
    status: v.status,
    amount:
      item.kind === 'rent_update'
        ? v.status === 'paid_over'
          ? (v.accumulated ?? 0)
          : 0
        : ['paid_over', 'owed', 'over_cap'].includes(v.status)
          ? (v.amount ?? 0)
          : 0,
  }));
}

// Paid over, owed or over the cap in every reading, outside any repealed window.
const holdsEverywhere = (item: RentalItemResult, status: string): boolean =>
  !(item.outcome.kind === 'depends' && item.outcome.reasons.includes('repealed_window')) &&
  readingsOf(item).every((r) => r.status === status && r.amount > 0);

const expectedCounted = (review: RentalReview, status: string): number =>
  round2(
    review.items
      .filter((i) => holdsEverywhere(i, status))
      .reduce((sum, i) => sum + Math.min(...readingsOf(i).map((r) => r.amount)), 0),
  );

describe('a rental review, over random contracts', () => {
  it('never counts more than any reading gives nor less than nothing', () => {
    const g = prng(20261007);
    let reviewed = 0;
    for (let k = 0; k < CASES; k++) {
      const today = g.pick(TODAYS);
      const review = reviewOf(randomInput(g, today), today, RENTAL_TABLES);
      if (review === null) continue;
      reviewed++;
      for (const total of Object.values(review.totals)) {
        expect(total.counted).toBeGreaterThanOrEqual(0);
        expect(total.counted).toBeLessThanOrEqual(total.upTo);
      }
      expect(review.totals.paidOver.counted).toBe(expectedCounted(review, 'paid_over'));
      expect(review.totals.owed.counted).toBe(expectedCounted(review, 'owed'));
      expect(review.totals.overCap.counted).toBe(expectedCounted(review, 'over_cap'));
      expect(review.offerPass).toBe(
        review.items.some((i) => holdsEverywhere(i, 'paid_over') || holdsEverywhere(i, 'owed')),
      );
    }
    expect(reviewed).toBeGreaterThan(CASES / 2);
  });

  it('an item with any reading at zero counts nothing', () => {
    const g = prng(7102026);
    let zeroed = 0;
    for (let k = 0; k < CASES; k++) {
      const today = g.pick(TODAYS);
      const review = reviewOf(randomInput(g, today), today, RENTAL_TABLES);
      if (review === null) continue;
      for (const item of review.items) {
        const amounts = readingsOf(item).map((r) => r.amount);
        if (!amounts.includes(0)) continue;
        zeroed++;
        const counted =
          item.kind === 'rent_update'
            ? countedAmount(item.outcome, rentUpdateAmount)
            : countedAmount(item.outcome, itemAmount);
        expect(counted, keyOf(item)).toBe(0);
      }
    }
    expect(zeroed).toBeGreaterThan(CASES);
  });

  it('a change of norm status moves only the items that rest on that norm', () => {
    const g = prng(8102026);
    let compared = 0;
    for (let k = 0; k < CASES; k++) {
      const today = g.pick(TODAYS);
      const input = randomInput(g, today);
      const before = reviewOf(input, today, RENTAL_TABLES);
      if (before === null || !before.scope.inScope) continue;
      const altered = alterNorm(g, RENTAL_TABLES.norms);
      const after = reviewOf(input, today, { ...RENTAL_TABLES, norms: altered.norms });
      if (after === null) throw new Error('a norm status changed the input errors');
      expect(after.items.map(keyOf)).toEqual(before.items.map(keyOf));
      for (const [i, item] of before.items.entries()) {
        if (restsOn(item, altered.id, RENTAL_TABLES.norms)) continue;
        const twin = after.items[i];
        if (twin === undefined) throw new Error(`missing ${keyOf(item)}`);
        expect(resultOf(twin), `${keyOf(item)} after ${altered.id}`).toEqual(resultOf(item));
        compared++;
      }
    }
    expect(compared).toBeGreaterThan(CASES);
  });
});
