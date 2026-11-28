import { describe, expect, it } from 'vitest';
import { TOLL_HOLIDAYS } from '../../../src/engine/bills/data/holidays-20td';
import { BILLS_NORMS } from '../../../src/engine/bills/data/norms';
import { NORMS_BEFORE_FIGURE } from './norms-before-figure';
import { BILLS_TABLES } from '../../../src/engine/bills/data/tables';
import {
  pvpcMeansBetween,
  type OfficialDeps,
  type PvpcHourly,
} from '../../../src/engine/bills/electricity-official';
import type { NormTable } from '../../../src/engine/bills/norms';
import type { Table, TableRow } from '../../../src/engine/bills/tables';
import { compareWithPvpc, renewalTaxes } from '../../../src/engine/bills/renewal-official';
import type { ElectricityTaxRate, VatRate } from '../../../src/engine/bills/tables';
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

  it('applies the general rates in December 2026: the October figure missed the 15 %', () => {
    expect(renewalTaxes(letter({ renewalDate: '2026-12-10' }), 1071.15, deps)).toMatchObject({
      kind: 'ok',
      electricityTaxPercent: 5.11269632,
      vatPercent: 21,
    });
  });

  describe('on a month that depends on a norm not yet settled', () => {
    const december = NORMS_BEFORE_FIGURE.rdl25_2026_december;
    const open: NormTable = {
      ...NORMS_BEFORE_FIGURE,
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

describe('more cases of the PVPC comparison', () => {
  const officialDeps = (
    pvpc: PvpcHourly,
    change: Partial<RenewalDeps> = {},
  ): RenewalDeps & OfficialDeps => ({
    ...deps,
    ...change,
    pvpc,
    tollHolidays: [...TOLL_HOLIDAYS, { year: 2025, days: [], citation: 'test', url: 'test' }],
  });
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
  const held = <V>(table: Table<V>, change: Partial<TableRow<V>>): Table<V> => {
    const [row] = table;
    if (row === undefined) throw new Error('no row');
    return [{ ...row, ...change }];
  };
  const pvpc = flat('2026-10-01', '2026-10-14', 150);

  it('needs the use of each period when the letter prices them apart', () => {
    const apart = { p1: 0.2, p2: 0.15, p3: 0.1 };
    const next = { power: letter().next.power, energy: apart };
    expect(compareWithPvpc(letter({ next }), officialDeps(pvpc))).toEqual({
      kind: 'needs_period_use',
    });
  });

  it('counts the whole months the prices cover, across a year', () => {
    // From 20-11-2025 to 14-10-2026: ten whole months, and a few days over.
    expect(
      compareWithPvpc(letter(), officialDeps(flat('2025-11-20', '2026-10-14', 150))),
    ).toMatchObject({
      kind: 'ok',
      months: 10,
    });
  });

  it('starts from the first day published, whatever the order the days come in', () => {
    const days = Object.fromEntries(
      Object.entries(flat('2026-10-01', '2026-10-14', 150).days).reverse(),
    );
    expect(
      compareWithPvpc(letter(), officialDeps({ coveredUntil: '2026-10-14', days })),
    ).toMatchObject({
      kind: 'ok',
      from: '2026-10-01',
    });
  });

  it('has no data when a day between the first and the last has no prices', () => {
    const { days } = flat('2026-10-01', '2026-10-14', 150);
    const gap = { ...days };
    delete gap['2026-10-05'];
    expect(
      compareWithPvpc(letter(), officialDeps({ coveredUntil: '2026-10-14', days: gap })),
    ).toEqual({
      kind: 'no_data',
    });
  });

  it.each([
    ['the tolls', { tolls: [] }],
    ['the PVPC margin', { pvpcMargin: [] }],
  ])('names the day when %s are not loaded', (_, tables) => {
    expect(
      compareWithPvpc(letter(), officialDeps(pvpc, { tables: { ...BILLS_TABLES, ...tables } })),
    ).toEqual({ kind: 'missing_table', day: '2026-10-31' });
  });

  it.each([
    ['the tolls', 'tolls'],
    ['the PVPC margin', 'pvpcMargin'],
  ] as const)('names the norms when only %s depend on one', (_, name) => {
    const tables = {
      ...BILLS_TABLES,
      [name]: held(BILLS_TABLES[name] as Table<unknown>, {
        from: '2026-12-01',
        until: '2026-12-31',
        norm: 'rdl25_2026_december',
      }),
    };
    expect(
      compareWithPvpc(
        letter({ renewalDate: '2026-12-10' }),
        officialDeps(pvpc, { tables, norms: open }),
      ),
    ).toEqual({ kind: 'conditional', norms: ['rdl25_2026_december'] });
  });
});

describe('more cases of the taxes of a renewal', () => {
  const december = NORMS_BEFORE_FIGURE.rdl25_2026_december;
  const open: NormTable = {
    ...NORMS_BEFORE_FIGURE,
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
  const base = { from: '2026-12-01', until: '2026-12-31' };
  const taxRow = (
    percent: number,
    norm: TableRow<ElectricityTaxRate>['norm'],
    change: Partial<TableRow<ElectricityTaxRate>> = {},
  ): TableRow<ElectricityTaxRate> => ({
    ...base,
    value: { percent, minimumPerMwh: 0 },
    norm,
    url: BILLS_NORMS[norm].url,
    ...change,
  });
  const vatRow = (
    value: VatRate,
    norm: TableRow<VatRate>['norm'],
    change: Partial<TableRow<VatRate>> = {},
  ): TableRow<VatRate> => ({ ...base, value, norm, url: BILLS_NORMS[norm].url, ...change });
  const general21 = vatRow({ kind: 'general', percent: 21 }, 'law37_1992');
  const taxes = (
    electricityTax: Table<ElectricityTaxRate>,
    vat: Table<VatRate>,
    input: RenewalInput = renewal,
    norms: NormTable = open,
  ) => renewalTaxes(input, 1000, { tables: { ...BILLS_TABLES, electricityTax, vat }, norms });
  const optionsOf = (result: ReturnType<typeof renewalTaxes>) =>
    result.kind === 'conditional'
      ? result.options.map((o) => [o.electricityTaxPercent, o.vatPercent])
      : result.kind;

  describe('while a norm is not settled', () => {
    const reduced = taxRow(0.5, 'rdl25_2026_december');
    const general = taxRow(5.11, 'law38_1992', { unless: ['rdl25_2026_december'] });

    it.each([
      ['the reduced row first', [reduced, general]],
      ['the general row first', [general, reduced]],
    ])('picks, in each way it may go, the row that holds, with %s', (_, rows) => {
      const result = taxes(rows, [general21]);
      expect(optionsOf(result)).toEqual([
        [0.5, 21],
        [5.11, 21],
      ]);
      if (result.kind !== 'conditional') throw new Error('conditional');
      expect(result.options.map((o) => o.when)).toEqual([
        [{ met: ['rdl25_2026_december'], notMet: [] }],
        [{ met: [], notMet: ['rdl25_2026_december'] }],
      ]);
    });

    it('takes the norms that decide from the VAT alone when the tax is settled', () => {
      const vat = BILLS_TABLES.vat.filter((r) => r.from === '2026-12-01');
      const result = taxes([taxRow(5.11, 'law38_1992')], vat);
      expect(optionsOf(result)).toEqual([
        [5.11, 10],
        [5.11, 21],
      ]);
      if (result.kind !== 'conditional') throw new Error('conditional');
      const decided = result.options.flatMap((o) => o.when.flatMap((w) => [...w.met, ...w.notMet]));
      expect(new Set(decided)).toEqual(new Set(['rdl25_2026_december', 'rdl25_2026']));
    });

    it.each([
      [
        'the reduced row first',
        [reduced, taxRow(5.11, 'law38_1992', { unless: ['rdl25_2026_december', 'rdl10_2026'] })],
      ],
      [
        'the general row first',
        [taxRow(5.11, 'law38_1992', { unless: ['rdl25_2026_december', 'rdl10_2026'] }), reduced],
      ],
    ])(
      'gives way to the reduced row only when every norm it gives way to holds, with %s',
      (_, rows) => {
        // rdl10_2026 is in force and decides nothing: it holds in every way the rest may go.
        expect(optionsOf(taxes(rows, [general21]))).toEqual([
          [0.5, 21],
          [5.11, 21],
        ]);
      },
    );

    it('lists the ways in which the VAT has no row', () => {
      const result = taxes(
        [reduced, general],
        [vatRow({ kind: 'general', percent: 21 }, 'rdl25_2026_december')],
      );
      if (result.kind !== 'conditional') throw new Error('conditional');
      expect(result.unknown).toEqual([{ met: [], notMet: ['rdl25_2026_december'] }]);
    });

    it('keeps a row that gives way only to a norm that is not in force and decides nothing', () => {
      const result = taxes(
        [taxRow(9, 'law38_1992', { unless: ['rdl18_2026_august'] }), reduced],
        [general21],
      );
      expect(optionsOf(result)).toEqual([[9, 21]]);
      if (result.kind !== 'conditional') throw new Error('conditional');
      expect(result.unknown).toEqual([]);
    });
  });

  describe('the reduced VAT, by power', () => {
    const reducedVat = (powerLimitIncluded: boolean) =>
      vatRow(
        {
          kind: 'reduced',
          percent: 10,
          generalPercent: 21,
          powerLimitKw: 10,
          powerLimitIncluded,
          severeVulnerable: true,
        },
        'law37_1992',
      );
    const vatFor = (included: boolean, kw: number) => {
      const result = renewalTaxes(
        letter({ renewalDate: '2026-12-10', powerKw: { p1: kw, p2: kw } }),
        1000,
        {
          tables: {
            ...BILLS_TABLES,
            electricityTax: [taxRow(5.11, 'law38_1992')],
            vat: [reducedVat(included)],
          },
          norms: BILLS_NORMS,
        },
      );
      return result.kind === 'ok' ? result.vatPercent : result.kind;
    };

    it.each([
      [true, 10, 10],
      [true, 10.1, 21],
      [false, 10, 21],
      [false, 9.9, 10],
    ])('a limit included %s and a supply of %s kW pays %s', (included, kw, percent) => {
      expect(vatFor(included, kw)).toBe(percent);
    });
  });

  describe('with a table that has no row', () => {
    it.each([
      ['no tax', [], [general21]],
      ['no VAT', [taxRow(5.11, 'law38_1992')], []],
    ])('is missing with %s', (_, tax, vat) => {
      expect(taxes(tax, vat, renewal, BILLS_NORMS)).toEqual({ kind: 'missing' });
    });
  });

  it('takes a declared cost a euro off as matching, and a cent more as not', () => {
    const plain = {
      ...BILLS_TABLES,
      electricityTax: [taxRow(0, 'law38_1992')],
      vat: [vatRow({ kind: 'general', percent: 0 }, 'law37_1992')],
    };
    const declared = (withTax: number) => {
      const result = renewalTaxes(
        letter({ renewalDate: '2026-12-10', declared: { withoutTax: null, withTax } }),
        100,
        {
          tables: plain,
          norms: BILLS_NORMS,
        },
      );
      return result.kind === 'ok' ? result.declaredMatches : result.kind;
    };
    expect(declared(101)).toBe(true);
    expect(declared(99)).toBe(true);
    expect(declared(101.01)).toBe(false);
  });
});
