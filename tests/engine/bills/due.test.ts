import { describe, expect, it } from 'vitest';
import { BILLS_NORMS } from '../../../src/engine/bills/data/norms';
import { BILLS_TABLES } from '../../../src/engine/bills/data/tables';
import { billsDue, uncoveredOn, type DueDeps, type DueItem } from '../../../src/engine/bills/due';
import { TABLE_NAMES } from '../../../src/engine/bills/tables';
import { parseDate, toIso, type CivilDate } from '../../../src/engine/date';
import { NORMS_BEFORE_FIGURE } from './norms-before-figure';

// CI runs the checks on injected days. The monthly review runs `BILLS_REVIEW=1 npm run bills:due`,
// which prints the list for today and checks that today is covered: it reads the real clock,
// which CI never does, so a new year or a figure just out never turns an unrelated PR red.
const REVIEW = process.env['BILLS_REVIEW'] === '1';

const deps: DueDeps = { norms: BILLS_NORMS, tables: BILLS_TABLES };

const beforeFigure: DueDeps = { ...deps, norms: NORMS_BEFORE_FIGURE };

const describeItem = (item: DueItem): string => {
  switch (item.kind) {
    case 'condition_open':
      return `${item.overdue ? 'OVERDUE' : 'OPEN'} ${item.norm}: «${item.text}», figure due by ${item.decidesOn}`;
    case 'month_conditional':
      return `CONDITIONAL ${item.month} ${item.table}: decided by ${item.norms.join(', ')}`;
    case 'month_missing':
      return `MISSING ${item.month} ${item.table}: no rate loaded`;
    case 'table_ends':
      return `ENDS ${item.table} on ${item.lastDay}`;
    case 'holidays_missing':
      return `MISSING the ${item.year} national holidays: load the resolution from the BOE`;
    case 'toll_holidays_missing':
      return `MISSING the ${item.year} 2.0TD toll holidays: the fixed, non-replaceable national ones and 6 January`;
    case 'validation_pending':
      return `VALIDATION ${item.norm}: in force since ${item.since}, still to be validated`;
  }
};

const realToday = (): CivilDate => {
  const now = new Date();
  return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
};

describe('the bills due list', () => {
  it('flags a condition still open a week after its figure is due', () => {
    const open = (day: string) =>
      billsDue(parseDate(day), beforeFigure)
        .filter((i) => i.kind === 'condition_open' && i.overdue)
        .map((i) => i.kind === 'condition_open' && i.norm);
    expect(open('2026-10-21')).toEqual([]);
    expect(open('2026-10-22')).toEqual(['rdl25_2026_november']);
  });

  it('lists by month which tax rate depends on a condition, from this month on', () => {
    const months = billsDue(parseDate('2026-10-09'), beforeFigure)
      .filter((i) => i.kind === 'month_conditional')
      .map((i) => i.kind === 'month_conditional' && `${i.month} ${i.table} ${i.norms.join()}`);
    expect(months).toEqual([
      '2026-11 electricityTax rdl25_2026_november,rdl25_2026',
      '2026-11 vat rdl25_2026_november,rdl25_2026',
      '2026-12 electricityTax rdl25_2026_december,rdl25_2026',
      '2026-12 vat rdl25_2026_december,rdl25_2026',
    ]);
    expect(
      billsDue(parseDate('2026-10-09'), beforeFigure).some((i) => i.kind === 'month_missing'),
    ).toBe(false);
  });

  it('lists the tables by the day they run out, soonest first', () => {
    const lastDay = { tolls: '2026-12-31', charges: '2026-06-30' };
    const row = BILLS_TABLES.tolls[0];
    if (row === undefined) throw new Error('no tolls row');
    const items = billsDue(parseDate('2026-10-09'), {
      ...deps,
      tables: {
        ...BILLS_TABLES,
        // Rows out of order: the last day is the latest, not the last row.
        tolls: [
          { ...row, from: '2026-07-01', until: lastDay.tolls },
          { ...row, until: '2026-06-30' },
        ],
        charges: BILLS_TABLES.charges.map((r) => ({ ...r, until: lastDay.charges })),
      },
    });
    expect(items).toEqual([
      { kind: 'table_ends', table: 'charges', lastDay: lastDay.charges },
      ...TABLE_NAMES.filter((t) => t !== 'meter' && t !== 'charges').map((table) => ({
        kind: 'table_ends',
        table,
        lastDay: '2026-12-31',
      })),
    ]);
  });

  it('lists nothing for a table with no end, with an open row or with no row', () => {
    const row = BILLS_TABLES.tolls[0];
    if (row === undefined) throw new Error('no tolls row');
    const items = billsDue(parseDate('2026-10-09'), {
      ...deps,
      tables: {
        ...BILLS_TABLES,
        tolls: [row, { ...row, from: '2027-01-01', until: null }],
        charges: [],
      },
    });
    const tables = items.map((i) => i.kind === 'table_ends' && i.table);
    expect(tables).not.toContain('tolls');
    expect(tables).not.toContain('charges');
    expect(tables).not.toContain('meter');
    expect(tables).toContain('vat');
  });

  it('asks for the holidays of this year when the calendar holds other years too', () => {
    const [holidays] = BILLS_TABLES.holidays;
    const [tollHolidays] = BILLS_TABLES.tollHolidays;
    if (holidays === undefined || tollHolidays === undefined) throw new Error('no holidays');
    const years = (calendar: typeof holidays, ...ys: number[]) =>
      ys.map((year) => ({ ...calendar, year }));
    const tables = (a: number[], b: number[]) => ({
      ...BILLS_TABLES,
      holidays: years(holidays, ...a),
      tollHolidays: years(tollHolidays, ...b),
    });
    const kinds = (a: number[], b: number[]) =>
      billsDue(parseDate('2026-11-18'), { ...deps, tables: tables(a, b) })
        .map((i) => i.kind)
        .filter((k) => k.endsWith('holidays_missing'));
    expect(kinds([2025, 2026], [2025, 2026])).toEqual([]);
    expect(kinds([2025], [2026])).toEqual(['holidays_missing']);
    expect(kinds([2026], [2025])).toEqual(['toll_holidays_missing']);
  });

  it('lists the decrees still to be validated, and the holidays of a year not loaded', () => {
    const items = billsDue(parseDate('2026-10-09'), deps);
    expect(
      billsDue(parseDate('2026-10-09'), beforeFigure).filter(
        (i) => i.kind === 'validation_pending',
      ),
    ).toEqual([{ kind: 'validation_pending', norm: 'rdl25_2026', since: '2026-10-01' }]);
    expect(items.some((i) => i.kind === 'validation_pending')).toBe(false);
    expect(items.some((i) => i.kind === 'holidays_missing')).toBe(false);
    expect(billsDue(parseDate('2027-01-04'), deps)).toContainEqual({
      kind: 'holidays_missing',
      year: 2027,
    });
  });

  it('leaves November and December out once the INE gave their figures', () => {
    const items = billsDue(parseDate('2026-11-18'), deps);
    expect(items.some((i) => i.kind === 'condition_open')).toBe(false);
    expect(items.some((i) => i.kind === 'month_conditional')).toBe(false);
  });

  it.each([['with some days without a rate', '2026-05-09', '2026-07-01', '2026-07-15', '2026-07']])(
    'a month %s is listed as missing',
    (_, today, from, until, month) => {
      const vat = BILLS_TABLES.vat.flatMap((r) => {
        if (r.from !== from) return [r];
        return until === null ? [] : [{ ...r, until }];
      });
      const items = billsDue(parseDate(today), { ...deps, tables: { ...BILLS_TABLES, vat } });
      expect(items.filter((i) => i.kind === 'month_missing')).toEqual([
        { kind: 'month_missing', month, table: 'vat' },
      ]);
    },
  );

  it('does not list a plain norm that carries an open condition', () => {
    const settledNorm = Object.values(NORMS_BEFORE_FIGURE).find((n) => n.status === 'in_force');
    if (settledNorm === undefined || settledNorm.condition !== undefined)
      throw new Error('no plain norm');
    const norms = {
      ...NORMS_BEFORE_FIGURE,
      [settledNorm.id]: {
        ...settledNorm,
        condition: { text: 't', decidesOn: '2026-10-14', met: null },
      },
    };
    const items = billsDue(parseDate('2026-10-09'), { ...deps, norms });
    expect(items.filter((i) => i.kind === 'condition_open')).toHaveLength(2);
  });
});

describe('the tables a bill needs', () => {
  it('cover a day when the calendar holds other years too', () => {
    const [holidays] = BILLS_TABLES.holidays;
    if (holidays === undefined) throw new Error('no holidays');
    const tables = { ...BILLS_TABLES, holidays: [{ ...holidays, year: 2025 }, holidays] };
    expect(uncoveredOn('2026-06-12', { ...deps, tables })).toEqual([]);
  });

  it('are all missing on the first day of a year not loaded', () => {
    expect(uncoveredOn('2027-01-01', deps)).toEqual([
      'tolls',
      'charges',
      'pvpcMargin',
      'socialBonusFunding',
      'electricityTax',
      'vat',
      'socialBonusDiscount',
      'socialBonusCaps',
      'holidays',
    ]);
  });
});

describe.runIf(REVIEW)('monthly review of the bills tables (by hand)', () => {
  it('prints the list for today', () => {
    const lines = billsDue(realToday(), deps).map(describeItem);
    console.log(['bills due:', ...lines.map((l) => `  ${l}`)].join('\n'));
    expect(lines.length).toBeGreaterThan(0);
  });

  // From 1 January, until that year's tolls, charges, funding, taxes, social bonus and holidays
  // are loaded.
  it('cover today', () => {
    expect(uncoveredOn(toIso(realToday()), deps)).toEqual([]);
  });
});
