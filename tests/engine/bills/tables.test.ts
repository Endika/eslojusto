import { describe, expect, it } from 'vitest';
import { BILLS_NORMS } from '../../../src/engine/bills/data/norms';
import { BILLS_TABLES } from '../../../src/engine/bills/data/tables';
import type { BillsNormId, Norm, NormTable } from '../../../src/engine/bills/norms';
import {
  TABLE_NAMES,
  valueOn,
  type Lookup,
  type Table,
  type TableRow,
} from '../../../src/engine/bills/tables';
import { addDays, parseDate, toIso } from '../../../src/engine/date';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const round6 = (v: number) => Math.round(v * 1e6) / 1e6;

// A conditional norm settled as the monthly review would, by setting `condition.met`.
const settled = (norm: Norm, met: boolean): Norm => {
  if (norm.condition === undefined) throw new Error(`${norm.id} has no condition`);
  return { ...norm, condition: { ...norm.condition, met } };
};

const withSettled = (met: Partial<Record<BillsNormId, boolean>>): NormTable => {
  const norms: Record<string, Norm> = { ...BILLS_NORMS };
  for (const [id, value] of Object.entries(met))
    norms[id] = settled(BILLS_NORMS[id as BillsNormId], value);
  return norms as NormTable;
};

// RDL 25/2026 validated by the Congress.
const validated = (norms: NormTable): NormTable => ({
  ...norms,
  rdl25_2026: { ...norms.rdl25_2026, status: 'in_force', statusSince: '2026-10-30' },
});

// RDL 25/2026 repealed by the Congress before November.
const repealed = (norms: NormTable): NormTable => ({
  ...norms,
  rdl25_2026: {
    ...norms.rdl25_2026,
    status: 'repealed',
    inForceUntil: '2026-10-30',
    statusSince: '2026-10-30',
  },
});

// Every way the open conditions and the validation of RDL 25/2026 can be settled.
const WORLDS: readonly NormTable[] = [false, true].flatMap((november) =>
  [false, true].flatMap((december) => {
    const norms = withSettled({ rdl25_2026_november: november, rdl25_2026_december: december });
    return [validated(norms), repealed(norms)];
  }),
);

const days2026 = Array.from({ length: 365 }, (_, i) => toIso(addDays(parseDate('2026-01-01'), i)));

const valueOf = <V>(lookup: Lookup<V>): V => {
  if (lookup.kind !== 'ok') throw new Error(`Expected one value, got ${lookup.kind}`);
  return lookup.row.value;
};

describe('looking a value up by day', () => {
  const row = (change: Partial<TableRow<number>>): TableRow<number> => ({
    from: '2030-01-01',
    until: '2030-01-31',
    value: 1,
    norm: 'law37_1992',
    url: BILLS_NORMS.law37_1992.url,
    ...change,
  });
  const reduction: Norm = {
    ...BILLS_NORMS.rdl25_2026_november,
    inForceSince: '2030-02-01',
    inForceUntil: '2030-02-28',
  };
  const norms: NormTable = { ...BILLS_NORMS, rdl25_2026_november: reduction };
  const table: Table<number> = [
    row({}),
    row({ from: '2030-02-01', until: '2030-02-28', value: 2, norm: 'rdl25_2026_november' }),
    row({ from: '2030-02-01', until: '2030-02-28', unless: ['rdl25_2026_november'] }),
  ];

  it('gives the one row covering the day', () => {
    expect(valueOn(table, '2030-01-31', norms)).toEqual({ kind: 'ok', row: table[0] });
  });

  it('never reaches for the row before: a day no row covers has no value', () => {
    expect(valueOn(table, '2030-03-01', norms)).toEqual({ kind: 'missing' });
    expect(valueOn(table, '2029-12-31', norms)).toEqual({ kind: 'missing' });
  });

  it('while a condition is open, gives both rows and the norm that decides', () => {
    expect(valueOn(table, '2030-02-10', norms)).toEqual({
      kind: 'conditional',
      rows: [table[1], table[2]],
      norms: ['rdl25_2026_november'],
    });
  });

  it('once settled, gives the row of the branch taken', () => {
    expect(
      valueOf(
        valueOn(table, '2030-02-10', { ...norms, rdl25_2026_november: settled(reduction, true) }),
      ),
    ).toBe(2);
    expect(
      valueOf(
        valueOn(table, '2030-02-10', { ...norms, rdl25_2026_november: settled(reduction, false) }),
      ),
    ).toBe(1);
  });

  it('opens both rows while the decree holding a met condition awaits validation', () => {
    const decree: Norm = { ...BILLS_NORMS.rdl25_2026, inForceSince: '2030-01-15' };
    const held: Table<number> = [
      row({
        from: '2030-02-01',
        until: '2030-02-28',
        value: 2,
        norm: 'rdl25_2026_november',
        alsoRestsOn: ['rdl25_2026'],
      }),
      row({
        from: '2030-02-01',
        until: '2030-02-28',
        unless: ['rdl25_2026_november', 'rdl25_2026'],
      }),
    ];
    const met = { ...norms, rdl25_2026_november: settled(reduction, true), rdl25_2026: decree };
    expect(valueOn(held, '2030-02-10', met)).toEqual({
      kind: 'conditional',
      rows: held,
      norms: ['rdl25_2026'],
    });
    expect(valueOf(valueOn(held, '2030-02-10', validated(met)))).toBe(2);
    const notMet = { ...met, rdl25_2026_november: settled(reduction, false) };
    expect(valueOf(valueOn(held, '2030-02-10', notMet))).toBe(1);
  });

  it('reads a norm that reaches back from the day it came into force', () => {
    const forward = row({ from: '2030-01-01', norm: 'rdl25_2026_november' });
    const inForce = { ...norms, rdl25_2026_november: settled(reduction, true) };
    expect(valueOf(valueOn([{ ...forward, appliesBack: true }], '2030-01-10', inForce))).toBe(1);
    expect(valueOn([forward], '2030-01-10', inForce)).toEqual({ kind: 'missing' });
  });

  it('refuses two rows that hold on the same day', () => {
    expect(() => valueOn([row({}), row({ value: 3 })], '2030-01-10', norms)).toThrow(RangeError);
  });
});

describe('the 2026 figures', () => {
  const on = (day: string) => {
    const tolls = valueOf(valueOn(BILLS_TABLES.tolls, day, BILLS_NORMS));
    const charges = valueOf(valueOn(BILLS_TABLES.charges, day, BILLS_NORMS));
    return { tolls, charges };
  };

  it('add tolls and charges up to the access prices of the 2.0TD tariff', () => {
    const { tolls, charges } = on('2026-06-15');
    expect(round6(tolls.power.p1 + charges.power.p1)).toBe(27.704413);
    expect(round6(tolls.power.p2 + charges.power.p2)).toBe(0.725423);
    expect(round6(tolls.energy.p1 + charges.energy.p1)).toBe(0.097553);
    expect(round6(tolls.energy.p2 + charges.energy.p2)).toBe(0.029267);
    expect(round6(tolls.energy.p3 + charges.energy.p3)).toBe(0.003292);
  });

  it('give the PVPC power price of P1 with the fixed margin, flagged as a 2016 figure', () => {
    const { tolls, charges } = on('2026-06-15');
    const margin = valueOn(BILLS_TABLES.pvpcMargin, '2026-06-15', BILLS_NORMS);
    if (margin.kind !== 'ok') throw new Error('margin');
    expect(round6(tolls.power.p1 + charges.power.p1 + margin.row.value)).toBe(30.817413);
    expect(margin.row.doubt).toBe('ccf_not_updated_since_2016');
  });

  it('charge the social bonus funding by the day, with its change on 26-06-2026', () => {
    const daily = (day: string) =>
      round6(valueOf(valueOn(BILLS_TABLES.socialBonusFunding, day, BILLS_NORMS)) / 365);
    expect(daily('2026-06-25')).toBe(0.019121);
    expect(daily('2026-06-26')).toBe(0.024688);
  });

  it('rent a single-phase meter for the daily equivalent of its monthly price', () => {
    const rent = valueOf(valueOn(BILLS_TABLES.meter, '2026-06-15', BILLS_NORMS));
    expect(round6((rent.singlePhase * 12) / 365)).toBe(0.02663);
    expect(rent.threePhase).toBe(1.36);
  });

  it('discount 42,5 % and 57,5 % with the social bonus, up to the caps of annex I', () => {
    expect(valueOf(valueOn(BILLS_TABLES.socialBonusDiscount, '2026-06-15', BILLS_NORMS))).toEqual({
      vulnerable: 42.5,
      severe: 57.5,
    });
    expect(valueOf(valueOn(BILLS_TABLES.socialBonusCaps, '2026-06-15', BILLS_NORMS))).toEqual([
      1587, 2222, 2698, 4761,
    ]);
  });
});

describe('the tax rates of 2026, by the day the bill falls due', () => {
  const tax = (day: string, norms: NormTable = BILLS_NORMS) =>
    valueOn(BILLS_TABLES.electricityTax, day, norms);
  const vat = (day: string, norms: NormTable = BILLS_NORMS) =>
    valueOn(BILLS_TABLES.vat, day, norms);

  it.each([
    ['2026-03-21', 5.11269632, 21],
    ['2026-03-22', 0.5, 10],
    ['2026-05-31', 0.5, 10],
    ['2026-06-01', 5.11269632, 21],
    ['2026-06-30', 5.11269632, 21],
    ['2026-08-15', 5.11269632, 21],
    ['2026-09-30', 5.11269632, 21],
    ['2026-10-31', 5.11269632, 21],
  ])('on %s: electricity tax %s %, VAT %s %', (day, electricity, value) => {
    expect(valueOf(tax(day)).percent).toBe(electricity);
    expect(valueOf(tax(day)).minimumPerMwh).toBe(1);
    expect(valueOf(vat(day)).percent).toBe(value);
  });

  it('from 22-03-2026 reduce VAT under 10 kW, and from 30-04-2026 at 10 kW too', () => {
    expect(valueOf(vat('2026-04-29'))).toEqual({
      kind: 'reduced',
      percent: 10,
      generalPercent: 21,
      powerLimitKw: 10,
      powerLimitIncluded: false,
      severeVulnerable: true,
    });
    expect(valueOf(vat('2026-04-30'))).toMatchObject({ powerLimitIncluded: true });
    expect(vat('2026-04-30')).toMatchObject({ row: { alsoRestsOn: ['rdl10_2026'] } });
  });

  it.each([
    ['2026-06-15', 'rdl7_2026_june'],
    ['2026-08-15', 'rdl18_2026_august'],
    ['2026-09-15', 'rdl18_2026_september'],
  ] as const)('on %s apply the general rates: %s was settled as not met', (day, norm) => {
    expect(BILLS_NORMS[norm].condition?.met).toBe(false);
    expect(valueOf(tax(day)).percent).toBe(5.11269632);
    expect(valueOf(vat(day)).percent).toBe(21);
    const met = withSettled({ [norm]: true });
    expect(valueOf(tax(day, met)).percent).toBe(0.5);
    expect(valueOf(vat(day, met))).toMatchObject({ percent: 10, severeVulnerable: true });
  });

  it.each([
    ['2026-11-05', 'rdl25_2026_november'],
    ['2026-12-20', 'rdl25_2026_december'],
  ] as const)('on %s depend on a CPI figure still to come (%s)', (day, norm) => {
    const percents = (lookup: Lookup<{ readonly percent: number }>) =>
      lookup.kind === 'conditional'
        ? { percents: lookup.rows.map((r) => r.value.percent), norms: lookup.norms }
        : lookup.kind;
    expect(percents(tax(day))).toEqual({
      percents: [0.5, 5.11269632],
      norms: [norm, 'rdl25_2026'],
    });
    expect(percents(vat(day))).toEqual({ percents: [10, 21], norms: [norm, 'rdl25_2026'] });
    expect(vat(day)).toMatchObject({
      rows: [{ value: { powerLimitIncluded: true, severeVulnerable: true } }, {}],
    });
  });

  it('in November, take the branch the review sets, changing only the norm table', () => {
    const met = validated(withSettled({ rdl25_2026_november: true }));
    const notMet = withSettled({ rdl25_2026_november: false });
    expect(valueOf(tax('2026-11-05', met)).percent).toBe(0.5);
    expect(valueOf(vat('2026-11-05', met)).percent).toBe(10);
    expect(valueOf(tax('2026-11-05', notMet)).percent).toBe(5.11269632);
    expect(valueOf(vat('2026-11-05', notMet)).percent).toBe(21);
    expect(tax('2026-12-05', met).kind).toBe('conditional');
    // Met while RDL 25/2026 still awaits validation, both rates stay open.
    expect(tax('2026-11-05', withSettled({ rdl25_2026_november: true }))).toMatchObject({
      kind: 'conditional',
      norms: ['rdl25_2026'],
    });
  });

  it('have no value in 2027 until its rates are loaded', () => {
    expect(vat('2027-01-10')).toEqual({ kind: 'missing' });
    expect(tax('2027-01-10')).toEqual({ kind: 'missing' });
  });

  it('leave a month without its rate empty instead of reusing the one before', () => {
    const withoutJuly = BILLS_TABLES.vat.filter((r) => r.from !== '2026-07-01');
    expect(valueOn(withoutJuly, '2026-06-30', BILLS_NORMS).kind).toBe('ok');
    expect(valueOn(withoutJuly, '2026-07-01', BILLS_NORMS)).toEqual({ kind: 'missing' });
  });
});

describe('the bills tables', () => {
  it('discount the social bonus from 01-01-2026, as RDL 7/2026 reaches back', () => {
    expect(valueOn(BILLS_TABLES.socialBonusDiscount, '2026-01-02', BILLS_NORMS)).toMatchObject({
      kind: 'ok',
      row: { norm: 'rdl7_2026', appliesBack: true },
    });
  });

  it.each(TABLE_NAMES)(
    '%s gives one value a day in 2026, however the conditions and the validation settle',
    (name) => {
      const table: Table<unknown> = BILLS_TABLES[name];
      for (const norms of WORLDS)
        for (const day of days2026) {
          const lookup = valueOn(table, day, norms);
          expect(lookup.kind, `${name} on ${day}`).toBe('ok');
        }
    },
  );

  it.each(TABLE_NAMES)('%s rows are dated and link under the norm they rest on', (name) => {
    const table: Table<unknown> = BILLS_TABLES[name];
    for (const row of table) {
      const norm = BILLS_NORMS[row.norm];
      expect(row.from).toMatch(ISO);
      if (row.until !== null) expect(row.until >= row.from).toBe(true);
      if (row.appliesBack !== true) expect(row.from >= norm.inForceSince).toBe(true);
      expect(row.url.startsWith(norm.url.split('#')[0] ?? '')).toBe(true);
      for (const id of row.unless ?? []) expect(BILLS_NORMS[id]).toBeDefined();
    }
  });
});

describe('the bills norm table', () => {
  it.each(Object.entries(BILLS_NORMS))('%s is dated and links to its BOE id', (id, norm) => {
    expect(norm.id).toBe(id);
    expect(norm.url).toMatch(
      /^https:\/\/www\.boe\.es\/(buscar\/act|diario_boe\/txt)\.php\?id=BOE-A-\d{4}-\d+(#[\w-]+)?$/,
    );
    expect(norm.inForceSince).toMatch(ISO);
    if (norm.statusUrl !== null) expect(norm.statusSince).toMatch(ISO);
  });

  it.each([
    ['cnmc_tolls_2026', 'BOE-A-2025-26348', '2025-12-23'],
    ['order_ted1524_2025', 'BOE-A-2025-26705', '2026-01-01'],
    ['order_ted634_2026', 'BOE-A-2026-13759', '2026-06-26'],
    ['order_etu1948_2016', 'BOE-A-2016-12274', '2016-12-25'],
    ['rdl7_2026', 'BOE-A-2026-6544', '2026-03-22'],
    ['rdl10_2026', 'BOE-A-2026-9286', '2026-04-30'],
    ['rdl18_2026', 'BOE-A-2026-14112', '2026-07-01'],
    ['rdl25_2026', 'BOE-A-2026-20265', '2026-10-01'],
    ['order_iet1491_2013', 'BOE-A-2013-8561', '2013-08-03'],
    ['rd897_2017', 'BOE-A-2017-11505', '2017-10-08'],
  ] as const)('%s is %s, in force from %s', (id, boe, since) => {
    expect(BILLS_NORMS[id].url).toMatch(new RegExp(`id=${boe}$`));
    expect(BILLS_NORMS[id].inForceSince).toBe(since);
  });

  it('every norm backs a row', () => {
    const cited = new Set(
      TABLE_NAMES.flatMap((name) =>
        (BILLS_TABLES[name] as Table<unknown>).flatMap((r) => [r.norm, ...(r.alsoRestsOn ?? [])]),
      ),
    );
    expect(Object.keys(BILLS_NORMS).filter((id) => !cited.has(id as BillsNormId))).toEqual([]);
  });

  it('RDL 25/2026 awaits validation, and its two reductions their CPI figure', () => {
    expect(BILLS_NORMS.rdl25_2026.status).toBe('pending_validation');
    const open = Object.values(BILLS_NORMS).filter(
      (n) => n.status === 'conditional' && n.condition?.met === null,
    );
    expect(open.map((n) => [n.id, n.inForceSince, n.inForceUntil, n.condition?.decidesOn])).toEqual(
      [
        ['rdl25_2026_november', '2026-11-01', '2026-11-30', '2026-10-14'],
        ['rdl25_2026_december', '2026-12-01', '2026-12-31', '2026-11-13'],
      ],
    );
  });

  it('a settled condition keeps its dates and names the notice that settled it', () => {
    const settledOnes = Object.values(BILLS_NORMS).filter(
      (n) => n.status === 'conditional' && n.condition?.met !== null,
    );
    expect(settledOnes.map((n) => [n.id, n.condition?.decidesOn, n.statusSince])).toEqual([
      ['rdl7_2026_june', '2026-05-14', '2026-05-19'],
      ['rdl18_2026_august', '2026-07-15', '2026-09-01'],
      ['rdl18_2026_september', '2026-08-13', '2026-09-01'],
    ]);
    for (const n of settledOnes) {
      expect(n.inForceUntil !== null && n.inForceUntil >= n.inForceSince).toBe(true);
      expect(n.statusUrl).toMatch(/^https:\/\/sede\.agenciatributaria\.gob\.es\//);
    }
  });
});
