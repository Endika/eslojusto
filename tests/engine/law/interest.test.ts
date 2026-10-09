import { describe, expect, it } from 'vitest';
import { addDays, parseDate, toIso } from '../../../src/engine/date';
import { LEGAL_INTEREST } from '../../../src/engine/law/data/legal-interest';
import { interestByYear, rateOn } from '../../../src/engine/law/interest';

const d = parseDate;
const BDE = 'https://clientebancario.bde.es/';

const segments = (result: ReturnType<typeof interestByYear>) =>
  result.segments.map((s) => [toIso(s.from), toIso(s.to), s.days, s.rate, s.yearDays]);

describe('legal interest table', () => {
  it('runs day after day from 1995 with no gap or overlap, each period with its source', () => {
    expect(LEGAL_INTEREST[0]?.from).toBe('1995-01-01');
    for (const [i, p] of LEGAL_INTEREST.entries()) {
      expect(p.from <= p.until).toBe(true);
      expect(p.url.startsWith(BDE)).toBe(true);
      const next = LEGAL_INTEREST[i + 1];
      if (next) expect(next.from).toBe(toIso(addDays(d(p.until), 1)));
    }
  });

  it.each([
    [1995, 9],
    [1996, 9],
    [1997, 7.5],
    [1998, 5.5],
    [1999, 4.25],
    [2000, 4.25],
    [2001, 5.5],
    [2002, 4.25],
    [2003, 4.25],
    [2004, 3.75],
    [2005, 4],
    [2006, 4],
    [2007, 5],
    [2008, 5.5],
    [2010, 4],
    [2014, 4],
    [2015, 3.5],
    [2016, 3],
    [2022, 3],
    [2023, 3.25],
    [2026, 3.25],
  ])('%i is %d % all year', (year, rate) => {
    expect(rateOn({ y: year, m: 1, d: 1 }, LEGAL_INTEREST)).toBe(rate);
    expect(rateOn({ y: year, m: 12, d: 31 }, LEGAL_INTEREST)).toBe(rate);
  });

  it('2009 is 5,50 % until 31 March and 4,00 % from 1 April', () => {
    expect(rateOn(d('2009-03-31'), LEGAL_INTEREST)).toBe(5.5);
    expect(rateOn(d('2009-04-01'), LEGAL_INTEREST)).toBe(4);
  });

  it('has no rate before 1995', () => {
    expect(rateOn(d('1994-12-31'), LEGAL_INTEREST)).toBeUndefined();
  });

  it('ends with 2026: a year not loaded is never filled with the one before', () => {
    expect(LEGAL_INTEREST.at(-1)?.until).toBe('2026-12-31');
    expect(rateOn(d('2027-01-01'), LEGAL_INTEREST)).toBeUndefined();
  });
});

// Run by hand with `LEGAL_INTEREST_REVIEW=1 npm run legal-interest:review` each January: it reads
// today's date, which CI never does, and asks for the year's rate (budget law or its extension).
describe.runIf(process.env['LEGAL_INTEREST_REVIEW'] === '1')('yearly review (by hand)', () => {
  it('covers the current year', () => {
    const year = new Date().getFullYear();
    expect(rateOn({ y: year, m: 1, d: 1 }, LEGAL_INTEREST), `${year}`).toBeDefined();
    expect(rateOn({ y: year, m: 12, d: 31 }, LEGAL_INTEREST), `${year}`).toBeDefined();
  });
});

describe('interestByYear', () => {
  it('splits 2009 at the change of rate and the year change', () => {
    const result = interestByYear(1000, d('2009-02-15'), d('2010-02-15'), LEGAL_INTEREST, 365);
    // 1.000 × 5,50 % × 45 / 365 = 6,7808; 1.000 × 4 % × 275 / 365 = 30,1370;
    // 1.000 × 4 % × 45 / 365 = 4,9315.
    expect(segments(result)).toEqual([
      ['2009-02-15', '2009-04-01', 45, 5.5, 365],
      ['2009-04-01', '2010-01-01', 275, 4, 365],
      ['2010-01-01', '2010-02-15', 45, 4, 365],
    ]);
    expect(result.segments.map((s) => s.interest)).toEqual([
      (1000 * 5.5 * 45) / 36500,
      (1000 * 4 * 275) / 36500,
      (1000 * 4 * 45) / 36500,
    ]);
    expect(result).toMatchObject({ kind: 'complete', interest: 41.85 });
  });

  it('counts up to 31 December of the last year loaded, never with an earlier rate', () => {
    const result = interestByYear(1000, d('2026-07-01'), d('2027-03-01'), LEGAL_INTEREST, 365);
    // 1.000 × 3,25 % × 184 / 365 = 16,3836.
    expect(segments(result)).toEqual([['2026-07-01', '2027-01-01', 184, 3.25, 365]]);
    expect(result).toMatchObject({
      kind: 'partial',
      interest: 16.38,
      until: '2026-12-31',
      missingYear: 2027,
    });
  });

  it('is complete when the day it stops is the first of a year not loaded', () => {
    const result = interestByYear(1000, d('2026-07-01'), d('2027-01-01'), LEGAL_INTEREST, 365);
    expect(result.kind).toBe('complete');
  });

  it('gives no figure for a start before the table, not even for the days it covers', () => {
    const result = interestByYear(1000, d('1994-06-01'), d('1995-02-01'), LEGAL_INTEREST, 365);
    expect(result).toEqual({
      kind: 'before_table',
      segments: [],
      tableFrom: '1995-01-01',
      missingYear: 1994,
    });
    expect(result).not.toHaveProperty('interest');
    expect(interestByYear(1000, d('1995-01-01'), d('1995-02-01'), LEGAL_INTEREST, 365).kind).toBe(
      'complete',
    );
  });

  it.each([
    // 1.000 × 3,25 % × 366 / 366 = 32,50.
    ['actual', 366, 32.5],
    // 1.000 × 3,25 % × 366 / 365 = 32,5890.
    [365, 365, 32.59],
    // 1.000 × 3,25 % × 366 / 360 = 33,0417.
    [360, 360, 33.04],
  ] as const)('over leap 2024 with base %s divides by %i', (base, yearDays, interest) => {
    const result = interestByYear(1000, d('2024-01-01'), d('2025-01-01'), LEGAL_INTEREST, base);
    expect(segments(result)).toEqual([['2024-01-01', '2025-01-01', 366, 3.25, yearDays]]);
    expect(result).toMatchObject({ kind: 'complete', interest });
  });

  it('gives nothing when it stops on the day it starts', () => {
    expect(interestByYear(1000, d('2020-05-05'), d('2020-05-05'), LEGAL_INTEREST, 365)).toEqual({
      kind: 'complete',
      segments: [],
      interest: 0,
    });
  });
});
