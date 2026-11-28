import { describe, expect, it } from 'vitest';
import { BILLS_NORMS } from '../../../src/engine/bills/data/norms';
import type { BillsNormId, NormTable } from '../../../src/engine/bills/norms';
import {
  addOfficial,
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

describe('the rows over the days of a period', () => {
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
});

describe('one value over the whole period', () => {
  const same = (v: number) => v;

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

  it('give their sum', () => {
    expect(addOfficial(ok(1, 2), ok(10, 20))).toMatchObject({
      kind: 'ok',
      byBase: [
        { low: 11, high: 22 },
        { low: 11, high: 22 },
      ],
    });
  });
});
