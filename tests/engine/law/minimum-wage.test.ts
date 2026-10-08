import { describe, expect, it } from 'vitest';
import {
  minimumWageFor,
  type MinimumWageRow,
  type MinimumWageTable,
} from '../../../src/engine/law/minimum-wage';

const row = (year: number): MinimumWageRow<'decree'> => ({
  year,
  norm: 'decree',
  url: 'https://www.boe.es/x',
  publishedOn: `${year}-02-01`,
  effectsFrom: `${year}-01-01`,
  effectsUntil: `${year}-12-31`,
  retroactiveVerified: true,
  monthly: 1000 + year,
  daily: 30,
  annual: 14_000,
  temporaryPerDay: 40,
  householdPerHour: 8,
});

const TABLE: MinimumWageTable<'decree'> = [row(2024), row(2025)];

describe('minimumWageFor', () => {
  it('finds the row of a year', () => {
    expect(minimumWageFor(2025, TABLE)).toEqual({ kind: 'published', row: row(2025) });
  });

  it('gives the latest row only as a reference for a later year', () => {
    expect(minimumWageFor(2026, TABLE)).toEqual({
      kind: 'not_published',
      year: 2026,
      reference: row(2025),
    });
  });

  it('knows a year before the table starts is not loaded', () => {
    expect(minimumWageFor(2023, TABLE)).toEqual({ kind: 'not_loaded', year: 2023 });
    expect(minimumWageFor(2023, [])).toEqual({ kind: 'not_loaded', year: 2023 });
  });
});
