import { describe, expect, it } from 'vitest';
import {
  countedAmount,
  evaluateAcross,
  highestAmount,
  letterAmount,
  worldsFor,
  type Doubt,
  type DoubtReason,
  type Measure,
  type Outcome,
} from '../../../src/engine/rental/outcome';

const euros: Measure<number> = { amount: (v) => v, same: (a, b) => a === b };
const id = (n: number) => n;

const PENDING: Doubt = { id: 'norm:rdl29_2026', reason: 'pending_validation' };
const REPEALED: Doubt = { id: 'norm:rdl8_2026', reason: 'repealed_window' };
const LANDLORD: Doubt = { id: 'large_landlord', reason: 'large_landlord_unknown' };
const INDEX: Doubt = { id: 'index:ipc:2025-07-01', reason: 'index_month_doubtful' };

// mulberry32: small, seeded and deterministic.
function prng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('worlds', () => {
  it('are every combination of the open doubts, each doubt once', () => {
    expect(worldsFor([])).toEqual([{}]);
    const worlds = worldsFor([PENDING, LANDLORD, PENDING]);
    expect(worlds).toHaveLength(4);
    expect(new Set(worlds.map((w) => JSON.stringify(w))).size).toBe(4);
  });
});

describe('evaluating across readings', () => {
  it('gives a single result when every reading agrees', () => {
    expect(evaluateAcross([PENDING, LANDLORD], () => 120, euros)).toEqual({
      kind: 'single',
      value: 120,
    });
  });

  it('gives both results, the lower first, and the doubt that moves them', () => {
    const outcome = evaluateAcross(
      [PENDING, LANDLORD],
      (w) => (w[PENDING.id] === true ? 50 : 80),
      euros,
    );
    expect(outcome).toMatchObject({
      kind: 'depends',
      reasons: ['pending_validation'],
      low: 50,
      high: 80,
    });
    if (outcome.kind !== 'depends') throw new Error('depends');
    expect(outcome.readings.map((r) => [r.value, r.worlds.length])).toEqual([
      [80, 2],
      [50, 2],
    ]);
  });

  it('names only the doubts that change something', () => {
    const outcome = evaluateAcross(
      [PENDING, LANDLORD, INDEX],
      (w) => (w[LANDLORD.id] === true ? 30 : 0) + (w[INDEX.id] === true ? 5 : 0),
      euros,
    );
    expect(outcome).toMatchObject({
      kind: 'depends',
      reasons: ['large_landlord_unknown', 'index_month_doubtful'],
      low: 0,
      high: 35,
    });
  });

  it('compares results by the measure, not by identity', () => {
    const measure: Measure<{ amount: number; note: string }> = {
      amount: (v) => v.amount,
      same: (a, b) => a.amount === b.amount,
    };
    const outcome = evaluateAcross(
      [LANDLORD],
      (w) => ({ amount: 10, note: w[LANDLORD.id] === true ? 'large' : 'small' }),
      measure,
    );
    expect(outcome.kind).toBe('single');
  });

  it('keeps low within every reading and high above it (property, seeded)', () => {
    const rnd = prng(7);
    const doubts = [PENDING, REPEALED, LANDLORD, INDEX];
    for (let i = 0; i < 300; i++) {
      const table = new Map<string, number>();
      const fn = (w: Record<string, boolean>) => {
        const key = JSON.stringify(w);
        if (!table.has(key)) table.set(key, Math.round(rnd() * 3) * 10);
        return table.get(key) ?? 0;
      };
      const outcome = evaluateAcross(doubts, fn, euros);
      const values = [...table.values()];
      if (new Set(values).size === 1) {
        expect(outcome).toEqual({ kind: 'single', value: values[0] });
        continue;
      }
      if (outcome.kind !== 'depends') throw new Error('depends');
      expect(outcome.low).toBe(Math.min(...values));
      expect(outcome.high).toBe(Math.max(...values));
      expect(outcome.reasons.length).toBeGreaterThan(0);
      expect(outcome.readings.flatMap((r) => r.worlds)).toHaveLength(16);
      expect(countedAmount(outcome, id)).toBeLessThanOrEqual(outcome.low);
      expect(countedAmount(outcome, id)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('what the total and the letter count', () => {
  const depends = (reasons: readonly DoubtReason[]): Outcome<number> => ({
    kind: 'depends',
    reasons,
    low: 40,
    high: 90,
    readings: [],
  });

  it('counts a single result whole', () => {
    expect(countedAmount({ kind: 'single', value: 75 }, id)).toBe(75);
    expect(letterAmount({ kind: 'single', value: 75 }, id)).toBe(75);
    expect(letterAmount({ kind: 'single', value: 0 }, id)).toBeNull();
  });

  it('counts only the lower reading of an open doubt', () => {
    expect(countedAmount(depends(['pending_validation']), id)).toBe(40);
    expect(letterAmount(depends(['large_landlord_unknown']), id)).toBe(40);
  });

  it('counts nothing and writes no letter inside a repealed window', () => {
    expect(countedAmount(depends(['repealed_window']), id)).toBe(0);
    expect(letterAmount(depends(['repealed_window']), id)).toBeNull();
    expect(countedAmount(depends(['pending_validation', 'repealed_window']), id)).toBe(0);
  });

  it('writes no letter when the lower reading is nothing', () => {
    const outcome: Outcome<number> = {
      kind: 'depends',
      reasons: ['large_landlord_unknown'],
      low: 0,
      high: 90,
      readings: [],
    };
    expect(letterAmount(outcome, id)).toBeNull();
  });
});

describe('the most any reading gives', () => {
  it('is the higher reading, a repealed window included', () => {
    const outcome = evaluateAcross([REPEALED], (w) => (w[REPEALED.id] === true ? 30 : 10), euros);
    expect(highestAmount(outcome, id)).toBe(30);
    expect(countedAmount(outcome, id)).toBe(0);
    expect(highestAmount({ kind: 'single', value: 75 }, id)).toBe(75);
  });
});
