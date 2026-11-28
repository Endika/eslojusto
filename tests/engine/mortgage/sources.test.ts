import { describe, expect, it } from 'vitest';
import { MORTGAGE_SOURCES } from '../../../src/engine/mortgage/data/sources';
import { MORTGAGE_TEXTS } from '../../../src/engine/mortgage/data/texts';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

describe('mortgage case-law sources', () => {
  it('quotes the Supreme Court passages the costs, their interest and their time limit rest on, and each judgment of the Court of Justice', () => {
    const quoting = Object.values(MORTGAGE_SOURCES)
      .filter((s) => s.quotes.length > 0)
      .map((s) => s.id);
    expect(quoting).toEqual([
      'sts725_2018',
      'sts35_2021',
      'sts816_2023',
      'sts857_2024',
      ...Object.keys(MORTGAGE_SOURCES).filter((id) => id.startsWith('tjue_')),
    ]);
  });
});

describe('mortgage norm passages', () => {
  it.each(Object.entries(MORTGAGE_TEXTS))(
    '%s is a statute read word for word in the BOE',
    (id, s) => {
      expect(s.id).toBe(id);
      expect(s).toMatchObject({ basis: 'statute', verified: true });
      expect(s.lastVerified).toMatch(ISO);
      expect(s.url).toMatch(/^https:\/\/www\.boe\.es\/buscar\/act\.php\?id=BOE-A-\d{4}-\d+#a/);
      expect(s.quotes.length).toBeGreaterThan(0);
    },
  );
});
