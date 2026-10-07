import { describe, expect, it } from 'vitest';
import {
  addDays,
  compareDates,
  daysInMonth,
  fromOrdinal,
  ordinal,
  parseDate as f,
  toIso,
  type CivilDate,
} from '../../../src/engine/date';
import { round2 } from '../../../src/engine/money';
import { IGC } from '../../../src/engine/rental/data/igc';
import { IPC } from '../../../src/engine/rental/data/ipc';
import { IRAV } from '../../../src/engine/rental/data/irav';
import { NORMS } from '../../../src/engine/rental/data/norms';
import type { NormTable } from '../../../src/engine/rental/norms';
import { countedAmount } from '../../../src/engine/rental/outcome';
import {
  checkRentUpdates,
  rentUpdateAmount,
  type RateFigure,
  type RentUpdateReading,
  type RentUpdateResult,
} from '../../../src/engine/rental/rent-update';
import type {
  NoticeForm,
  RentalDeps,
  RentalInput,
  RentUpdateInput,
  UpdateClause,
} from '../../../src/engine/rental/types';
import { validateRental } from '../../../src/engine/rental/validate';
import { contract } from './fixtures';

const TODAY = f('2026-10-07');
const DEPS: RentalDeps = { norms: NORMS, indices: { irav: IRAV, ipc: IPC, igc: IGC } };
const CASES = 400;

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
  return { r, int, pick };
}

const CLAUSES: readonly UpdateClause[] = [
  'none',
  'ipc',
  'irav',
  'igc',
  'fixed_percent',
  'unspecified_index',
  'other',
];
const NOTICES: readonly NoticeForm[] = [
  'letter',
  'burofax',
  'receipt_note',
  'annex',
  'email',
  'messaging',
  'verbal',
  'none',
];

const earliest = (a: CivilDate, b: CivilDate) => (compareDates(a, b) <= 0 ? a : b);

function randomContract(seed: number): RentalInput {
  const { r, int, pick } = prng(seed);
  const signedOn = fromOrdinal(int(ordinal(f('2019-03-06')), ordinal(f('2025-12-31'))));
  const startDate = addDays(signedOn, int(0, 20));
  const updateClause = pick(CLAUSES);
  const updates: RentUpdateInput[] = [];
  let rent = int(400, 2000);
  for (let y = startDate.y + 1; y <= TODAY.y; y++) {
    if (r() < 0.35) continue;
    const anniversary = {
      y,
      m: startDate.m,
      d: Math.min(startDate.d, daysInMonth(y, startDate.m)),
    };
    const day = r() < 0.1 ? addDays(anniversary, int(1, 20)) : anniversary;
    if (compareDates(day, TODAY) > 0) break;
    const newRent = round2(rent * (1 + int(-10, 80) / 1000));
    const notice = pick(NOTICES);
    const charged = { y: day.y, m: day.m, d: 1 };
    updates.push({
      anniversary: day,
      previousRent: r() < 0.8 ? rent : int(400, 2000),
      newRent,
      chargedFrom: r() < 0.2 ? { ...charged, m: charged.m === 12 ? 12 : charged.m + 1 } : charged,
      notice,
      noticeOn:
        notice === 'verbal' || notice === 'none'
          ? null
          : earliest(addDays(day, int(-60, 60)), TODAY),
      agreedInWriting: pick([true, false, null]),
    });
    rent = newRent;
  }
  return contract({
    signedOn,
    startDate,
    landlordType: pick(['person', 'company'] as const),
    largeLandlord: pick([true, false, null]),
    initialRent: int(400, 2000),
    updateClause,
    ...(updateClause === 'fixed_percent' ? { fixedPercent: int(0, 600) / 100 } : {}),
    updates,
    moveOut:
      r() < 0.2
        ? {
            keysReturnedOn: fromOrdinal(int(ordinal(startDate) + 1, ordinal(TODAY))),
            returns: [],
            deductions: [],
          }
        : null,
  });
}

const valuesOf = (r: RentUpdateResult): readonly RentUpdateReading[] =>
  r.outcome.kind === 'single' ? [r.outcome.value] : r.outcome.readings.map((x) => x.value);
const figuresUsed = (v: RentUpdateReading): RateFigure[] =>
  [v.agreed, v.cap?.rate ?? null].filter((x): x is RateFigure => x !== null);

const inputs = Array.from({ length: CASES }, (_, i) => randomContract(1000 + i)).filter(
  (input) => validateRental(input, TODAY).length === 0,
);

describe('rent updates (property, seeded)', () => {
  it('generates enough valid contracts with updates', () => {
    expect(inputs.length).toBeGreaterThan(CASES * 0.8);
    expect(inputs.filter((i) => i.updates.length > 2).length).toBeGreaterThan(CASES / 4);
    const reasons = new Set(
      inputs.flatMap((input) =>
        checkRentUpdates(input, TODAY, DEPS).flatMap((r) =>
          r.outcome.kind === 'depends' ? r.outcome.reasons : [],
        ),
      ),
    );
    expect([...reasons].sort()).toEqual([
      'agreement_unknown',
      'index_month_doubtful',
      'large_landlord_unknown',
      'notice_form_doubtful',
      'repealed_window',
    ]);
  });

  it('never counts more than the lowest reading, nor less than nothing', () => {
    for (const input of inputs)
      for (const r of checkRentUpdates(input, TODAY, DEPS)) {
        const counted = countedAmount(r.outcome, rentUpdateAmount);
        expect(counted).toBeGreaterThanOrEqual(0);
        if (r.outcome.kind === 'depends') {
          const { low, high, reasons } = r.outcome;
          expect(rentUpdateAmount(low)).toBeLessThanOrEqual(rentUpdateAmount(high));
          expect(counted).toBeLessThanOrEqual(rentUpdateAmount(low));
          if (reasons.includes('repealed_window')) expect(counted).toBe(0);
          for (const v of valuesOf(r))
            expect(rentUpdateAmount(v)).toBeGreaterThanOrEqual(rentUpdateAmount(low));
        }
      }
  });

  it('keeps every reading consistent with its own figures', () => {
    for (const input of inputs) {
      const results = checkRentUpdates(input, TODAY, DEPS);
      for (const r of results) {
        const u = input.updates[r.index] as RentUpdateInput;
        for (const v of valuesOf(r)) {
          expect(v.monthly).toBeGreaterThanOrEqual(0);
          expect(v.accumulated).toBeGreaterThanOrEqual(0);
          if (v.status !== 'paid_over') {
            expect(v.monthly).toBe(0);
            expect(v.accumulated).toBe(0);
          } else expect(v.monthly + v.accumulated).toBeGreaterThan(0);
          if (v.maxRent !== null) expect(v.maxRent).toBeGreaterThanOrEqual(v.base);
          // Never more than the whole rise over the base, month by month.
          expect(v.accumulated).toBeLessThanOrEqual(
            round2(v.months * Math.max(0, u.newRent - v.base)) + 0.001,
          );
          if (v.status === 'paid_over' && v.months > 0 && v.monthsBeforeDue === 0)
            expect(Math.abs(v.accumulated - round2(v.months * v.monthly))).toBeLessThan(0.01);
        }
      }
    }
  });

  it('never uses an index figure published after the anniversary', () => {
    for (const input of inputs)
      for (const r of checkRentUpdates(input, TODAY, DEPS))
        for (const v of valuesOf(r))
          for (const fig of figuresUsed(v))
            if (fig.kind === 'index')
              expect(fig.figure.publishedOn <= toIso(r.anniversary)).toBe(true);
  });

  it('a rise charged higher never lowers what that update counts', () => {
    for (const input of inputs.slice(0, 150))
      input.updates.forEach((u, i) => {
        const before = checkRentUpdates(input, TODAY, DEPS).find((r) => r.index === i);
        const raised = {
          ...input,
          updates: input.updates.map((x, j) => (j === i ? { ...x, newRent: u.newRent + 25 } : x)),
        };
        const after = checkRentUpdates(raised, TODAY, DEPS).find((r) => r.index === i);
        if (!before || !after) throw new Error('missing update');
        expect(countedAmount(after.outcome, rentUpdateAmount)).toBeGreaterThanOrEqual(
          countedAmount(before.outcome, rentUpdateAmount),
        );
      });
  });

  it('a change of status of RDL 29/2026 leaves earlier anniversaries untouched', () => {
    const variants: NormTable[] = [
      { ...NORMS, rdl29_2026: { ...NORMS.rdl29_2026, status: 'in_force' } },
      {
        ...NORMS,
        rdl29_2026: { ...NORMS.rdl29_2026, status: 'repealed', inForceUntil: '2026-11-05' },
      },
    ];
    for (const input of inputs) {
      const base = checkRentUpdates(input, TODAY, DEPS);
      for (const norms of variants) {
        const changed = checkRentUpdates(input, TODAY, { ...DEPS, norms });
        base.forEach((r, k) => {
          if (toIso(r.anniversary) < NORMS.rdl29_2026.inForceSince)
            expect(changed[k]?.outcome).toEqual(r.outcome);
        });
      }
    }
  });
});
