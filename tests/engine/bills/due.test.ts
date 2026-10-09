import { describe, expect, it } from 'vitest';
import { BILLS_NORMS } from '../../../src/engine/bills/data/norms';
import { BILLS_TABLES } from '../../../src/engine/bills/data/tables';
import { billsDue, uncoveredOn, type DueDeps, type DueItem } from '../../../src/engine/bills/due';
import { parseDate, toIso, type CivilDate } from '../../../src/engine/date';

// CI runs the checks on injected days. The monthly review runs `BILLS_REVIEW=1 npm run bills:due`,
// which prints the list for today and checks that today is covered: it reads the real clock,
// which CI never does, so a new year or a figure just out never turns an unrelated PR red.
const REVIEW = process.env['BILLS_REVIEW'] === '1';

const deps: DueDeps = { norms: BILLS_NORMS, tables: BILLS_TABLES };

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
    case 'validation_pending':
      return `VALIDATION ${item.norm}: in force since ${item.since}, still to be validated`;
  }
};

const realToday = (): CivilDate => {
  const now = new Date();
  return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
};

describe('the bills due list', () => {
  it('names the open conditions and when each figure is due', () => {
    const items = billsDue(parseDate('2026-10-09'), deps);
    expect(items.filter((i) => i.kind === 'condition_open')).toEqual([
      {
        kind: 'condition_open',
        norm: 'rdl25_2026_november',
        text: 'Que el IPC de la electricidad de septiembre de 2026 suba más del 15 % interanual',
        decidesOn: '2026-10-14',
        overdue: false,
      },
      {
        kind: 'condition_open',
        norm: 'rdl25_2026_december',
        text: 'Que el IPC de la electricidad de octubre de 2026 suba más del 15 % interanual',
        decidesOn: '2026-11-13',
        overdue: false,
      },
    ]);
  });

  it('flags a condition still open a week after its figure is due', () => {
    const open = (day: string) =>
      billsDue(parseDate(day), deps)
        .filter((i) => i.kind === 'condition_open' && i.overdue)
        .map((i) => i.kind === 'condition_open' && i.norm);
    expect(open('2026-10-21')).toEqual([]);
    expect(open('2026-10-22')).toEqual(['rdl25_2026_november']);
  });

  it('lists by month which tax rate depends on a condition, from this month on', () => {
    const months = billsDue(parseDate('2026-10-09'), deps)
      .filter((i) => i.kind === 'month_conditional')
      .map((i) => i.kind === 'month_conditional' && `${i.month} ${i.table} ${i.norms.join()}`);
    expect(months).toEqual([
      '2026-11 electricityTax rdl25_2026_november,rdl25_2026',
      '2026-11 vat rdl25_2026_november,rdl25_2026',
      '2026-12 electricityTax rdl25_2026_december,rdl25_2026',
      '2026-12 vat rdl25_2026_december,rdl25_2026',
    ]);
    expect(billsDue(parseDate('2026-10-09'), deps).some((i) => i.kind === 'month_missing')).toBe(
      false,
    );
  });

  it('lists the tables by the day they run out, soonest first', () => {
    const ends = billsDue(parseDate('2026-10-09'), deps).filter((i) => i.kind === 'table_ends');
    expect(ends.map((i) => i.kind === 'table_ends' && i.table)).toHaveLength(8);
    expect(ends.every((i) => i.kind === 'table_ends' && i.lastDay === '2026-12-31')).toBe(true);
  });

  it('lists the decrees still to be validated, and the holidays of a year not loaded', () => {
    const items = billsDue(parseDate('2026-10-09'), deps);
    expect(items.filter((i) => i.kind === 'validation_pending')).toEqual([
      { kind: 'validation_pending', norm: 'rdl25_2026', since: '2026-10-01' },
    ]);
    expect(items.some((i) => i.kind === 'holidays_missing')).toBe(false);
    expect(billsDue(parseDate('2027-01-04'), deps)).toContainEqual({
      kind: 'holidays_missing',
      year: 2027,
    });
  });

  it('leaves a settled condition out of the open ones', () => {
    const items = billsDue(parseDate('2026-05-20'), deps);
    expect(
      items
        .filter((i) => i.kind === 'condition_open')
        .map((i) => i.kind === 'condition_open' && i.norm),
    ).toEqual(['rdl25_2026_november', 'rdl25_2026_december']);
  });

  it('a month without its rate is listed as missing', () => {
    const vat = BILLS_TABLES.vat.filter((r) => r.from !== '2026-12-01');
    const items = billsDue(parseDate('2026-10-09'), {
      ...deps,
      tables: { ...BILLS_TABLES, vat },
    });
    expect(items).toContainEqual({ kind: 'month_missing', month: '2026-12', table: 'vat' });
  });
});

describe('the tables a bill needs', () => {
  it('cover every day of 2026, holidays included', () => {
    expect(uncoveredOn('2026-01-01', deps)).toEqual([]);
    expect(uncoveredOn('2026-06-12', deps)).toEqual([]);
    expect(uncoveredOn('2026-12-31', deps)).toEqual([]);
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
