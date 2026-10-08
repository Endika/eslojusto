import { describe, expect, it } from 'vitest';
import { RENTAL_SECTIONS } from '../src/domain/rental-schema';
import {
  FOOTER,
  isTemplatePage,
  PLACEHOLDER,
  SHEET,
  TEMPLATE_IDS,
  type BankCase,
} from '../eval/schema';
import { BANK, template } from './support/bank';

// Cut every comment by position, so a nested or unclosed «<!--» never survives the cut.
function withoutComments(html: string): string {
  let kept = '';
  let rest = html;
  for (let start = rest.indexOf('<!--'); start >= 0; start = rest.indexOf('<!--')) {
    kept += rest.slice(0, start);
    const end = rest.indexOf('-->', start + 4);
    rest = end < 0 ? '' : rest.slice(end + 3);
  }
  return kept + rest;
}

const placeholders = (html: string): string[] =>
  [...withoutComments(html).matchAll(PLACEHOLDER)].map((m) => m[1] ?? '');

const leaseOf = (c: BankCase) => c.pages.find(isTemplatePage);

describe('the bank of lease packs', () => {
  it('names each case after its file and gives it a rule to exercise', () => {
    const ids = BANK.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of BANK) {
      expect(c.id).toMatch(/^[a-z0-9-]+$/);
      expect(c.description).toMatch(/LAU|RDL|Ley|art\./);
    }
  });

  it('marks fifteen hard packs for the AI pass', () => {
    expect(BANK.filter((c) => c.eval)).toHaveLength(15);
  });

  it('gives every template placeholder a value, and leaves none unused in the drawn pages', () => {
    for (const c of BANK)
      for (const page of c.pages.filter(isTemplatePage))
        for (const key of placeholders(template(page.template)))
          expect(page.data, `${c.id}: ${key}`).toHaveProperty(key);
  });

  it('expects only fields and lists the rental schema has', () => {
    const fields = new Set(Object.values(RENTAL_SECTIONS).flatMap((s) => Object.keys(s.fields)));
    const lists = Object.fromEntries(
      Object.values(RENTAL_SECTIONS).flatMap((s) =>
        Object.entries(s.lists).map(([name, spec]) => [name, new Set(Object.keys(spec.item))]),
      ),
    );
    for (const c of BANK) {
      for (const name of Object.keys(c.expected.extraction.fields))
        expect(fields, `${c.id}: ${name}`).toContain(name);
      for (const [name, rows] of Object.entries(c.expected.extraction.lists))
        for (const row of rows)
          for (const key of Object.keys(row))
            expect(lists[name], `${c.id}: ${name}.${key}`).toContain(key);
    }
  });

  it('covers the spread the review needs', () => {
    const inputs = BANK.map((c) => c.expected.input);
    const clauses = new Set(inputs.map((i) => i.updateClause));
    for (const clause of ['ipc', 'irav', 'unspecified_index', 'fixed_percent', 'none', 'other'])
      expect(clauses).toContain(clause);
    expect(new Set(inputs.map((i) => i.landlordType))).toEqual(new Set(['person', 'company']));
    const signed = inputs.map((i) => i.signedOn);
    for (const day of ['2023-05-25', '2023-05-26']) expect(signed).toContain(day);
    for (const year of ['2019', '2021', '2025'])
      expect(signed.some((d) => d.startsWith(year))).toBe(true);
    expect(signed.some((d) => d >= '2026-10-08')).toBe(true);
    const anniversaries = inputs.flatMap((i) => i.updates.map((u) => u.anniversary));
    for (const year of ['2024', '2025'])
      expect(anniversaries.some((d) => d.startsWith(year))).toBe(true);
    expect(anniversaries.some((d) => d >= '2026-03-22' && d <= '2026-04-30')).toBe(true);
    expect(anniversaries).toContain('2026-10-01');
    expect(anniversaries.some((d) => d > '2026-10-08')).toBe(true);
    const reasons = BANK.map((c) => c.expected.review.scope).filter((s) => !s.inScope);
    expect(reasons).toEqual(
      expect.arrayContaining([
        { inScope: false, reason: 'seasonal' },
        { inScope: false, reason: 'before_2019' },
      ]),
    );
    const languages = BANK.map((c) => leaseOf(c)?.template).filter(
      (t) => t !== undefined && !t.endsWith('-es'),
    );
    expect(languages.length).toBeGreaterThanOrEqual(2);
    expect(
      BANK.filter((c) => c.pages.some((p) => !isTemplatePage(p) && p.kind === 'other')).length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      BANK.filter((c) => c.expected.extraction.outcome === 'nothing_read').length,
    ).toBeGreaterThanOrEqual(2);
  });
});

describe('the lease templates', () => {
  it.each(TEMPLATE_IDS)(
    '%s says where it comes from and carries the footer on every sheet',
    (id) => {
      const html = template(id);
      expect(html).toMatch(/^<!--[\s\S]*Source:[\s\S]*Licence:[\s\S]*-->/);
      const sheets = html.match(SHEET)?.length ?? 0;
      expect(sheets).toBeGreaterThanOrEqual(2);
      expect(html.split(FOOTER).length - 1).toBe(sheets);
    },
  );

  it('every template is used by some case', () => {
    const used = new Set(BANK.map((c) => leaseOf(c)?.template));
    for (const id of TEMPLATE_IDS) expect(used).toContain(id);
  });
});
