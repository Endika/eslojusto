import { describe, expect, it } from 'vitest';
import { computeSeverance } from '../../src/engine/severance';
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

  it('12 days per year, prorated by actual days, since 2015', () => {
    // 100 € a day × 365 days × 12/365 = 1200 €
    expect(fixedTerm('2025-01-01', '2025-12-31').amount).toBe(1200);
    // 100 × 181 × 12/365 = 595.07
    expect(fixedTerm('2026-01-01', '2026-06-30').amount).toBe(595.07);
  });
  it.each([
    ['2011-06-01', '2012-05-31', 366, 8],
    ['2012-06-01', '2013-05-31', 365, 9],
    ['2013-06-01', '2014-05-31', 365, 10],
    ['2014-06-01', '2015-05-31', 365, 11],
    ['2015-01-01', '2015-12-31', 365, 12],
  ])('contract from %s to %s (%i days) → %i days per year', (startDate, endDate, days, n) => {
    const r = fixedTerm(startDate, endDate);
    expect(r.amount).toBe(Math.round(((100 * days * n) / 365) * 100) / 100);
    expect(text(r.calculation)).toContain(`${n}/365`);
  });
  it.each([
    ['2001-03-03', '2002-03-02', 0],
    ['2001-03-04', '2002-03-03', 8],
  ] as const)(
    'a contract from %s to %s gets %i days per year (DT 8.ª.2)',
    (startDate, endDate, n) => {
      const r = fixedTerm(startDate, endDate);
      expect(r.amount).toBe(Math.round(((100 * 365 * n) / 365) * 100) / 100);
      if (n === 0) expect(text(r.calculation)).toContain('4 de marzo de 2001');
    },
  );
  it('replacement and training contracts have no severance', () => {
    expect(fixedTerm('2025-01-01', '2025-12-31', 'replacement').amount).toBe(0);
    expect(fixedTerm('2025-01-01', '2025-12-31', 'training').amount).toBe(0);
  });
});

describe('no severance', () => {
  it.each(['resignation', 'disciplinary_dismissal'] as const)('%s → 0', (cause) => {
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
  it('2 leftover days: the guide adds a month and the calculator does not', () => {
    const unfair = testCase('unfair_dismissal', '2014-02-15', '2015-07-16', 35938);
    expect(unfair.amount).toBe(4873.78);
    expect(unfair.range).toEqual({ min: 4603.02, max: 4873.78 });
    const objective = testCase('objective_dismissal', '2014-02-15', '2015-07-16', 35938);
    expect(objective.amount).toBe(2953.81);
    expect(objective.range).toEqual({ min: 2789.71, max: 2953.81 });
  });
  it('exact anniversary with a start day other than 1: the calculator adds a month', () => {
    const r = testCase('unfair_dismissal', '2012-10-10', '2026-10-09', 21900);
    expect(r.amount).toBe(27720);
    expect(r.range).toEqual({ min: 27720, max: 27885 });
  });
  it('away from the edge the range is the amount itself, with no note', () => {
    const r = testCase('unfair_dismissal', '2010-03-01', '2026-09-15', 30000);
    expect(r.range).toEqual({ min: r.amount, max: r.amount });
    expect(text(r.calculation)).not.toContain('La calculadora del CGPJ');
  });
  it('the note appears only when the range is not degenerate', () => {
    const r = testCase('objective_dismissal', '2014-02-15', '2015-07-16', 35938);
    expect(text(r.calculation)).toContain(
      'La calculadora del CGPJ y su guía cuentan distinto los meses en este caso (un mes de diferencia); por eso damos un margen entre ambas cifras.',
    );
  });
  it('with no month count the range is exact', () => {
    const r = computeSeverance({
      cause: 'resignation',
      startDate: f('2015-01-01'),
      endDate: f('2026-01-01'),
      annualSalary: 30000,
    });
    expect(r.range).toEqual({ min: 0, max: 0 });
  });
});

describe('the first source of a zero severance is the rule that sets it to zero', () => {
  const base = { startDate: f('2015-01-01'), endDate: f('2026-01-01'), annualSalary: 30000 };
  it.each([
    ['resignation', undefined, 'et49_1d', 'Estatuto de los Trabajadores, art. 49.1.d'],
    ['disciplinary_dismissal', undefined, 'et55', 'Estatuto de los Trabajadores, art. 55.7'],
    ['fixed_term_end', 'replacement', 'et49_1c', 'Estatuto de los Trabajadores, art. 49.1.c'],
    ['fixed_term_end', 'training', 'et49_1c', 'Estatuto de los Trabajadores, art. 49.1.c'],
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
