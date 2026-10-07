import { describe, expect, it } from 'vitest';
import { round2 } from '../../../src/engine/money';
import { MINIMUM_WAGE } from '../../../src/engine/employment/data/minimum-wage';
import { EMPLOYMENT_NORMS } from '../../../src/engine/employment/data/norms';
import {
  minimumWageFor,
  type MinimumWageRow,
  type MinimumWageTable,
} from '../../../src/engine/employment/minimum-wage';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const row2026 = MINIMUM_WAGE.find((r) => r.year === 2026) as MinimumWageRow;
const synthetic2027: MinimumWageRow = {
  ...row2026,
  year: 2027,
  publishedOn: '2027-02-10',
  effectsFrom: '2027-01-01',
  effectsUntil: '2027-12-31',
  monthly: 1300,
  daily: 43.33,
  annual: 18200,
};

describe('the minimum wage table', () => {
  it.each(MINIMUM_WAGE.map((r) => [r.year, r] as const))('%i is consistent', (year, r) => {
    expect(r.annual).toBe(r.monthly * 14);
    expect(Math.abs(r.daily * 30 - r.monthly)).toBeLessThanOrEqual(0.1);
    expect(r.effectsFrom).toBe(`${year}-01-01`);
    expect(r.effectsUntil).toBe(`${year}-12-31`);
    expect(r.publishedOn).toMatch(ISO);
    expect(r.publishedOn.startsWith(`${year}-`)).toBe(true);
    expect(r.url.startsWith('https://www.boe.es/')).toBe(true);
    const norm = EMPLOYMENT_NORMS[r.norm];
    expect(norm.url).toBe(r.url);
    expect(norm.inForceSince > r.publishedOn).toBe(true);
    expect(norm.inForceUntil).toBe(r.effectsUntil);
  });

  it('runs over consecutive years without gaps', () => {
    const years = MINIMUM_WAGE.map((r) => r.year);
    expect(years).toEqual([2023, 2024, 2025, 2026]);
  });

  it('gives 2026 per fourteen and per twelve payments', () => {
    expect(row2026.annual).toBe(17094);
    expect(round2(row2026.annual / 14)).toBe(1221);
    expect(round2(row2026.annual / 12)).toBe(1424.5);
  });

  it('pays every loaded year from 1 January, as read in each decree', () => {
    expect(MINIMUM_WAGE.every((r) => r.retroactiveVerified)).toBe(true);
  });
});

describe('minimumWageFor', () => {
  it('finds a published year', () => {
    expect(minimumWageFor(2024, MINIMUM_WAGE)).toEqual({
      kind: 'published',
      row: MINIMUM_WAGE[1],
    });
  });

  it('never invents a year after the last decree: 2026 is only a reference', () => {
    expect(minimumWageFor(2027, MINIMUM_WAGE)).toEqual({
      kind: 'not_published',
      year: 2027,
      reference: row2026,
    });
  });

  it('says a year before the table is not loaded', () => {
    expect(minimumWageFor(2022, MINIMUM_WAGE)).toEqual({ kind: 'not_loaded', year: 2022 });
  });

  it('uses an injected 2027 once it is in the table', () => {
    const table: MinimumWageTable = [...MINIMUM_WAGE, synthetic2027];
    expect(minimumWageFor(2027, table)).toEqual({ kind: 'published', row: synthetic2027 });
    expect(minimumWageFor(2028, table)).toMatchObject({
      kind: 'not_published',
      reference: synthetic2027,
    });
  });

  it('with an empty table nothing is loaded', () => {
    expect(minimumWageFor(2026, [])).toEqual({ kind: 'not_loaded', year: 2026 });
  });
});
