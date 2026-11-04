import { describe, expect, it } from 'vitest';
import { BILLS_NORMS } from '../../../src/engine/bills/data/norms';
import { BILLS_TABLES } from '../../../src/engine/bills/data/tables';
import { reviewRenewalCore } from '../../../src/engine/bills/renewal';
import type { RenewalDeps, RenewalInput } from '../../../src/engine/bills/renewal-types';

const deps: RenewalDeps = { tables: BILLS_TABLES, norms: BILLS_NORMS };

const letter = (change: Partial<RenewalInput> = {}): RenewalInput => ({
  letterDate: '2026-10-31',
  renewalDate: '2026-12-10',
  powerKw: { p1: 5.75, p2: 5.75 },
  powerUnit: 'per_kw_day',
  current: { power: { p1: 0.110283, p2: 0.033469 }, energy: { all: 0.144972 } },
  next: { power: { p1: 0.12303, p2: 0.052329 }, energy: { all: 0.1678 } },
  annualKwh: 4190.2,
  declared: { withoutTax: 1071.15, withTax: 1362.36 },
  fixedPrice: false,
  firstRenewal: false,
  separateFromBill: true,
  ...change,
});

const review = (change: Partial<RenewalInput> = {}) => reviewRenewalCore(letter(change), deps);

describe('reviewing a renewal letter', () => {
  it('recalculates the Naturgy letter', () => {
    expect(review().recalc).toEqual({
      kind: 'ok',
      current: 909.16,
      next: 1071.15,
      risePercent: 17.82,
      mismatch: null,
    });
  });

  it('flags a declared cost more than 1 € away', () => {
    expect(review({ declared: { withoutTax: 1080, withTax: null } }).recalc).toMatchObject({
      mismatch: { declared: 1080, computed: 1071.15 },
    });
    expect(review({ declared: { withoutTax: 1071.9, withTax: null } }).recalc).toMatchObject({
      mismatch: null,
    });
  });

  it('gives the same figure for prices per kW and year', () => {
    const year = (n: number) => n * 365;
    const result = review({
      powerUnit: 'per_kw_year',
      current: { power: { p1: year(0.110283), p2: year(0.033469) }, energy: { all: 0.144972 } },
      next: { power: { p1: year(0.12303), p2: year(0.052329) }, energy: { all: 0.1678 } },
    });
    expect(result.recalc).toMatchObject({ kind: 'ok', current: 909.16, next: 1071.15 });
  });

  it('does not invent a period split of the consumption', () => {
    const periods = { p1: 0.2, p2: 0.15, p3: 0.1 };
    expect(
      review({
        current: { power: { p1: 0.11, p2: 0.03 }, energy: periods },
        next: { power: { p1: 0.12, p2: 0.05 }, energy: periods },
      }).recalc,
    ).toEqual({ kind: 'needs_period_use' });
  });

  it('asks for the consumption when the letter gives none', () => {
    expect(review({ annualKwh: null }).recalc).toEqual({ kind: 'no_consumption' });
  });

  it('splits the regulated part from the retailer margin', () => {
    const { split } = review();
    if (split.kind !== 'ok') throw new Error('split expected');
    expect(split.power.p2).toEqual({
      regulated: 0.73,
      retailerCurrent: 11.49,
      retailerNext: 18.37,
    });
    expect(split.power.p1.retailerNext).toBe(17.2);
    expect(split.energy.p3).toEqual({
      regulated: 0.003292,
      retailerCurrent: 0.14168,
      retailerNext: 0.164508,
    });
    expect(split.regulatedChange).toBe(false);
  });

  it('has no toll table for a 2027 renewal', () => {
    expect(review({ renewalDate: '2027-01-15' }).split).toEqual({
      kind: 'missing_table',
      day: '2027-01-15',
    });
  });

  describe('notice', () => {
    it('meets one month ahead', () => {
      expect(review().notice).toEqual({ kind: 'meets', days: 40 });
    });

    it('falls short under a calendar month', () => {
      expect(review({ letterDate: '2026-11-20' }).notice).toEqual({ kind: 'short', days: 20 });
    });

    it('counts a month as the same date of the next one, not 30 days', () => {
      expect(review({ letterDate: '2026-11-10' }).notice).toEqual({ kind: 'meets', days: 30 });
      expect(review({ letterDate: '2026-11-11' }).notice).toEqual({ kind: 'short', days: 29 });
    });

    it('is not checked for a letter before the rule took effect', () => {
      expect(review({ letterDate: '2026-05-01' }).notice).toEqual({
        kind: 'not_checked_before',
        since: '2026-06-12',
      });
    });

    it('fails when the letter came with the bill', () => {
      expect(review({ separateFromBill: false }).notice).toEqual({ kind: 'not_separate' });
    });
  });

  describe('exit', () => {
    it('may carry a penalty on a fixed price before the first renewal', () => {
      expect(review({ fixedPrice: true, firstRenewal: true }).exit).toEqual({
        kind: 'penalty_possible',
        capPercent: 5,
      });
    });

    it('is free at a renewal or on a variable price', () => {
      expect(review({ fixedPrice: true, firstRenewal: false }).exit).toEqual({ kind: 'free' });
      expect(review({ fixedPrice: false }).exit).toEqual({ kind: 'free' });
    });

    it('is unknown when the price type is', () => {
      expect(review({ fixedPrice: null }).exit).toEqual({ kind: 'unknown' });
    });
  });
});
