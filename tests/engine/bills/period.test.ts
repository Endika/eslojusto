import { describe, expect, it } from 'vitest';
import { BILLS_NORMS } from '../../../src/engine/bills/data/norms';
import type { BillsNormId, NormTable } from '../../../src/engine/bills/norms';
import {
  addOfficial,
  billingPeriod,
  citeRows,
  officialValues,
  proratedOver,
  rowsOn,
  spanOf,
  wholePeriod,
  type BillingPeriod,
  type Official,
} from '../../../src/engine/bills/period';
import type { Table, TableRow } from '../../../src/engine/bills/tables';
import { parseDate } from '../../../src/engine/date';
import { NORMS_BEFORE_FIGURE } from './norms-before-figure';

const row = (value: number, from: string, until: string | null, norm: BillsNormId = 'law37_1992') =>
  ({ from, until, value, norm, url: BILLS_NORMS[norm].url }) satisfies TableRow<number>;

const period = (from: string, to: string): BillingPeriod => ({
  from: parseDate(from),
  to: parseDate(to),
});

const spanOver = (table: Table<number>, p: BillingPeriod, norms: NormTable = BILLS_NORMS) => {
  const span = spanOf(table, p, norms);
  if (span.kind !== 'covered') throw new Error('not covered');
  return span;
};

describe('the days of a bill', () => {
  it('start the day after the first reading, or on it when the bill counts one day more', () => {
    const bill = { readingFrom: parseDate('2026-05-31'), readingTo: parseDate('2026-06-30') };
    expect(billingPeriod({ ...bill, billedDays: 30 }).from).toEqual(bill.readingFrom);
    expect(billingPeriod({ ...bill, billedDays: null }).from).toEqual(bill.readingFrom);
    expect(billingPeriod({ ...bill, billedDays: 31 }).from).toEqual(parseDate('2026-05-30'));
    expect(billingPeriod({ ...bill, billedDays: 29 }).from).toEqual(bill.readingFrom);
  });
});

describe('the rows over the days of a period', () => {
  it('keep one stretch for the days the same rows cover', () => {
    const [stretch, ...rest] = spanOver(
      [row(1, '2026-01-01', null)],
      period('2026-06-01', '2026-06-05'),
    ).stretches;
    expect(rest).toEqual([]);
    expect(stretch).toMatchObject({
      first: '2026-06-02',
      last: '2026-06-05',
      days: 4,
      yearDays: 365,
    });
  });

  it('start another stretch where the rows change', () => {
    const table = [row(1, '2026-01-01', '2026-06-03'), row(2, '2026-06-04', null)];
    const { stretches } = spanOver(table, period('2026-06-01', '2026-06-05'));
    expect(stretches.map((s) => [s.first, s.last, s.days])).toEqual([
      ['2026-06-02', '2026-06-03', 2],
      ['2026-06-04', '2026-06-05', 2],
    ]);
  });

  it('start another stretch where a row is added to the ones that hold', () => {
    const open = {
      ...NORMS_BEFORE_FIGURE.rdl25_2026_november,
      inForceSince: '2026-06-01',
      inForceUntil: '2026-06-30',
    };
    const norms: NormTable = { ...BILLS_NORMS, rdl25_2026_november: open };
    const table = [row(1, '2026-01-01', null), row(2, '2026-06-04', null, 'rdl25_2026_november')];
    const { stretches, deciding } = spanOver(table, period('2026-06-01', '2026-06-05'), norms);
    expect(stretches.map((s) => [s.first, s.rows.length])).toEqual([
      ['2026-06-02', 1],
      ['2026-06-04', 2],
    ]);
    expect(deciding).toEqual(['rdl25_2026_november']);
  });

  it('start another stretch where one of the rows that hold is another', () => {
    const norms: NormTable = {
      ...BILLS_NORMS,
      rdl25_2026_november: {
        ...NORMS_BEFORE_FIGURE.rdl25_2026_november,
        inForceSince: '2026-06-01',
        inForceUntil: '2026-06-03',
      },
      rdl25_2026_december: {
        ...NORMS_BEFORE_FIGURE.rdl25_2026_december,
        inForceSince: '2026-06-04',
        inForceUntil: '2026-06-30',
      },
    };
    const table = [
      row(1, '2026-01-01', null),
      row(2, '2026-06-01', '2026-06-03', 'rdl25_2026_november'),
      row(3, '2026-06-04', null, 'rdl25_2026_december'),
    ];
    const { stretches } = spanOver(table, period('2026-06-01', '2026-06-05'), norms);
    expect(stretches.map((s) => [s.first, s.rows.map((r) => r.value)])).toEqual([
      ['2026-06-02', [1, 2]],
      ['2026-06-04', [1, 3]],
    ]);
  });

  it('start another stretch with the year, since the year has its own length', () => {
    const { stretches } = spanOver(
      [row(1, '2026-01-01', null)],
      period('2027-12-30', '2028-01-02'),
    );
    expect(stretches.map((s) => [s.first, s.last, s.days, s.yearDays])).toEqual([
      ['2027-12-31', '2027-12-31', 1, 365],
      ['2028-01-01', '2028-01-02', 2, 366],
    ]);
  });

  it('say the first day no row covers', () => {
    expect(
      spanOf([row(1, '2026-06-03', null)], period('2026-06-01', '2026-06-05'), BILLS_NORMS),
    ).toEqual({
      kind: 'missing',
      day: '2026-06-02',
    });
  });

  it('are cited with the status of their norm', () => {
    expect(citeRows([row(1, '2026-01-01', '2026-12-31')], BILLS_NORMS)).toEqual([
      {
        from: '2026-01-01',
        until: '2026-12-31',
        norm: 'law37_1992',
        url: BILLS_NORMS.law37_1992.url,
        status: 'in_force',
        doubt: null,
      },
    ]);
  });
});

describe('a value a year shared out over a period', () => {
  const perYear = (table: Table<number>, p: BillingPeriod) => {
    const figure = proratedOver(table, p, BILLS_NORMS, (v) => v);
    if (figure.kind !== 'ok') throw new Error('missing');
    return figure;
  };

  it('is a share of 365 days or of the real year, as the norms leave open', () => {
    // 366 days of 2028 at 365 a year: 366 over 365 days, or the whole year.
    const { byBase } = perYear([row(365, '2026-01-01', null)], period('2027-12-31', '2028-12-31'));
    expect(byBase[0].low).toBeCloseTo(366, 9);
    expect(byBase[1].low).toBeCloseTo(365, 9);
  });

  it('takes the lowest and the highest row on days a norm leaves open', () => {
    const open = {
      ...NORMS_BEFORE_FIGURE.rdl25_2026_november,
      inForceSince: '2026-06-01',
      inForceUntil: '2026-06-30',
    };
    const table = [
      row(365, '2026-01-01', null),
      row(730, '2026-06-01', null, 'rdl25_2026_november'),
    ];
    const figure = proratedOver(
      table,
      period('2026-06-01', '2026-06-11'),
      { ...BILLS_NORMS, rdl25_2026_november: open },
      (v) => v,
    );
    expect(figure).toMatchObject({ kind: 'ok', deciding: ['rdl25_2026_november'] });
    expect((figure as { byBase: readonly { low: number; high: number }[] }).byBase[0]).toEqual({
      low: 10,
      high: 20,
    });
  });

  it('cites each row once, however many stretches it covers', () => {
    const figure = perYear([row(365, '2026-01-01', null)], period('2027-12-30', '2028-01-02'));
    expect(figure.rows).toEqual(citeRows([row(365, '2026-01-01', null)], BILLS_NORMS));
  });

  it('is missing on a day no row covers', () => {
    expect(
      proratedOver(
        [row(1, '2026-06-05', null)],
        period('2026-06-01', '2026-06-03'),
        BILLS_NORMS,
        (v) => v,
      ),
    ).toEqual({
      kind: 'missing',
      day: '2026-06-02',
    });
  });
});

describe('one value over the whole period', () => {
  const stretchesOf = (table: Table<number>) =>
    spanOver(table, period('2026-06-01', '2026-06-05')).stretches;
  const same = (v: number) => v;

  it('is the range of its rows when they do not change within the period', () => {
    expect(wholePeriod(stretchesOf([row(3, '2026-01-01', null)]), same)).toEqual({
      low: 3,
      high: 3,
    });
  });

  it('takes the lowest and the highest of the rows that may hold', () => {
    const open = {
      ...NORMS_BEFORE_FIGURE.rdl25_2026_november,
      inForceSince: '2026-06-01',
      inForceUntil: '2026-06-30',
    };
    const table = [row(3, '2026-01-01', null), row(7, '2026-01-01', null, 'rdl25_2026_november')];
    const { stretches } = spanOver(table, period('2026-06-01', '2026-06-05'), {
      ...BILLS_NORMS,
      rdl25_2026_november: open,
    });
    expect(wholePeriod(stretches, same)).toEqual({ low: 3, high: 7 });
  });

  it('is none for a value that changes within the period', () => {
    const changes = [row(3, '2026-01-01', '2026-06-03'), row(4, '2026-06-04', null)];
    expect(wholePeriod(stretchesOf(changes), same)).toBeNull();
  });

  it('is none for a value that changes only in its highest reading, the range if it does not', () => {
    const open = {
      ...NORMS_BEFORE_FIGURE.rdl25_2026_november,
      inForceSince: '2026-06-04',
      inForceUntil: '2026-06-30',
    };
    const norms: NormTable = { ...BILLS_NORMS, rdl25_2026_november: open };
    const lowerLater = (low: number) =>
      spanOver(
        [row(3, '2026-01-01', null), row(low, '2026-06-04', null, 'rdl25_2026_november')],
        period('2026-06-01', '2026-06-05'),
        norms,
      ).stretches;
    const from = (high: number) =>
      spanOver(
        [row(3, '2026-01-01', null), row(high, '2026-06-04', null, 'rdl25_2026_november')],
        period('2026-06-01', '2026-06-05'),
        norms,
      ).stretches;
    expect(wholePeriod(from(7), same)).toBeNull();
    expect(wholePeriod(lowerLater(1), same)).toBeNull();
    expect(wholePeriod(from(3), same)).toEqual({ low: 3, high: 3 });
  });

  it('is none for no stretch at all', () => {
    expect(wholePeriod([], same)).toBeNull();
  });
});

describe('the rows on one day', () => {
  it('are those that may hold, with the norms that decide between them', () => {
    const first = row(1, '2026-01-01', null);
    expect(rowsOn([first], '2026-06-01', BILLS_NORMS)).toEqual({
      kind: 'covered',
      rows: [first],
      deciding: [],
    });
    const open = {
      ...NORMS_BEFORE_FIGURE.rdl25_2026_november,
      inForceSince: '2026-06-01',
      inForceUntil: '2026-06-30',
    };
    const second = row(2, '2026-06-01', null, 'rdl25_2026_november');
    expect(
      rowsOn([first, second], '2026-06-01', { ...BILLS_NORMS, rdl25_2026_november: open }),
    ).toEqual({ kind: 'covered', rows: [first, second], deciding: ['rdl25_2026_november'] });
    expect(rowsOn([row(1, '2026-07-01', null)], '2026-06-01', BILLS_NORMS)).toEqual({
      kind: 'missing',
      day: '2026-06-01',
    });
  });
});

describe('two official figures added up', () => {
  const ok = (low: number, high: number): Official => ({
    kind: 'ok',
    byBase: [
      { low, high },
      { low, high },
    ],
    rows: [],
    deciding: [],
  });
  const missing = (day: string): Official => ({ kind: 'missing', day });

  it('give their sum', () => {
    expect(addOfficial(ok(1, 2), ok(10, 20))).toMatchObject({
      kind: 'ok',
      byBase: [
        { low: 11, high: 22 },
        { low: 11, high: 22 },
      ],
    });
  });

  it('keep the rows and the norms deciding of both', () => {
    const cited = citeRows([row(1, '2026-01-01', null)], BILLS_NORMS);
    const a = { ...ok(1, 2), rows: cited, deciding: ['rdl7_2026' as const] };
    const b = { ...ok(1, 2), rows: cited, deciding: ['rdl7_2026' as const, 'rdl10_2026' as const] };
    expect(addOfficial(a, b)).toMatchObject({
      rows: [...cited, ...cited],
      deciding: ['rdl7_2026', 'rdl10_2026'],
    });
  });

  it('are missing if either is, the first one first', () => {
    expect(addOfficial(missing('a'), ok(1, 2))).toEqual(missing('a'));
    expect(addOfficial(ok(1, 2), missing('b'))).toEqual(missing('b'));
    expect(addOfficial(missing('a'), missing('b'))).toEqual(missing('a'));
  });
});

describe('the values the norms leave open', () => {
  it('are the distinct lows and highs of the two ways of sharing the year', () => {
    expect(
      officialValues([
        { low: 1, high: 2 },
        { low: 1, high: 3 },
      ]),
    ).toEqual({ low: [1], high: [2, 3] });
  });
});
