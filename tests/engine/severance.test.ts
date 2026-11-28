import { describe, expect, it } from 'vitest';
import { computeSeverance } from '../../src/engine/severance';
import { SOURCES, type Source } from '../../src/engine/sources';
import type { FixedTermType, StatedCause } from '../../src/engine/types';
import { parseDate as f } from '../../src/engine/date';
import { calculationText } from '../../src/calculator/calculation';
import type { Calculation } from '../../src/engine/calculation';
import { t } from '../../src/i18n';

const text = (c: Calculation) => calculationText(c, (key, vars) => t('es', key, vars));
const annual = (monthly: number) => monthly * 12;
const testCase = (
  cause: 'unfair_dismissal' | 'objective_dismissal',
  startDate: string,
  endDate: string,
  annualSalary: number,
) => computeSeverance({ cause, startDate: f(startDate), endDate: f(endDate), annualSalary });

describe('unfair dismissal — CGPJ oracle', () => {
  it.each([
    ['2010-03-01', '2026-09-15', 30000, 47178.08, false],
    ['1990-01-01', '2026-06-30', 40000, 109315.07, false], // first stretch > 720 days: the first stretch rules
    ['2000-01-01', '2026-09-30', 35000, 69041.1, true], // 1031.5 days → 720 cap
    ['2025-06-15', '2026-10-02', 22000, 2652.05, false],
    ['2024-01-01', '2024-04-01', 18000, 542.47, false],
    ['2005-01-01', '2026-09-30', 50000, 98630.14, true],
    ['2012-02-11', '2012-02-12', 20000, 356.16, false], // the guide's double count, §4.b
    ['2018-05-03', '2026-07-20', annual(1500), 13426.03, false],
    ['1985-02-01', '2026-08-31', 28000, 93493.15, false], // 1218.75 days, under 1260
  ])('%s → %s, %i €/year = %f €', (startDate, endDate, salary, expected, capped) => {
    const r = testCase('unfair_dismissal', startDate, endDate, salary);
    expect(r.amount).toBe(expected);
    expect(r.capApplied).toBe(capped);
  });

  it('1260 days as the absolute maximum', () => {
    const r = testCase('unfair_dismissal', '1970-01-01', '2026-09-30', 36500);
    expect(r.salaryDays).toBe(1260);
    expect(r.amount).toBe(126000);
    expect(r.capApplied).toBe(true);
  });
});

describe('objective dismissal — CGPJ oracle', () => {
  it.each([
    ['2010-03-01', '2026-09-15', 30000, 27260.27, false],
    ['1990-01-01', '2026-06-30', 40000, 39452.05, true],
    ['2000-01-01', '2026-09-30', 35000, 34520.55, true],
    ['2025-06-15', '2026-10-02', 22000, 1607.31, false],
    ['2024-01-01', '2024-04-01', 18000, 328.77, false],
    ['2018-05-03', '2026-07-20', annual(1500), 8136.99, false],
  ])('%s → %s, %i €/year = %f €', (startDate, endDate, salary, expected, capped) => {
    const r = testCase('objective_dismissal', startDate, endDate, salary);
    expect(r.amount).toBe(expected);
    expect(r.capApplied).toBe(capped);
  });
});

describe('fixed-term contract end (guide §9)', () => {
  const fixedTerm = (
    startDate: string,
    endDate: string,
    fixedTermType?: 'production_circumstances' | 'replacement' | 'training',
  ) =>
    computeSeverance({
      cause: 'fixed_term_end',
      startDate: f(startDate),
      endDate: f(endDate),
      annualSalary: 36500,
      fixedTermType,
    });

  it('a contract from 2001-03-04 to 2002-03-03 gets 8 days per year (DT 8.ª.2)', () => {
    expect(fixedTerm('2001-03-04', '2002-03-03').amount).toBe(800);
  });
});

describe('no severance', () => {
  it.each(['disciplinary_dismissal'] as const)('%s → 0', (cause) => {
    const r = computeSeverance({
      cause,
      startDate: f('2015-01-01'),
      endDate: f('2026-01-01'),
      annualSalary: 30000,
    });
    expect(r.amount).toBe(0);
    expect(r.sources.length).toBeGreaterThan(0);
  });
});

describe('range where the CGPJ calculator and its guide disagree', () => {
  it('exact anniversary with a start day other than 1: the calculator adds a month', () => {
    const r = testCase('unfair_dismissal', '2012-10-10', '2026-10-09', 21900);
    expect(r.amount).toBe(27720);
    expect(r.range).toEqual({ min: 27720, max: 27885 });
  });
  it('the note appears only when the range is not degenerate', () => {
    const r = testCase('objective_dismissal', '2014-02-15', '2015-07-16', 35938);
    expect(text(r.calculation)).toContain(
      'La calculadora del CGPJ y su guía cuentan distinto los meses en este caso (un mes de diferencia); por eso damos un margen entre ambas cifras.',
    );
  });
});

describe('the first source of a zero severance is the rule that sets it to zero', () => {
  const base = { startDate: f('2015-01-01'), endDate: f('2026-01-01'), annualSalary: 30000 };
  it.each([
    ['resignation', undefined, 'et49_1d', 'Estatuto de los Trabajadores, art. 49.1.d'],
    ['disciplinary_dismissal', undefined, 'et55', 'Estatuto de los Trabajadores, art. 55.7'],
  ] as const)('%s %s → %s', (cause, fixedTermType, id, citation) => {
    const r = computeSeverance({ ...base, cause, fixedTermType });
    expect(r.amount).toBe(0);
    expect(r.sources[0]?.id).toBe(id);
    expect(r.sources[0]?.citation).toBe(citation);
  });
  it('a disciplinary dismissal keeps art. 56 for the unfair dismissal reference', () => {
    const r = computeSeverance({ ...base, cause: 'disciplinary_dismissal' });
    expect(r.sources.map((x) => x.id)).toContain('et56');
  });
});

describe('the months the CGPJ calculator and its guide count', () => {
  // 100 € a day, 2.75 days a month: the range is the days of the month count it takes, as euros.
  it.each([['one leftover day', '2025-01-01', '2025-02-01', 275, 550]])(
    '%s: %s → %s',
    (_, start, end, low, high) => {
      const r = testCase('unfair_dismissal', start, end, 36500);
      expect(r.range).toEqual({ min: low, max: high });
    },
  );
});

describe('what each severance says about itself', () => {
  const run = (
    cause: StatedCause,
    startDate: string,
    endDate: string,
    fixedTermType?: FixedTermType,
  ) =>
    computeSeverance({
      cause,
      startDate: f(startDate),
      endDate: f(endDate),
      annualSalary: 36500,
      fixedTermType,
    });
  const ids = (sources: readonly Source[]) => sources.map((x) => x.id);
  const unfairSources = [SOURCES.et56, SOURCES.etDt11, SOURCES.cgpjGuide];
  const fixedSources = [SOURCES.et49_1c, SOURCES.etDt8, SOURCES.cgpjGuide];

  const cases: [string, () => ReturnType<typeof run>, string[], boolean, Source[]][] = [
    [
      'unfair, from 12 February 2012, over the cap',
      () => run('unfair_dismissal', '2012-02-12', '2040-01-31'),
      ['severance.unfair', 'severance.cap', 'severance.total'],
      true,
      unfairSources,
    ],
    [
      'unfair, first stretch at the cap, then a second',
      () => run('unfair_dismissal', '1996-02-12', '2013-02-11'),
      ['severance.first_stretch', 'severance.second_stretch', 'severance.cap', 'severance.total'],
      true,
      unfairSources,
    ],
    [
      'unfair, first stretch over the cap',
      () => run('unfair_dismissal', '1990-01-01', '2026-06-30'),
      ['severance.first_stretch', 'severance.over_cap', 'severance.total'],
      false,
      unfairSources,
    ],
    [
      'fixed term',
      () => run('fixed_term_end', '2025-01-01', '2025-12-31'),
      ['severance.fixed_term'],
      false,
      fixedSources,
    ],
    [
      'fixed term, before 4 March 2001',
      () => run('fixed_term_end', '2001-03-03', '2002-03-02'),
      ['severance.fixed_term_before_2001'],
      false,
      fixedSources,
    ],
    [
      'fixed term, training',
      () => run('fixed_term_end', '2025-01-01', '2025-12-31', 'training'),
      ['severance.training'],
      false,
      fixedSources,
    ],
    [
      'resignation',
      () => run('resignation', '2020-01-01', '2020-12-31'),
      ['severance.resignation'],
      false,
      [SOURCES.et49_1d, SOURCES.cgpjGuide],
    ],
    [
      'disciplinary dismissal',
      () => run('disciplinary_dismissal', '2020-01-01', '2020-12-31'),
      ['severance.disciplinary'],
      false,
      [SOURCES.et55, SOURCES.et56, SOURCES.cgpjGuide],
    ],
  ];

  it.each(cases)('%s', (_, build, keys, capApplied, sources) => {
    const r = build();
    expect(r.calculation.map((x) => x.key).filter((k) => k !== 'severance.cgpj_range')).toEqual(
      keys,
    );
    expect(r.capApplied).toBe(capApplied);
    expect(ids(r.sources)).toEqual(ids(sources));
    expect(text(r.calculation)).not.toMatch(/\{\w+\}|NaN|undefined/);
  });
});
