import { describe, expect, it } from 'vitest';
import { BILLS_NORMS } from '../../../src/engine/bills/data/norms';
import { BILLS_TABLES } from '../../../src/engine/bills/data/tables';
import { reviewRenewalCore } from '../../../src/engine/bills/renewal';
import { reviewRenewal } from '../../../src/engine/bills/renewal-review';
import { parseDate } from '../../../src/engine/date';
import type { NormTable } from '../../../src/engine/bills/norms';
import type { Table } from '../../../src/engine/bills/tables';
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

  it('does not compare with a declared cost it does not have', () => {
    expect(review({ declared: { withoutTax: null, withTax: null } }).recalc).toMatchObject({
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

  it('keeps the split when the letter date has no tables', () => {
    const result = review({ letterDate: '2025-06-20' }).split;
    expect(result).toMatchObject({ kind: 'ok', regulatedChange: null });
  });

  it('reports a change in the regulated part between letter and renewal', () => {
    const row = (from: string, until: string, p1: number) => ({
      from,
      until,
      value: {
        power: { p1, p2: 0.5 },
        energy: { p1: 0.01, p2: 0.01, p3: 0.01 },
      },
      norm: 'law38_1992' as const,
      url: 'https://example.test',
    });
    const tolls: Table<(typeof BILLS_TABLES.tolls)[number]['value']> = [
      row('2026-01-01', '2026-11-30', 1),
      row('2026-12-01', '2026-12-31', 2),
    ];
    const charges: Table<(typeof BILLS_TABLES.charges)[number]['value']> = [
      row('2026-01-01', '2026-12-31', 0),
    ];
    const own: RenewalDeps = { tables: { ...BILLS_TABLES, tolls, charges }, norms: BILLS_NORMS };
    expect(reviewRenewalCore(letter(), own).split).toMatchObject({ regulatedChange: true });
    expect(reviewRenewalCore(letter({ letterDate: '2026-12-02' }), own).split).toMatchObject({
      regulatedChange: false,
    });
  });

  it('is conditional while the norm deciding the tables is unsettled', () => {
    const december = BILLS_NORMS.rdl25_2026_december;
    const [held] = BILLS_TABLES.tolls;
    if (held === undefined || december.condition === undefined) throw new Error('fixture expected');
    const open: NormTable = {
      ...BILLS_NORMS,
      rdl25_2026_december: {
        ...december,
        status: 'conditional',
        condition: { ...december.condition, met: null },
      },
    };
    const tolls = [
      { ...held, from: '2026-12-01', until: '2026-12-31', norm: 'rdl25_2026_december' as const },
    ];
    const own: RenewalDeps = { tables: { ...BILLS_TABLES, tolls }, norms: open };
    expect(reviewRenewalCore(letter(), own).split).toEqual({
      kind: 'conditional',
      norms: ['rdl25_2026_december'],
    });
  });

  describe('notice', () => {
    it('meets one month ahead', () => {
      expect(review().notice).toEqual({ kind: 'meets', days: 40 });
    });

    it('falls short under a calendar month', () => {
      expect(review({ letterDate: '2026-11-20' }).notice).toEqual({
        kind: 'short',
        days: 20,
        separate: true,
      });
    });

    it('counts a month as the same date of the next one, not 30 days', () => {
      expect(review({ letterDate: '2026-11-10' }).notice).toEqual({ kind: 'meets', days: 30 });
      expect(review({ letterDate: '2026-11-11' }).notice).toEqual({
        kind: 'short',
        days: 29,
        separate: true,
      });
    });

    it('is not checked for a letter before the rule took effect', () => {
      expect(review({ letterDate: '2026-05-01' }).notice).toEqual({
        kind: 'not_checked_before',
        since: '2026-06-12',
      });
    });

    it('cannot say a month ahead is enough when the bill is unknown', () => {
      expect(review({ separateFromBill: null }).notice).toEqual({
        kind: 'separate_unknown',
        days: 40,
      });
      expect(review({ separateFromBill: null, letterDate: '2026-11-20' }).notice).toEqual({
        kind: 'short',
        days: 20,
        separate: null,
      });
    });

    it('fails when the letter came with the bill', () => {
      expect(review({ separateFromBill: false }).notice).toEqual({ kind: 'not_separate' });
    });

    it('keeps both faults of a short letter that came with the bill', () => {
      expect(review({ separateFromBill: false, letterDate: '2026-11-20' }).notice).toEqual({
        kind: 'short',
        days: 20,
        separate: false,
      });
    });
  });

  describe('exit', () => {
    it('is free when a letter from 12-06-2026 changes a price', () => {
      expect(review().exit).toEqual({ kind: 'free' });
      expect(review({ letterDate: '2026-06-12', renewalDate: '2026-07-20' }).exit).toEqual({
        kind: 'free',
      });
    });

    it('is free when only one price or how the energy is priced changes', () => {
      const same = letter().current;
      expect(review({ next: { ...same, power: { ...same.power, p2: 0.04 } } }).exit).toEqual({
        kind: 'free',
      });
      expect(
        review({ next: { ...same, energy: { p1: 0.144972, p2: 0.144972, p3: 0.144972 } } }).exit,
      ).toEqual({ kind: 'free' });
    });

    it('is not assessed when the letter changes no price', () => {
      expect(review({ next: letter().current }).exit).toEqual({ kind: 'no_change' });
    });

    it('is not checked for a letter before 12-06-2026', () => {
      expect(review({ letterDate: '2026-06-11', renewalDate: '2026-07-20' }).exit).toEqual({
        kind: 'not_checked_before',
        since: '2026-06-12',
      });
    });
  });

  it('asks for a price of both letters in each period or for all of it', () => {
    const periods = { p1: 0.2, p2: 0.15, p3: 0.1 };
    const apart = { power: letter().current.power, energy: periods };
    expect(review({ current: apart }).recalc).toEqual({ kind: 'needs_period_use' });
    expect(review({ next: apart }).recalc).toEqual({ kind: 'needs_period_use' });
  });

  it('flags a declared cost that is more than a euro away, and not one that is a euro away', () => {
    const flat = { power: { p1: 0, p2: 0 }, energy: { all: 0.1 } };
    const declared = (withoutTax: number) =>
      review({
        annualKwh: 1000,
        current: flat,
        next: flat,
        declared: { withoutTax, withTax: null },
      }).recalc;
    expect(declared(101)).toMatchObject({ mismatch: null });
    expect(declared(99)).toMatchObject({ mismatch: null });
    expect(declared(101.01)).toMatchObject({ mismatch: { declared: 101.01, computed: 100 } });
  });

  it('is missing a table when either the tolls or the charges are, whatever the other is', () => {
    const december = BILLS_NORMS.rdl25_2026_december;
    if (december.condition === undefined) throw new Error('fixture expected');
    const open: NormTable = {
      ...BILLS_NORMS,
      rdl25_2026_december: {
        ...december,
        status: 'conditional',
        condition: { ...december.condition, met: null },
      },
    };
    const [held] = BILLS_TABLES.tolls;
    if (held === undefined) throw new Error('fixture expected');
    const unsettled = [
      { ...held, from: '2026-12-01', until: '2026-12-31', norm: 'rdl25_2026_december' as const },
    ];
    for (const [tolls, charges] of [
      [[], unsettled],
      [unsettled, []],
      [[], BILLS_TABLES.charges],
      [BILLS_TABLES.tolls, []],
    ] as const)
      expect(
        reviewRenewalCore(letter(), { tables: { ...BILLS_TABLES, tolls, charges }, norms: open })
          .split,
      ).toEqual({ kind: 'missing_table', day: '2026-12-10' });
  });

  it('is conditional when only the charges depend on a norm not settled', () => {
    const december = BILLS_NORMS.rdl25_2026_december;
    const [held] = BILLS_TABLES.charges;
    if (held === undefined || december.condition === undefined) throw new Error('fixture expected');
    const open: NormTable = {
      ...BILLS_NORMS,
      rdl25_2026_december: {
        ...december,
        status: 'conditional',
        condition: { ...december.condition, met: null },
      },
    };
    const charges = [
      { ...held, from: '2026-12-01', until: '2026-12-31', norm: 'rdl25_2026_december' as const },
    ];
    expect(
      reviewRenewalCore(letter(), { tables: { ...BILLS_TABLES, charges }, norms: open }).split,
    ).toEqual({ kind: 'conditional', norms: ['rdl25_2026_december'] });
  });

  it('splits each period of the energy at its own regulated price', () => {
    const { split } = review({
      current: { power: letter().current.power, energy: { p1: 0.2, p2: 0.15, p3: 0.1 } },
      next: { power: letter().next.power, energy: { p1: 0.25, p2: 0.2, p3: 0.12 } },
    });
    if (split.kind !== 'ok') throw new Error('split expected');
    expect(split.energy).toEqual({
      p1: { regulated: 0.097553, retailerCurrent: 0.102447, retailerNext: 0.152447 },
      p2: { regulated: 0.029267, retailerCurrent: 0.120733, retailerNext: 0.170733 },
      p3: { regulated: 0.003292, retailerCurrent: 0.096708, retailerNext: 0.116708 },
    });
  });

  describe('a change of the regulated part, in any of its prices', () => {
    const base = {
      power: { p1: 1, p2: 1 },
      energy: { p1: 1, p2: 1, p3: 1 },
    };
    const toll = (value: typeof base) => ({
      from: '2026-01-01',
      until: '2026-11-30',
      value,
      norm: 'law38_1992' as const,
      url: 'https://example.test',
    });
    it('shows a change of the regulated part in any of its prices', () => {
      const cases: [string, typeof base][] = [
        ['power p2', { ...base, power: { p1: 1, p2: 2 } }],
        ['energy p1', { ...base, energy: { p1: 2, p2: 1, p3: 1 } }],
        ['energy p2', { ...base, energy: { p1: 1, p2: 2, p3: 1 } }],
        ['energy p3', { ...base, energy: { p1: 1, p2: 1, p3: 2 } }],
      ];
      for (const [label, after] of cases) {
        const tolls = [toll(base), { ...toll(after), from: '2026-12-01', until: '2026-12-31' }];
        const zero = { power: { p1: 0, p2: 0 }, energy: { p1: 0, p2: 0, p3: 0 } };
        const charges = [{ ...toll(zero), until: '2026-12-31' }];
        const own: RenewalDeps = {
          tables: { ...BILLS_TABLES, tolls, charges },
          norms: BILLS_NORMS,
        };
        expect(reviewRenewalCore(letter(), own).split, label).toMatchObject({
          regulatedChange: true,
        });
      }
    });
  });

  it('checks the notice of a letter of the day the rule took effect', () => {
    expect(review({ letterDate: '2026-06-12', renewalDate: '2026-07-20' }).notice).toEqual({
      kind: 'meets',
      days: 38,
    });
  });

  it('lets the customer leave over a letter that changes only one price', () => {
    const cases: [string, RenewalInput['next']][] = [
      ['the power of P1', { power: { p1: 0.2, p2: 0.03 }, energy: { all: 0.1 } }],
      ['the price of all the energy', { power: { p1: 0.1, p2: 0.03 }, energy: { all: 0.2 } }],
      [
        'the price of one period',
        { power: { p1: 0.1, p2: 0.03 }, energy: { p1: 0.1, p2: 0.1, p3: 0.2 } },
      ],
    ];
    for (const [label, next] of cases) {
      const periods = { p1: 0.1, p2: 0.1, p3: 0.1 };
      const current = {
        power: { p1: 0.1, p2: 0.03 },
        energy: 'p1' in next.energy ? periods : { all: 0.1 },
      };
      expect(review({ current, next }).exit, label).toEqual({ kind: 'free' });
    }
  });
});

describe('the whole review of a renewal letter', () => {
  const today = parseDate('2026-11-05');
  const whole = { ...deps, official: null };

  it('gives the errors of a letter that is off, and nothing else', () => {
    expect(reviewRenewal(letter({ annualKwh: -5 }), today, whole)).toEqual({
      ok: false,
      errors: [{ field: 'annualKwh', code: 'kwh_range' }],
    });
  });

  it('puts no taxes on a letter whose cost cannot be recalculated', () => {
    const result = reviewRenewal(letter({ annualKwh: null }), today, whole);
    if (!result.ok) throw new Error('review expected');
    expect(result.review.taxes).toBeNull();
    const ok = reviewRenewal(letter(), today, whole);
    if (!ok.ok) throw new Error('review expected');
    expect(ok.review.taxes).toMatchObject({ kind: 'ok' });
  });
});
