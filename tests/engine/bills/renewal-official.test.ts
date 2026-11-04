import { describe, expect, it } from 'vitest';
import { TOLL_HOLIDAYS } from '../../../src/engine/bills/data/holidays-20td';
import { BILLS_NORMS } from '../../../src/engine/bills/data/norms';
import { BILLS_TABLES } from '../../../src/engine/bills/data/tables';
import {
  pvpcMeansBetween,
  type OfficialDeps,
  type PvpcHourly,
} from '../../../src/engine/bills/electricity-official';
import type { NormTable } from '../../../src/engine/bills/norms';
import { compareWithPvpc, renewalTaxes } from '../../../src/engine/bills/renewal-official';
import type { RenewalDeps, RenewalInput } from '../../../src/engine/bills/renewal-types';
import { round2 } from '../../../src/engine/money';
import { fromOrdinal, ordinal, parseDate, toIso } from '../../../src/engine/date';

const letter = (change: Partial<RenewalInput> = {}): RenewalInput => ({
  letterDate: '2026-10-31',
  renewalDate: '2026-10-31',
  powerKw: { p1: 5.75, p2: 5.75 },
  powerUnit: 'per_kw_day',
  current: { power: { p1: 0.110283, p2: 0.033469 }, energy: { all: 0.144972 } },
  next: { power: { p1: 0.12303, p2: 0.052329 }, energy: { all: 0.1678 } },
  annualKwh: 4190.2,
  declared: { withoutTax: 1071.15, withTax: 1362.36 },
  separateFromBill: true,
  ...change,
});

const deps: RenewalDeps = { tables: BILLS_TABLES, norms: BILLS_NORMS };

const flat = (firstDay: string, lastDay: string, price: number): PvpcHourly => {
  const days: Record<string, readonly (readonly [number, number])[]> = {};
  const hours = Array.from({ length: 24 }, (_, h) => [h, price] as const);
  for (let n = ordinal(parseDate(firstDay)); n <= ordinal(parseDate(lastDay)); n++) {
    days[toIso(fromOrdinal(n))] = hours;
  }
  return { coveredUntil: lastDay, days };
};

describe('pvpcMeansBetween', () => {
  it('averages the days after `from` up to `to`', () => {
    const pvpc: PvpcHourly = {
      coveredUntil: '2026-10-14',
      days: {
        '2026-10-13': Array.from({ length: 24 }, (_, h) => [h, 100 + h] as const),
        '2026-10-14': Array.from({ length: 24 }, (_, h) => [h, 100 + h] as const),
      },
    };
    const means = pvpcMeansBetween(parseDate('2026-10-12'), parseDate('2026-10-14'), {
      pvpc,
      tollHolidays: TOLL_HOLIDAYS,
    });
    expect(means).toEqual({ p1: 0.1155, p2: 0.1155, p3: 0.1035, all: 0.1115 });
    expect(
      pvpcMeansBetween(parseDate('2026-10-11'), parseDate('2026-10-14'), {
        pvpc,
        tollHolidays: TOLL_HOLIDAYS,
      }),
    ).toBeNull();
  });
});

describe('comparing a renewal with the PVPC', () => {
  const officialDeps = (pvpc: PvpcHourly): RenewalDeps & OfficialDeps => ({
    ...deps,
    pvpc,
    tollHolidays: [...TOLL_HOLIDAYS, { year: 2025, days: [], citation: 'test', url: 'test' }],
  });

  it('uses the last 365 days available', () => {
    const pvpc = flat('2025-01-01', '2026-10-14', 150);
    expect(compareWithPvpc(letter(), officialDeps(pvpc))).toEqual({
      kind: 'ok',
      from: '2025-10-15',
      to: '2026-10-14',
      months: null,
      // 5,75 kW × (27,704413 + 3,113) on P1 and × 0,725423 on P2, plus 4.190,2 kWh × 0,150.
      annual: 809.9,
      next: 1071.15,
      difference: 261.25,
      doubt: 'ccf_not_updated_since_2016',
    });
  });

  it('starts at the first day when fewer than 365 are published, and counts its months', () => {
    expect(
      compareWithPvpc(letter(), officialDeps(flat('2026-10-01', '2026-10-14', 150))),
    ).toMatchObject({ kind: 'ok', from: '2026-10-01', to: '2026-10-14', months: 0, annual: 809.9 });
    expect(
      compareWithPvpc(letter(), officialDeps(flat('2026-01-01', '2026-10-31', 150))),
    ).toMatchObject({ kind: 'ok', from: '2026-01-01', to: '2026-10-31', months: 10 });
  });

  it('has no data without PVPC prices', () => {
    expect(
      compareWithPvpc(letter(), officialDeps({ coveredUntil: '2026-10-14', days: {} })),
    ).toEqual({ kind: 'no_data' });
  });

  it('names the missing tables for a 2027 renewal, not the PVPC prices', () => {
    expect(
      compareWithPvpc(
        letter({ renewalDate: '2027-02-01' }),
        officialDeps(flat('2026-10-01', '2026-10-14', 150)),
      ),
    ).toEqual({ kind: 'missing_table', day: '2027-02-01' });
  });

  it('names the norms when the tables of the renewal day are still open', () => {
    const december = BILLS_NORMS.rdl25_2026_december;
    const [held] = BILLS_TABLES.tolls;
    if (held === undefined || december.condition === undefined) throw new Error('fixture expected');
    const norms: NormTable = {
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
    expect(
      compareWithPvpc(letter({ renewalDate: '2026-12-10' }), {
        ...officialDeps(flat('2026-10-01', '2026-10-14', 150)),
        tables: { ...BILLS_TABLES, tolls },
        norms,
      }),
    ).toEqual({ kind: 'conditional', norms: ['rdl25_2026_december'] });
  });

  it('compares in a year whose toll holidays are not loaded', () => {
    const pvpc = flat('2027-01-01', '2027-01-14', 150);
    expect(compareWithPvpc(letter(), officialDeps(pvpc))).toMatchObject({
      kind: 'ok',
      from: '2027-01-01',
      to: '2027-01-14',
      annual: 809.9,
    });
  });

  it('asks for the consumption when the letter gives none', () => {
    expect(
      compareWithPvpc(
        letter({ annualKwh: null }),
        officialDeps(flat('2026-10-01', '2026-10-14', 150)),
      ),
    ).toEqual({ kind: 'no_consumption' });
  });
});

describe('taxes of a renewal', () => {
  it('applies the general rates on a general month', () => {
    expect(renewalTaxes(letter(), 1071.15, deps)).toEqual({
      kind: 'ok',
      electricityTaxPercent: 5.11269632,
      vatPercent: 21,
      withTax: 1362.36,
      declaredMatches: true,
    });
  });

  it('compares the declared cost with taxes within 1 €', () => {
    const matches = (withTax: number | null) => {
      const result = renewalTaxes(
        letter({ declared: { withoutTax: null, withTax } }),
        1071.15,
        deps,
      );
      return result.kind === 'ok' ? result.declaredMatches : 'not ok';
    };
    expect(matches(1363.3)).toBe(true);
    expect(matches(1400)).toBe(false);
    expect(matches(null)).toBeNull();
  });

  describe('on a month that depends on a norm not yet settled', () => {
    const december = BILLS_NORMS.rdl25_2026_december;
    const open: NormTable = {
      ...BILLS_NORMS,
      rdl25_2026_december: {
        ...december,
        status: 'conditional',
        condition: {
          text: december.condition?.text ?? '',
          decidesOn: december.condition?.decidesOn ?? '',
          source: december.condition?.source ?? '',
          met: null,
        },
      },
    };
    const renewal = letter({ renewalDate: '2026-12-10' });

    it('gives each way it may go and picks none', () => {
      const result = renewalTaxes(renewal, 1071.15, { tables: BILLS_TABLES, norms: open });
      const dec = 'rdl25_2026_december';
      expect(result).toEqual({
        kind: 'conditional',
        options: [
          {
            when: [{ met: [dec, 'rdl25_2026'], notMet: [] }],
            electricityTaxPercent: 0.5,
            vatPercent: 10,
            withTax: 1184.16,
          },
          {
            when: [
              { met: [], notMet: [dec, 'rdl25_2026'] },
              { met: [dec], notMet: ['rdl25_2026'] },
              { met: ['rdl25_2026'], notMet: [dec] },
            ],
            electricityTaxPercent: 5.11269632,
            vatPercent: 21,
            withTax: 1362.36,
          },
        ],
        unknown: [],
      });
    });

    it('lists the outcomes in which a table has no row', () => {
      const result = renewalTaxes(renewal, 1071.15, {
        tables: {
          ...BILLS_TABLES,
          electricityTax: BILLS_TABLES.electricityTax.filter((r) => r.unless === undefined),
        },
        norms: open,
      });
      if (result.kind !== 'conditional') throw new Error('conditional expected');
      expect(result.options).toHaveLength(1);
      expect(result.unknown).toHaveLength(3);
    });

    it('never mixes rows that need the opposite of the same norm', () => {
      const june = BILLS_NORMS.rdl7_2026_june;
      const norms: NormTable = {
        ...BILLS_NORMS,
        rdl7_2026_june: {
          ...june,
          status: 'conditional',
          condition: {
            text: june.condition?.text ?? '',
            decidesOn: june.condition?.decidesOn ?? '',
            source: june.condition?.source ?? '',
            met: null,
          },
        },
        rdl10_2026: { ...BILLS_NORMS.rdl10_2026, status: 'pending_validation' },
      };
      const result = renewalTaxes(letter({ renewalDate: '2026-06-10' }), 1071.15, {
        tables: BILLS_TABLES,
        norms,
      });
      if (result.kind !== 'conditional') throw new Error('conditional expected');
      expect(result.options.map((o) => [o.electricityTaxPercent, o.vatPercent])).toEqual([
        [0.5, 10],
        [0.5, 21],
        [5.11269632, 21],
      ]);
      expect(result.options.map((o) => o.when.length)).toEqual([1, 1, 2]);
      const outcomes = result.options.flatMap((o) => o.when.map((w) => [...w.met].sort().join()));
      expect(new Set(outcomes).size).toBe(4);
      for (const { met, notMet } of result.options.flatMap((o) => o.when)) {
        expect(met.filter((id) => notMet.includes(id))).toEqual([]);
      }
      expect(result.unknown).toEqual([]);
    });

    it('reads the reduced VAT only up to the power limit', () => {
      const result = renewalTaxes({ ...renewal, powerKw: { p1: 10.4, p2: 10.4 } }, 1071.15, {
        tables: BILLS_TABLES,
        norms: open,
      });
      expect(result).toMatchObject({
        options: [
          { vatPercent: 21, withTax: round2(1071.15 * 1.005 * 1.21) },
          { vatPercent: 21, withTax: 1362.36 },
        ],
      });
    });
  });

  it('is missing for a day with no rates', () => {
    expect(renewalTaxes(letter({ renewalDate: '2027-01-15' }), 1071.15, deps)).toEqual({
      kind: 'missing',
    });
  });
});
